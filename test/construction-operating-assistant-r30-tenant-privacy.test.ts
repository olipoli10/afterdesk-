import { describe, expect, it } from "vitest";
import {
  privacyCockpitSchema,
  privacyCommandSchema,
  rejectFieldPrivacyLeaks,
} from "@/lib/construction-operating-assistant-r30/contracts";
import {
  PRIVACY_DATA_CLASSES,
  assertCompletePrivacyRules,
  baselinePrivacyRules,
  privacyPolicyHash,
} from "@/lib/construction-operating-assistant-r30/policy";

describe("R30 tenant privacy contracts", () => {
  it("defines one complete deterministic baseline for every closed data class", () => {
    const first = baselinePrivacyRules();
    const second = [...first].reverse();
    expect(first.map((rule) => rule.dataClass)).toEqual(PRIVACY_DATA_CLASSES);
    expect(new Set(first.map((rule) => rule.dataClass)).size).toBe(8);
    expect(privacyPolicyHash(1, first)).toBe(privacyPolicyHash(1, second));
    expect(() => assertCompletePrivacyRules(first.slice(1))).toThrow("PRIVACY_POLICY_INCOMPLETE");
  });

  it("refuses deletion rules for protected financial, audit and human-work classes", () => {
    for (const dataClass of ["FINANCIAL", "AUDIT", "HUMAN_WORK"] as const) {
      const unsafe = baselinePrivacyRules().map((rule) =>
        rule.dataClass === dataClass ? { ...rule, deletionMode: "TOMBSTONE_WHEN_ELIGIBLE" as const } : rule,
      );
      expect(() => assertCompletePrivacyRules(unsafe)).toThrow("PRIVACY_POLICY_PROTECTED_CLASS_DELETION");
    }
  });

  it("keeps commands closed and version-bound", () => {
    const command = {
      schemaVersion: 1,
      action: "REQUEST_DELETION",
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-a",
      expectedPolicySetId: "policy-a",
      expectedPolicySetVersion: 1,
      targetType: "OPEN_LOOP_EVIDENCE",
      targetId: "evidence-a",
    };
    expect(privacyCommandSchema.safeParse(command).success).toBe(true);
    expect(privacyCommandSchema.safeParse({ ...command, targetType: "*" }).success).toBe(false);
    expect(privacyCommandSchema.safeParse({ ...command, rawSecret: "forbidden" }).success).toBe(false);
    expect(privacyCommandSchema.safeParse({ ...command, expectedPolicySetVersion: 0 }).success).toBe(false);
  });

  it("accepts the minimized field schema and recursively refuses privacy leaks", () => {
    const field = {
      schemaVersion: 1 as const,
      generatedAt: "2026-09-02T06:30:00.000Z",
      workspace: { id: "workspace-a", name: "ENDVERA Construction" },
      role: "FIELD_WORKER" as const,
      ownAccess: {
        membershipStatus: "ACTIVE" as const,
        accessClass: "PROJECT_ASSIGNED_ONLY" as const,
        canManagePrivacy: false as const,
      },
      externalEffectCount: 0 as const,
    };
    expect(privacyCockpitSchema.parse(field)).toEqual(field);
    for (const leak of [
      { nested: { amountMinor: 120_000 } },
      { nested: { credentialRef: "secret-ref" } },
      { nested: { targetId: "evidence-a" } },
      { nested: { retentionDays: 365 } },
    ]) expect(() => rejectFieldPrivacyLeaks(leak)).toThrow("FIELD_PRIVACY_LEAK_REFUSED");
  });

  it("does not confuse a local tombstone with observed external deletion", () => {
    const invalidOwner = {
      schemaVersion: 1,
      generatedAt: "2026-09-02T06:30:00.000Z",
      workspace: { id: "workspace-a", name: "ENDVERA Construction" },
      role: "OWNER",
      activePolicy: null,
      policyHistory: [],
      inventory: baselinePrivacyRules().map((rule) => ({ ...rule, recordCount: 0 })),
      secretLifecycle: { absent: 0, opaqueReference: 0, revoked: 0, externallyRevokedVerified: 1 },
      evidenceLifecycle: { active: 0, held: 0, retentionDue: 0, tombstoned: 1, externalDeletionPending: 0 },
      exportManifests: [],
      deletionRequests: [],
      refusalCount: 0,
      externalEffectCount: 0,
    };
    expect(privacyCockpitSchema.safeParse(invalidOwner).success).toBe(false);
  });
});
