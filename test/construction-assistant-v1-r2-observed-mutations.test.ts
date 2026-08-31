import { describe, expect, it } from "vitest";
import { interpretConstructionMessage } from "../src/lib/construction-assistant-v1/interpreter";
import { admitLocalEnvelope } from "../src/lib/construction-assistant-v1/messaging";
import { buildActionFingerprint, verifyExactApproval } from "../src/lib/construction-assistant-v1/outbound";
import type { InterpreterContext } from "../src/lib/construction-assistant-v1/contracts";

const context: InterpreterContext = {
  referenceNow: "2026-08-31T13:00:00.000Z",
  locale: "fr-CA",
  timezone: "America/Toronto",
  projects: [{ id: "project-laval", code: "LAVAL-001", name: "Laval" }],
  contacts: [{ id: "contact-marc", displayName: "Marc", preferredLanguage: "fr" }],
};

const envelope = {
  schemaVersion: 1 as const,
  provider: "ENDVERA_LOCAL_SIMULATOR" as const,
  providerMessageId: "r2-founder-observed-001",
  channel: "SMS" as const,
  normalizedSender: "sim-sms:synthetic",
  body: "Le matériel de Laval est prêt pour mardi.",
  receivedAt: "2026-08-31T13:00:00.000Z",
  signatureValid: true,
};

describe("proportional observed-loop mutations", () => {
  it("clear-appointment-links-wrong-project", () => {
    const result = interpretConstructionMessage("Rendez-vous avec Marc mardi à 14 h pour Laval.", context);
    expect(result.projectId).toBe("project-laval");
    expect(result.projectId).not.toBe("project-other");
  });

  it("ambiguity-creates-calendar-item", () => {
    const result = interpretConstructionMessage("Rendez-vous avec Marc mardi à 2 pour Laval.", context);
    expect(result.intent).toBe("CLARIFICATION_REQUIRED");
    expect(result.startsAtUtc).toBeNull();
  });

  it("tomorrow-answer-uses-chat-transcript", () => {
    const result = interpretConstructionMessage("Qu’est-ce que j’ai demain?", context);
    expect(result.intent).toBe("CALENDAR_QUERY");
    expect(result.queryWindow).toEqual({ kind: "TOMORROW" });
    expect(result.title).toBeNull();
  });

  it("duplicate-event-creates-second-effect", () => {
    const first = admitLocalEnvelope({ envelope, identityVerified: true });
    const duplicate = admitLocalEnvelope({ envelope: { ...envelope, body: "contenu rejoué" }, identityVerified: true });
    expect(first.admitted && duplicate.admitted && duplicate.idempotencyKey).toBe(first.admitted && first.idempotencyKey);
  });

  it("replay-creates-second-delivery", () => {
    const action = { workspaceId: "workspace-1", actionId: "action-1", version: 2, contactId: "contact-marc", channel: "SMS" as const, normalizedRecipient: "+15555550184", body: "Je serai 30 minutes en retard." };
    const oldFingerprint = buildActionFingerprint({ ...action, version: 1 });
    expect(verifyExactApproval(action, { version: 1, fingerprint: oldFingerprint })).toEqual({ valid: false, reason: "STALE_VERSION" });
  });

  it("approval-hides-recipient-or-body", () => {
    const action = { workspaceId: "workspace-1", actionId: "action-1", version: 1, contactId: "contact-marc", channel: "SMS" as const, normalizedRecipient: "+15555550184", body: "Je serai 30 minutes en retard." };
    const fingerprint = buildActionFingerprint(action);
    expect(verifyExactApproval({ ...action, normalizedRecipient: "+15555559999" }, { version: 1, fingerprint })).toEqual({ valid: false, reason: "PAYLOAD_CHANGED" });
    expect(verifyExactApproval({ ...action, body: "Contenu caché" }, { version: 1, fingerprint })).toEqual({ valid: false, reason: "PAYLOAD_CHANGED" });
  });

  it("cross-workspace-result-is-visible", () => {
    const action = { workspaceId: "workspace-1", actionId: "action-1", version: 1, contactId: "contact-marc", channel: "SMS" as const, normalizedRecipient: "+15555550184", body: "Je serai 30 minutes en retard." };
    const fingerprint = buildActionFingerprint(action);
    expect(verifyExactApproval({ ...action, workspaceId: "workspace-2" }, { version: 1, fingerprint })).toEqual({ valid: false, reason: "PAYLOAD_CHANGED" });
  });
});
