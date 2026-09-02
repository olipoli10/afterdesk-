import { describe, expect, it } from "vitest";
import {
  authorityPolicyCockpitSchema,
  evaluateActionAuthorityCommandSchema,
  setPolicyRuleCommandSchema,
} from "../src/lib/construction-operating-assistant-r28/contracts";
import {
  AUTHORITY_ACTION_REGISTRY,
  authorityPolicyHash,
  mandatoryOutcomeForDefinition,
  stricterOutcome,
} from "../src/lib/construction-operating-assistant-r28/policy";

const hash = "a".repeat(64);

describe("R28 organization authority policy contracts", () => {
  it("keeps every external-effect-capable action at approval or prohibition", () => {
    for (const definition of AUTHORITY_ACTION_REGISTRY.values()) {
      if (!definition.externalEffectCapable) continue;
      expect(mandatoryOutcomeForDefinition(definition)).not.toBe("AUTOMATIC_INTERNAL");
    }
  });

  it("keeps payment, legal, credential and destructive actions prohibited", () => {
    for (const key of ["PAYMENT_INITIATE", "CONTRACT_SIGN", "CREDENTIAL_ACCESS", "DELETE_CANONICAL_RECORD"] as const) {
      expect(mandatoryOutcomeForDefinition(AUTHORITY_ACTION_REGISTRY.get(key)!)).toBe("PROHIBITED");
    }
  });

  it("uses the strictest applicable outcome", () => {
    expect(stricterOutcome("AUTOMATIC_INTERNAL", "APPROVAL_REQUIRED")).toBe("APPROVAL_REQUIRED");
    expect(stricterOutcome("APPROVAL_REQUIRED", "PROHIBITED")).toBe("PROHIBITED");
    expect(stricterOutcome("PROHIBITED", "AUTOMATIC_INTERNAL")).toBe("PROHIBITED");
  });

  it("hashes policy rules deterministically", () => {
    const first = authorityPolicyHash({ version: 1, rules: [
      { ruleKey: "B", actionKey: "SEND_SMS", projectId: null, roleScope: null, dataClassification: null, outcome: "APPROVAL_REQUIRED", amountCeilingMinor: null, reasonCode: "SEND_REVIEW" },
      { ruleKey: "A", actionKey: "INTERNAL_REMINDER_CREATE", projectId: null, roleScope: null, dataClassification: null, outcome: "AUTOMATIC_INTERNAL", amountCeilingMinor: null, reasonCode: "SAFE_INTERNAL" },
    ] });
    const second = authorityPolicyHash({ version: 1, rules: [
      { ruleKey: "A", actionKey: "INTERNAL_REMINDER_CREATE", projectId: null, roleScope: null, dataClassification: null, outcome: "AUTOMATIC_INTERNAL", amountCeilingMinor: null, reasonCode: "SAFE_INTERNAL" },
      { ruleKey: "B", actionKey: "SEND_SMS", projectId: null, roleScope: null, dataClassification: null, outcome: "APPROVAL_REQUIRED", amountCeilingMinor: null, reasonCode: "SEND_REVIEW" },
    ] });
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("refuses unknown evaluation fields and leaves semantic policy safety to the server", () => {
    expect(evaluateActionAuthorityCommandSchema.safeParse({
      schemaVersion: 1,
      commandId: "2b012332-7ed0-4fe8-ac4a-0c8e2caaf011",
      workspaceId: "workspace",
      action: "EVALUATE_ACTION_AUTHORITY",
      actionKey: "SEND_SMS",
      actionVersion: 1,
      projectId: null,
      targetRef: `authority_${hash}`,
      dataClassification: "CONFIDENTIAL",
      amountMinor: null,
      sourceFingerprint: hash,
      payloadHash: hash,
      expiresAt: "2027-09-02T00:00:00.000Z",
      externalTransportPerformed: false,
      externalWritePerformed: false,
      surprise: true,
    }).success).toBe(false);
    expect(setPolicyRuleCommandSchema.safeParse({
      schemaVersion: 1,
      commandId: "1d06dd2f-df46-4622-b1ef-668aa2ac7273",
      workspaceId: "workspace",
      action: "SET_POLICY_RULE",
      policySetId: "set",
      expectedStateVersion: 1,
      ruleKey: "SMS_AUTO",
      actionKey: "SEND_SMS",
      projectId: null,
      roleScope: null,
      dataClassification: null,
      outcome: "AUTOMATIC_INTERNAL",
      amountCeilingMinor: null,
      reasonCode: "UNSAFE",
    }).success).toBe(true);
  });

  it("rejects field projections that expose policy or exact evaluation details", () => {
    expect(authorityPolicyCockpitSchema.safeParse({
      schemaVersion: 1,
      workspaceId: "workspace",
      role: "field_worker",
      canManagePolicy: false,
      policySets: [],
      evaluations: [{
        id: "evaluation",
        evaluationVersion: 1,
        actorUserId: "leak",
        actionKey: "SEND_SMS",
        projectId: null,
        outcome: "APPROVAL_REQUIRED",
        reasonCode: "REVIEW",
        status: "PENDING_APPROVAL",
        payloadHash: hash,
        policySetVersion: 1,
        expiresAt: "2027-09-02T00:00:00.000Z",
        createdAt: "2026-09-02T00:00:00.000Z",
      }],
      counts: { policySets: 0, pendingApprovals: 1, prohibited: 0 },
      externalTransportPerformed: false,
      externalWritePerformed: false,
      providerEffectCount: 0,
    }).success).toBe(false);
  });
});
