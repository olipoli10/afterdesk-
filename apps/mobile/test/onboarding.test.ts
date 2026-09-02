import { describe, expect, it } from "vitest";
import { mobileOnboardingCommandSchema, parseMobileOnboardingCockpit } from "../src/lib/onboarding";

describe("R32 native onboarding", () => {
  it("accepts initialization without a caller-supplied actor or workspace", () => {
    const command = { schemaVersion: 1, action: "INITIALIZE_WORKSPACE", commandId: "00000000-0000-4000-8000-000000000132", name: "Construction Laval", timezone: "America/Toronto", locale: "fr-CA" };
    expect(mobileOnboardingCommandSchema.safeParse(command).success).toBe(true);
    expect(mobileOnboardingCommandSchema.safeParse({ ...command, actorId: "owner-a" }).success).toBe(false);
    expect(mobileOnboardingCommandSchema.safeParse({ ...command, providerEnabled: true }).success).toBe(false);
  });

  it("binds decisions and commits to exact preview versions and hashes", () => {
    const decision = { schemaVersion: 1, action: "DECIDE_IMPORT_ROW", commandId: "00000000-0000-4000-8000-000000000232", workspaceId: "workspace-a", batchId: "batch-a", rowId: "row-a", expectedBatchVersion: 2, decision: "USE_EXISTING", matchedCanonicalId: "contact-a" };
    expect(mobileOnboardingCommandSchema.safeParse(decision).success).toBe(true);
    expect(mobileOnboardingCommandSchema.safeParse({ ...decision, decision: "CREATE_NEW", matchedCanonicalId: undefined }).success).toBe(true);
    expect(mobileOnboardingCommandSchema.safeParse({ ...decision, matchedCanonicalId: undefined }).success).toBe(false);
    expect(mobileOnboardingCommandSchema.safeParse({ ...decision, decision: "MERGE" }).success).toBe(false);
    const commit = { schemaVersion: 1, action: "COMMIT_IMPORT", commandId: "00000000-0000-4000-8000-000000000332", workspaceId: "workspace-a", batchId: "batch-a", expectedBatchVersion: 3, sourceHash: "a".repeat(64), previewFingerprint: "b".repeat(64) };
    expect(mobileOnboardingCommandSchema.safeParse(commit).success).toBe(true);
    expect(mobileOnboardingCommandSchema.safeParse({ ...commit, sourceHash: "changed" }).success).toBe(false);
  });

  it("keeps the field projection independent and minimized", () => {
    const field = { schemaVersion: 1, generatedAt: "2026-09-02T10:00:00.000Z", role: "FIELD_WORKER", workspace: { id: "workspace-a", name: "Laval" }, assignedProjects: [], nextAction: "WAIT_FOR_ASSIGNMENT", providerObserved: false, externalEffectCount: 0 };
    expect(parseMobileOnboardingCockpit(field).role).toBe("FIELD_WORKER");
    expect(() => parseMobileOnboardingCockpit({ ...field, activeBatch: { rowCount: 1 } })).toThrow();
    expect(() => parseMobileOnboardingCockpit({ ...field, contacts: [] })).toThrow();
  });
});
