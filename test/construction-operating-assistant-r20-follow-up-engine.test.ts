import { describe, expect, it } from "vitest";
import {
  followUpEngineCommandSchema,
  managedFollowUpPolicySchema,
} from "@/lib/construction-operating-assistant-r20/contracts";
import {
  decideNoResponse,
  rejectFieldFollowUpLeaks,
} from "@/lib/construction-operating-assistant-r20/policy";

const policy = {
  maxAttempts: 4,
  retryIntervalMinutes: 60,
  escalateAfterAttempts: 2,
  escalationOwner: { kind: "MEMBER" as const, ownerId: "office-user" },
};

describe("Construction Operating Assistant R20 follow-up contracts", () => {
  it("accepts one strict managed follow-up command", () => {
    expect(followUpEngineCommandSchema.parse({
      schemaVersion: 1,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace",
      action: "CREATE_FOLLOW_UP",
      projectId: "project",
      contactId: "contact",
      target: { kind: "JOB", jobId: "job" },
      dueAt: "2026-09-02T14:00:00.000Z",
      channel: "INTERNAL",
      body: "Confirmer que le matériel est arrivé.",
      owner: { kind: "MEMBER", ownerId: "owner" },
      nextDecision: "Confirmer si le travail peut commencer.",
      policy,
    }).action).toBe("CREATE_FOLLOW_UP");
  });

  it("refuses an escalation threshold after the final attempt", () => {
    expect(() => managedFollowUpPolicySchema.parse({
      ...policy,
      maxAttempts: 2,
      escalateAfterAttempts: 3,
    })).toThrow("Escalation cannot occur after the final attempt");
  });

  it("retries before the threshold", () => {
    expect(decideNoResponse({
      policy,
      attempt: 1,
      escalationLevel: 0,
      occurredAt: "2026-09-02T14:00:00.000Z",
    })).toEqual({
      status: "SCHEDULED",
      useEscalationOwner: false,
      nextDueAt: "2026-09-02T15:00:00.000Z",
    });
  });

  it("escalates exactly once at the threshold", () => {
    expect(decideNoResponse({
      policy,
      attempt: 2,
      escalationLevel: 0,
      occurredAt: "2026-09-02T14:00:00.000Z",
    })).toEqual({
      status: "ESCALATED",
      useEscalationOwner: true,
      nextDueAt: "2026-09-02T15:00:00.000Z",
    });
    expect(decideNoResponse({
      policy,
      attempt: 3,
      escalationLevel: 1,
      occurredAt: "2026-09-02T14:00:00.000Z",
    }).status).toBe("SCHEDULED");
  });

  it("requires an owner decision after the last attempt", () => {
    expect(decideNoResponse({
      policy,
      attempt: 4,
      escalationLevel: 1,
      occurredAt: "2026-09-02T14:00:00.000Z",
    })).toEqual({
      status: "DECISION_REQUIRED",
      useEscalationOwner: false,
      nextDueAt: null,
    });
  });

  it("recursively refuses financial and provenance fields in field projections", () => {
    expect(() => rejectFieldFollowUpLeaks({ followUps: [{ body: "Facture 184" }] }))
      .toThrow("FOLLOW_UP_FIELD_LEAK_REFUSED");
    expect(() => rejectFieldFollowUpLeaks({ followUps: [{ id: "follow-up", nextDecision: "Confirmer la livraison" }] }))
      .not.toThrow();
  });
});
