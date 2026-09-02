import { describe, expect, it } from "vitest";
import {
  mobileHumanEscalationCommandSchema,
  mobileHumanEscalationResultSchema,
  parseMobileHumanEscalationCockpit,
} from "../src/lib/human-escalations";
import {
  enqueueMobileOutbox,
  loadMobileOutbox,
  transitionMobileOutbox,
  type SecureOutboxStore,
} from "../src/lib/outbox";

const base = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-01T12:00:00.000Z",
  workspaceId: "workspace-1",
  externalTransportPerformed: false as const,
};

const command = {
  schemaVersion: 1 as const,
  commandId: "734dfd6b-2de7-4f1d-8dd5-14cb33e01e1c",
  requestId: "734dfd6b-2de7-4f1d-8dd5-14cb33e01e1c",
  idempotencyKey: "734dfd6b-2de7-4f1d-8dd5-14cb33e01e1c",
  workspaceId: "workspace-1",
  action: "PREPARE" as const,
  projectId: "project-1",
  openLoopId: "loop-1",
  expectedStateVersion: 3,
  purpose: "OBTAIN_MISSING_EVIDENCE" as const,
  evidenceKind: "PHOTO" as const,
  acceptedClientPriceCents: 5_000,
  acceptedWorkerPayoutCents: 2_500,
  acceptedEstimatedMinutes: 30,
  acceptedCurrency: "CAD" as const,
};

describe("native R22 human-support contracts", () => {
  it("parses owner state and a deliberately empty field projection", () => {
    const owner = parseMobileHumanEscalationCockpit({
      ...base,
      role: "OWNER",
      eligibleLoops: [{
        loopId: "loop-1",
        projectId: "project-1",
        projectCode: "LAVAL-001",
        projectName: "Rénovation Laval",
        stateVersion: 3,
        missingEvidenceKinds: ["SUPPORTING_EVIDENCE"],
        nextAction: "Ajouter une preuve.",
      }],
      escalations: [],
    });
    const field = parseMobileHumanEscalationCockpit({
      ...base,
      role: "FIELD_WORKER",
      eligibleLoops: [],
      escalations: [],
      financialDataVisible: false,
    });
    expect(owner.role).toBe("OWNER");
    expect(owner.eligibleLoops).toHaveLength(1);
    expect(field).toMatchObject({
      role: "FIELD_WORKER",
      eligibleLoops: [],
      escalations: [],
      financialDataVisible: false,
    });
  });

  it("recursively refuses owner economics or worker identity in field data", () => {
    expect(() => parseMobileHumanEscalationCockpit({
      ...base,
      role: "FIELD_WORKER",
      eligibleLoops: [],
      escalations: [],
      financialDataVisible: false,
      nested: { acceptedClientPriceCents: 5_000 },
    })).toThrow("MOBILE_HUMAN_SUPPORT_FIELD_LEAK_REFUSED");
  });

  it("keeps prepare and withdraw commands strict and zero-transport", () => {
    expect(mobileHumanEscalationCommandSchema.parse(command)).toEqual(command);
    expect(() => mobileHumanEscalationCommandSchema.parse({ ...command, provider: "external" })).toThrow();
    expect(mobileHumanEscalationResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      action: command.action,
      escalationId: "escalation-1",
      state: "PREPARED",
      replayed: false,
      fundingRequired: true,
      externalTransportPerformed: false,
    }).externalTransportPerformed).toBe(false);
  });

  it("restores the exact human-support command after app restart", async () => {
    const values = new Map<string, string>();
    const store: SecureOutboxStore = {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
      deleteItemAsync: async (key) => { values.delete(key); },
    };
    const entry = await enqueueMobileOutbox({
      kind: "HUMAN_ESCALATION_COMMAND",
      command,
      store,
    });
    await transitionMobileOutbox({ entryId: entry.entryId, state: "SENDING", store });
    const restored = await loadMobileOutbox({ workspaceId: command.workspaceId, store });
    expect(restored[0]).toMatchObject({
      kind: "HUMAN_ESCALATION_COMMAND",
      state: "OUTCOME_UNKNOWN",
      automaticDispatchAllowed: false,
      command,
    });
  });
});
