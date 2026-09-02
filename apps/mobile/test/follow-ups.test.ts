import { describe, expect, it } from "vitest";
import {
  mobileFollowUpCommandSchema,
  mobileFollowUpResultSchema,
  parseMobileFollowUpQueue,
} from "../src/lib/follow-ups";
import {
  enqueueMobileOutbox,
  loadMobileOutbox,
  transitionMobileOutbox,
  type SecureOutboxStore,
} from "../src/lib/outbox";

const base = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-02T12:00:00.000Z",
  workspaceId: "workspace-1",
};

const attempt = {
  id: "attempt-1",
  attemptNumber: 1,
  status: "PREPARED_UNSENT" as const,
  dueAt: "2026-09-02T12:00:00.000Z",
  preparedAt: "2026-09-02T12:00:00.000Z",
  resolvedAt: null,
};

const followUp = {
  id: "follow-up-1",
  projectId: "project-1",
  projectCode: "LAVAL-001",
  projectName: "Rénovation Laval",
  contactId: "contact-1",
  contactName: "Marc",
  target: { kind: "JOB" as const, targetId: "job-1", label: "Livraison des fenêtres" },
  status: "AWAITING_RESPONSE" as const,
  dueAt: "2026-09-02T12:00:00.000Z",
  channel: "SMS" as const,
  body: "Confirme la livraison des fenêtres.",
  owner: { kind: "MEMBER" as const, ownerId: "owner-1", displayName: "Olivier" },
  nextDecision: "Attendre la confirmation de Marc.",
  policy: {
    maxAttempts: 3,
    retryIntervalMinutes: 60,
    escalateAfterAttempts: 1,
    escalationOwner: null,
  },
  attempt: 1,
  escalationLevel: 0,
  version: 2,
  attempts: [attempt],
};

describe("native R20 follow-up contracts", () => {
  it("accepts managed owner and field-safe queues", () => {
    const owner = parseMobileFollowUpQueue({ ...base, role: "OWNER", followUps: [followUp] });
    const field = parseMobileFollowUpQueue({
      ...base,
      role: "FIELD_WORKER",
      followUps: [{
        id: "follow-up-1",
        projectId: "project-1",
        projectCode: "LAVAL-001",
        projectName: "Rénovation Laval",
        contactName: "Marc",
        targetKind: "JOB",
        status: "AWAITING_RESPONSE",
        dueAt: "2026-09-02T12:00:00.000Z",
        nextDecision: "Confirmer la livraison.",
        attempt: 1,
      }],
    });
    expect(owner.role).toBe("OWNER");
    expect("owner" in owner.followUps[0] ? owner.followUps[0].owner.displayName : null).toBe("Olivier");
    expect(field.followUps[0].nextDecision).toBe("Confirmer la livraison.");
  });

  it("recursively refuses financial, message and provenance leaks in field projections", () => {
    const field = {
      ...base,
      role: "FIELD_WORKER",
      followUps: [{
        id: "follow-up-1",
        projectId: "project-1",
        projectCode: "LAVAL-001",
        projectName: "Rénovation Laval",
        contactName: "Marc",
        targetKind: "JOB",
        status: "SCHEDULED",
        dueAt: "2026-09-02T12:00:00.000Z",
        nextDecision: "Confirmer la livraison.",
        attempt: 0,
      }],
    };
    expect(() => parseMobileFollowUpQueue({ ...field, followUps: [{ ...field.followUps[0], body: "secret" }] })).toThrow("MOBILE_FOLLOW_UP_FIELD_LEAK_REFUSED");
    expect(() => parseMobileFollowUpQueue({ ...field, followUps: [{ ...field.followUps[0], amountMinor: 120_000 }] })).toThrow("MOBILE_FOLLOW_UP_FIELD_LEAK_REFUSED");
    expect(() => parseMobileFollowUpQueue({ ...field, followUps: [{ ...field.followUps[0], sourceRef: "evidence-1" }] })).toThrow("MOBILE_FOLLOW_UP_FIELD_LEAK_REFUSED");
  });

  it("accepts only strict local outcome commands and zero-transport results", () => {
    const command = mobileFollowUpCommandSchema.parse({
      schemaVersion: 1,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      followUpId: "follow-up-1",
      expectedVersion: 2,
      action: "RECORD_OUTCOME",
      attemptId: "attempt-1",
      outcome: "NO_RESPONSE",
      occurredAt: "2026-09-02T12:15:00.000Z",
    });
    expect(() => mobileFollowUpCommandSchema.parse({ ...command, provider: "twilio" })).toThrow();
    const result = mobileFollowUpResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      action: command.action,
      followUpId: command.followUpId,
      attemptId: "attemptId" in command ? command.attemptId : null,
      status: "ESCALATED",
      version: 3,
      owner: { kind: "MEMBER", ownerId: "manager-1" },
      nextDecision: "Responsable escaladé.",
      nextDueAt: "2026-09-02T13:15:00.000Z",
      disposition: "ESCALATED",
      applied: true,
      replayed: false,
      externalTransportPerformed: false,
    });
    expect(result.externalTransportPerformed).toBe(false);
  });

  it("restores the exact follow-up command after an interrupted attempt", async () => {
    const values = new Map<string, string>();
    const store: SecureOutboxStore = {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
      deleteItemAsync: async (key) => { values.delete(key); },
    };
    const command = mobileFollowUpCommandSchema.parse({
      schemaVersion: 1,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      followUpId: "follow-up-1",
      expectedVersion: 2,
      action: "RECORD_OUTCOME",
      attemptId: "attempt-1",
      outcome: "RESOLVED",
      occurredAt: "2026-09-02T12:15:00.000Z",
    });
    const entry = await enqueueMobileOutbox({ kind: "FOLLOW_UP_COMMAND", command, store });
    await transitionMobileOutbox({ entryId: entry.entryId, state: "SENDING", store });
    const restored = await loadMobileOutbox({ workspaceId: "workspace-1", store });
    expect(restored[0]).toMatchObject({
      kind: "FOLLOW_UP_COMMAND",
      state: "OUTCOME_UNKNOWN",
      automaticDispatchAllowed: false,
      command,
    });
  });
});
