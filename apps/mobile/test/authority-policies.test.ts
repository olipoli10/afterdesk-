import { describe, expect, it } from "vitest";
import {
  mobileAuthorityDecisionCommandSchema,
  mobileAuthorityPolicyCommandSchema,
  parseMobileAuthorityCockpit,
} from "../src/lib/authority-policies";
import {
  enqueueMobileOutbox,
  loadMobileOutbox,
  transitionMobileOutbox,
  type SecureOutboxStore,
} from "../src/lib/outbox";

function memoryStore(): SecureOutboxStore {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
    deleteItemAsync: async (key) => { values.delete(key); },
  };
}

const workspaceId = "workspace-r28";
const hash = "a".repeat(64);

describe("R28 mobile authority policies", () => {
  it("restores an interrupted policy command byte-for-byte without automatic dispatch", async () => {
    const store = memoryStore();
    const command = mobileAuthorityPolicyCommandSchema.parse({
      schemaVersion: 1,
      action: "CREATE_POLICY_DRAFT",
      commandId: "00000000-0000-4000-8000-000000000128",
      workspaceId,
      sourcePolicySetId: null,
      expectedSourceStateVersion: null,
    });
    const queued = await enqueueMobileOutbox({ kind: "AUTHORITY_POLICY_COMMAND", command, store });
    await transitionMobileOutbox({ entryId: queued.entryId, state: "SENDING", store });
    const restored = await loadMobileOutbox({ workspaceId, store });
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      kind: "AUTHORITY_POLICY_COMMAND",
      state: "OUTCOME_UNKNOWN",
      automaticDispatchAllowed: false,
      command,
    });
  });

  it("binds a decision to the exact evaluation, policy version and payload hash", () => {
    expect(mobileAuthorityDecisionCommandSchema.safeParse({
      schemaVersion: 1,
      action: "DECIDE_AUTHORITY_EVALUATION",
      commandId: "00000000-0000-4000-8000-000000000129",
      workspaceId,
      evaluationId: "evaluation-1",
      expectedEvaluationVersion: 3,
      expectedPolicySetVersion: 7,
      expectedPayloadHash: hash,
      decision: "APPROVE",
    }).success).toBe(true);
    expect(mobileAuthorityDecisionCommandSchema.safeParse({
      schemaVersion: 1,
      action: "DECIDE_AUTHORITY_EVALUATION",
      commandId: "00000000-0000-4000-8000-000000000129",
      workspaceId,
      evaluationId: "evaluation-1",
      expectedEvaluationVersion: 3,
      expectedPolicySetVersion: 7,
      expectedPayloadHash: "wrong",
      decision: "APPROVE",
    }).success).toBe(false);
  });

  it("accepts an owner cockpit with exact pending-decision context", () => {
    const parsed = parseMobileAuthorityCockpit({
      schemaVersion: 1,
      workspaceId,
      role: "owner",
      canManagePolicy: true,
      policySets: [{
        id: "policy-1",
        version: 1,
        stateVersion: 2,
        status: "ACTIVE",
        policyHash: hash,
        rules: [],
        createdAt: "2026-09-02T05:00:00.000Z",
      }],
      evaluations: [{
        id: "evaluation-1",
        evaluationVersion: 1,
        actorUserId: "owner-1",
        actionKey: "SEND_SMS",
        projectId: "project-1",
        outcome: "APPROVAL_REQUIRED",
        reasonCode: "BASELINE_APPROVAL_REQUIRED",
        status: "PENDING_APPROVAL",
        payloadHash: hash,
        policySetVersion: 1,
        expiresAt: "2027-09-02T05:00:00.000Z",
        createdAt: "2026-09-02T05:00:00.000Z",
      }],
      counts: { policySets: 1, pendingApprovals: 1, prohibited: 0 },
      externalTransportPerformed: false,
      externalWritePerformed: false,
      providerEffectCount: 0,
    });
    expect(parsed.evaluations[0]).toMatchObject({ actionKey: "SEND_SMS", evaluationVersion: 1, payloadHash: hash });
  });

  it("refuses policy and exact decision details in a field-worker projection", () => {
    const base = {
      schemaVersion: 1,
      workspaceId,
      role: "field_worker",
      canManagePolicy: false,
      policySets: [],
      evaluations: [],
      counts: { policySets: 0, pendingApprovals: 0, prohibited: 0 },
      externalTransportPerformed: false,
      externalWritePerformed: false,
      providerEffectCount: 0,
    };
    expect(parseMobileAuthorityCockpit(base).role).toBe("field_worker");
    expect(() => parseMobileAuthorityCockpit({
      ...base,
      evaluations: [{
        id: "evaluation-1", evaluationVersion: 1, actorUserId: null, actionKey: null, projectId: null,
        outcome: "APPROVAL_REQUIRED", reasonCode: "REVIEW", status: "PENDING_APPROVAL",
        payloadHash: null, policySetVersion: null, expiresAt: null, createdAt: "2026-09-02T05:00:00.000Z",
      }],
    })).toThrow();
  });
});
