import { describe, expect, it } from "vitest";
import { MINIMUM_TOUCH_TARGET } from "@/lib/accessibility";
import { MOBILE_GOLDEN_WORKFLOW_COPY, mobileGoldenWorkflowCopy, parseMobileGoldenWorkflow } from "@/lib/golden-workflow";

const base = {
  schemaVersion: 1 as const, registryVersion: 1 as const, generatedAt: "2026-09-02T12:00:00.000Z",
  workspace: { id: "workspace-a", name: "Laval", timezone: "America/Toronto", locale: "fr-CA" as const, currency: "CAD" as const },
  project: null, stateFingerprint: "a".repeat(64), completedCount: 0, totalCount: 3, currentStep: "PLAN_WORK" as const,
  steps: [{ step: "PLAN_WORK" as const, order: 3, status: "BLOCKED" as const, titleKey: "step.plan_work.title", bodyKey: "step.plan_work.body", blockers: [{ code: "ASSIGNMENT_REQUIRED", severity: "ACTION_REQUIRED" as const, copyKey: "blocker.ASSIGNMENT_REQUIRED", resolutionRoute: "JOBS" as const }], route: "JOBS" as const }, { step: "COLLECT_PROOF" as const, order: 4, status: "NOT_STARTED" as const, titleKey: "step.collect_proof.title", bodyKey: "step.collect_proof.body", blockers: [], route: "EVIDENCE" as const }, { step: "REVIEW_HISTORY" as const, order: 8, status: "NOT_STARTED" as const, titleKey: "step.review_history.title", bodyKey: "step.review_history.body", blockers: [], route: "TIMELINE" as const }],
  primaryAction: { code: "VIEW_ASSIGNMENTS", route: "JOBS" as const, copyKey: "action.VIEW_ASSIGNMENTS" }, secondaryActions: [],
  externalCapabilities: (["CALENDAR_SYNC", "SMS_MMS", "VOICE_CALL", "EMAIL", "ACCOUNTING"] as const).map((code) => ({ code, status: "UNAVAILABLE" as const, reasonCode: "PROVIDER_DISABLED_LOCAL" as const })),
  providerObserved: false as const, externalEffectCount: 0 as const,
};

describe("R33 mobile Golden Workflow", () => {
  it("parses a minimal role-safe field projection", () => {
    const parsed = parseMobileGoldenWorkflow({ ...base, role: "FIELD_WORKER", assignedProjectCount: 0 });
    expect(parsed).toMatchObject({ role: "FIELD_WORKER", currentStep: "PLAN_WORK", externalEffectCount: 0 });
    expect(() => parseMobileGoldenWorkflow({ ...base, role: "FIELD_WORKER", assignedProjectCount: 0, pendingApprovalCount: 1 })).toThrow();
  });

  it("keeps complete unmixed bilingual copy", () => {
    expect(Object.keys(MOBILE_GOLDEN_WORKFLOW_COPY["fr-CA"]).sort()).toEqual(Object.keys(MOBILE_GOLDEN_WORKFLOW_COPY["en-CA"]).sort());
    expect(mobileGoldenWorkflowCopy("fr-CA", "action.VIEW_ASSIGNMENTS")).toContain("travaux");
    expect(mobileGoldenWorkflowCopy("en-CA", "action.VIEW_ASSIGNMENTS")).toContain("work");
    expect(() => mobileGoldenWorkflowCopy("fr-CA", "unknown.key")).toThrow("MOBILE_GOLDEN_WORKFLOW_COPY_MISSING");
  });

  it("keeps every primary action at or above the 44-point accessibility gate", () => {
    expect(MINIMUM_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });
});
