import { describe, expect, it } from "vitest";
import { mobilePrivacyCommandSchema, parseMobilePrivacyCockpit } from "../src/lib/privacy";
import { enqueueMobileOutbox, loadMobileOutbox, transitionMobileOutbox, type SecureOutboxStore } from "../src/lib/outbox";

const workspaceId = "workspace-r30";
const hash = "a".repeat(64);
function memoryStore(): SecureOutboxStore {
  const values = new Map<string, string>();
  return { getItemAsync: async (key) => values.get(key) ?? null, setItemAsync: async (key, value) => { values.set(key, value); }, deleteItemAsync: async (key) => { values.delete(key); } };
}

describe("R30 native tenant privacy", () => {
  it("retains one stable privacy command for explicit retry only", async () => {
    const store = memoryStore();
    const command = mobilePrivacyCommandSchema.parse({ schemaVersion: 1, action: "CREATE_POLICY_DRAFT", commandId: "00000000-0000-4000-8000-000000000130", workspaceId, sourcePolicySetId: null, expectedSourceStateVersion: null });
    const queued = await enqueueMobileOutbox({ kind: "PRIVACY_COMMAND", command, store });
    await transitionMobileOutbox({ entryId: queued.entryId, state: "SENDING", store });
    expect(await loadMobileOutbox({ workspaceId, store })).toMatchObject([{ kind: "PRIVACY_COMMAND", state: "OUTCOME_UNKNOWN", automaticDispatchAllowed: false, command }]);
  });

  it("binds deletion approval to exact state and eligibility", () => {
    const command = { schemaVersion: 1, action: "APPROVE_DELETION", commandId: "00000000-0000-4000-8000-000000000131", workspaceId, deletionRequestId: "request-1", expectedStateVersion: 1, expectedEligibilityFingerprint: hash };
    expect(mobilePrivacyCommandSchema.safeParse(command).success).toBe(true);
    expect(mobilePrivacyCommandSchema.safeParse({ ...command, expectedEligibilityFingerprint: "wrong" }).success).toBe(false);
    expect(mobilePrivacyCommandSchema.safeParse({ ...command, automaticApproval: true }).success).toBe(false);
  });

  it("accepts a minimized field projection and refuses protected fields", () => {
    const field = { schemaVersion: 1, generatedAt: "2026-09-02T06:30:00.000Z", workspace: { id: workspaceId, name: "R30" }, role: "FIELD_WORKER", ownAccess: { membershipStatus: "ACTIVE", accessClass: "PROJECT_ASSIGNED_ONLY", canManagePrivacy: false }, externalEffectCount: 0 };
    expect(parseMobilePrivacyCockpit(field).role).toBe("FIELD_WORKER");
    expect(() => parseMobilePrivacyCockpit({ ...field, inventory: [] })).toThrow();
    expect(() => parseMobilePrivacyCockpit({ ...field, nested: { amountMinor: 120_000 } })).toThrow();
  });

  it("requires zero external effects and zero claimed remote secret revocation", () => {
    const owner = { schemaVersion: 1, generatedAt: "2026-09-02T06:30:00.000Z", workspace: { id: workspaceId, name: "R30" }, role: "OWNER", activePolicy: null, policyHistory: [], inventory: ["IDENTITY", "COMMUNICATION", "PROJECT_STATE", "EVIDENCE", "FINANCIAL", "CONNECTOR_METADATA", "AUDIT", "HUMAN_WORK"].map((dataClass) => ({ dataClass, recordCount: 0, retentionDays: 365, deletionMode: "RETAIN" })), secretLifecycle: { absent: 0, opaqueReference: 0, revoked: 0, externallyRevokedVerified: 0 }, evidenceLifecycle: { active: 0, held: 0, retentionDue: 0, tombstoned: 0, externalDeletionPending: 0 }, exportManifests: [], deletionCandidates: [], deletionRequests: [], refusalCount: 0, externalEffectCount: 0 };
    expect(parseMobilePrivacyCockpit(owner).role).toBe("OWNER");
    expect(() => parseMobilePrivacyCockpit({ ...owner, externalEffectCount: 1 })).toThrow();
    expect(() => parseMobilePrivacyCockpit({ ...owner, secretLifecycle: { ...owner.secretLifecycle, externallyRevokedVerified: 1 } })).toThrow();
  });
});
