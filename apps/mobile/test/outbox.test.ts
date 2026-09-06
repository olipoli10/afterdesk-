import { describe, expect, it } from "vitest";
import {
  clearMobileOutbox,
  discardMobileOutboxEntry,
  enqueueMobileOutbox,
  loadMobileOutbox,
  transitionMobileOutbox,
  type SecureOutboxStore,
} from "../src/lib/outbox";

function memoryStore() {
  const values = new Map<string, string>();
  const store: SecureOutboxStore = {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
  };
  return { store, values };
}

function assistantCommand(input: {
  requestId?: string;
  workspaceId?: string;
  message?: string;
} = {}) {
  return {
    schemaVersion: 1 as const,
    requestId: input.requestId ?? "00000000-0000-4000-8000-000000000117",
    workspaceId: input.workspaceId ?? "workspace-1",
    message: input.message ?? "Qu’est-ce qui doit avancer aujourd’hui?",
    occurredAt: "2026-09-01T23:00:00.000Z",
  };
}

function broadcastApprovalCommand(input: { commandId?: string; payloadHash?: string } = {}) {
  return {
    schemaVersion: 1 as const,
    action: "APPROVE_SECRETARY_BROADCAST" as const,
    commandId: input.commandId ?? "00000000-0000-4000-8000-000000000120",
    workspaceId: "workspace-1",
    draftId: "draft-1",
    expectedVersion: 1,
    expectedPayloadHash: input.payloadHash ?? "a".repeat(64),
    approvalStatementAccepted: true as const,
  };
}

describe("R17 protected mobile outbox", () => {
  it("restores an interrupted send after restart with the exact stable command", async () => {
    const { store } = memoryStore();
    const command = assistantCommand();
    const queued = await enqueueMobileOutbox({
      kind: "ASSISTANT_REQUEST",
      command,
      store,
    });
    await transitionMobileOutbox({ entryId: queued.entryId, state: "SENDING", store });

    const restored = await loadMobileOutbox({ workspaceId: "workspace-1", store });

    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      entryId: command.requestId,
      workspaceId: command.workspaceId,
      state: "OUTCOME_UNKNOWN",
      automaticDispatchAllowed: false,
      command,
    });
  });

  it("reuses one entry for an exact retry and refuses identifier drift", async () => {
    const { store } = memoryStore();
    const command = assistantCommand();
    const first = await enqueueMobileOutbox({ kind: "ASSISTANT_REQUEST", command, store });
    const exactReplay = await enqueueMobileOutbox({ kind: "ASSISTANT_REQUEST", command, store });
    expect(exactReplay).toEqual(first);

    await expect(
      enqueueMobileOutbox({
        kind: "ASSISTANT_REQUEST",
        command: { ...command, message: "Une autre commande" },
        store,
      }),
    ).rejects.toThrow("MOBILE_OUTBOX_IDEMPOTENCY_CONFLICT");

    await transitionMobileOutbox({ entryId: first.entryId, state: "SENDING", store });
    await transitionMobileOutbox({ entryId: first.entryId, state: "REPLAYED", store });
    const loaded = await loadMobileOutbox({ workspaceId: "workspace-1", store });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.state).toBe("REPLAYED");
  });

  it("isolates workspaces and clears every retained entry before sign-out", async () => {
    const { store, values } = memoryStore();
    await enqueueMobileOutbox({
      kind: "ASSISTANT_REQUEST",
      command: assistantCommand(),
      store,
    });
    await enqueueMobileOutbox({
      kind: "ASSISTANT_REQUEST",
      command: assistantCommand({
        requestId: "00000000-0000-4000-8000-000000000118",
        workspaceId: "workspace-2",
      }),
      store,
    });

    expect((await loadMobileOutbox({ workspaceId: "workspace-1", store })).map((entry) => entry.workspaceId)).toEqual([
      "workspace-1",
    ]);
    expect((await loadMobileOutbox({ workspaceId: "workspace-2", store })).map((entry) => entry.workspaceId)).toEqual([
      "workspace-2",
    ]);

    await clearMobileOutbox(store);
    expect(values.size).toBe(0);
    expect(await loadMobileOutbox({ workspaceId: "workspace-1", store })).toEqual([]);
  });

  it("fails closed on corrupt, oversized and forbidden state changes", async () => {
    const corrupt = memoryStore();
    corrupt.values.set("endvera.mobile.outbox.v1.index", "{not-json");
    await expect(loadMobileOutbox({ workspaceId: "workspace-1", store: corrupt.store })).rejects.toThrow(
      "MOBILE_OUTBOX_INDEX_CORRUPT",
    );

    const oversized = memoryStore();
    await expect(
      enqueueMobileOutbox({
        kind: "ASSISTANT_REQUEST",
        command: assistantCommand({ message: "x".repeat(9_000) }),
        store: oversized.store,
      }),
    ).rejects.toThrow("MOBILE_OUTBOX_ENTRY_TOO_LARGE");

    const terminal = memoryStore();
    const entry = await enqueueMobileOutbox({
      kind: "ASSISTANT_REQUEST",
      command: assistantCommand(),
      store: terminal.store,
    });
    await transitionMobileOutbox({ entryId: entry.entryId, state: "SENDING", store: terminal.store });
    await transitionMobileOutbox({ entryId: entry.entryId, state: "CONFIRMED", store: terminal.store });
    await expect(
      transitionMobileOutbox({ entryId: entry.entryId, state: "SENDING", store: terminal.store }),
    ).rejects.toThrow("MOBILE_OUTBOX_TRANSITION_REFUSED");
  });

  it("supports an explicit local discard without changing another entry", async () => {
    const { store } = memoryStore();
    const first = await enqueueMobileOutbox({
      kind: "ASSISTANT_REQUEST",
      command: assistantCommand(),
      store,
    });
    const second = await enqueueMobileOutbox({
      kind: "ASSISTANT_REQUEST",
      command: assistantCommand({ requestId: "00000000-0000-4000-8000-000000000119" }),
      store,
    });

    await expect(discardMobileOutboxEntry({ entryId: first.entryId, store })).resolves.toBe(true);
    await expect(discardMobileOutboxEntry({ entryId: first.entryId, store })).resolves.toBe(false);
    expect((await loadMobileOutbox({ workspaceId: "workspace-1", store })).map((entry) => entry.entryId)).toEqual([
      second.entryId,
    ]);
  });

  it("retains one exact group-text approval command through restart and retry", async () => {
    const { store } = memoryStore();
    const command = broadcastApprovalCommand();
    const queued = await enqueueMobileOutbox({
      kind: "SECRETARY_BROADCAST_APPROVAL",
      command,
      store,
    });
    await transitionMobileOutbox({ entryId: queued.entryId, state: "SENDING", store });

    const [restored] = await loadMobileOutbox({ workspaceId: command.workspaceId, store });
    expect(restored).toMatchObject({
      kind: "SECRETARY_BROADCAST_APPROVAL",
      state: "OUTCOME_UNKNOWN",
      command,
      automaticDispatchAllowed: false,
    });

    const exactRetry = await enqueueMobileOutbox({
      kind: "SECRETARY_BROADCAST_APPROVAL",
      command,
      store,
    });
    expect(exactRetry.command).toEqual(command);
    await expect(enqueueMobileOutbox({
      kind: "SECRETARY_BROADCAST_APPROVAL",
      command: broadcastApprovalCommand({ payloadHash: "b".repeat(64) }),
      store,
    })).rejects.toThrow("MOBILE_OUTBOX_IDEMPOTENCY_CONFLICT");
  });
});
