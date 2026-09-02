import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseGoldenWorkflowProjection,
  rejectFieldGoldenWorkflowLeaks,
} from "@/lib/construction-operating-assistant-r33/contracts";
import {
  EXTERNAL_CAPABILITY_CODES,
  GOLDEN_WORKFLOW_REGISTRY,
  MOBILE_ROUTES,
  WEB_ROUTES,
} from "@/lib/construction-operating-assistant-r33/registry";
import {
  formatGoldenWorkflowDateTime,
  formatGoldenWorkflowMoney,
} from "@/lib/construction-operating-assistant-r33/format";
import {
  assertGoldenWorkflowCopyComplete,
  GOLDEN_WORKFLOW_COPY,
} from "@/lib/i18n/construction-operating-assistant-r33";
import { deriveGoldenWorkflow } from "@/server/construction-operating-assistant-r33/golden-workflow";
import {
  MOBILE_GOLDEN_WORKFLOW_COPY,
  parseMobileGoldenWorkflow,
} from "../apps/mobile/src/lib/golden-workflow";
import {
  formatMobileGoldenWorkflowDateTime,
  formatMobileGoldenWorkflowMoney,
} from "../apps/mobile/src/lib/golden-workflow-format";

const readiness = (overrides: Partial<Parameters<typeof deriveGoldenWorkflow>[0]["readiness"]> = {}) => ({
  hasProject: true,
  hasContact: true,
  hasAssignment: true,
  hasWorkIntent: false,
  hasSchedule: false,
  hasEvidence: false,
  hasFollowUp: false,
  invoiceReady: false,
  hasPreparedAction: false,
  hasApprovedAction: false,
  hasHistory: true,
  ...overrides,
});

function fixture(role: "OWNER" | "FIELD_WORKER") {
  const derived = deriveGoldenWorkflow({ readiness: readiness(), field: role === "FIELD_WORKER" });
  const base = {
    schemaVersion: 1 as const,
    registryVersion: 1 as const,
    generatedAt: "2026-09-02T12:00:00.000Z",
    workspace: { id: "workspace-a", name: "Construction Laval", timezone: "America/Toronto", locale: "fr-CA" as const, currency: "CAD" as const },
    project: { id: "project-a", code: "LAVAL-001", name: "Rénovation Laval" },
    stateFingerprint: "a".repeat(64),
    ...derived,
    secondaryActions: [],
    externalCapabilities: EXTERNAL_CAPABILITY_CODES.map((code) => ({ code, status: "UNAVAILABLE" as const, reasonCode: "PROVIDER_DISABLED_LOCAL" as const })),
    providerObserved: false as const,
    externalEffectCount: 0 as const,
  };
  return role === "FIELD_WORKER"
    ? { ...base, role, assignedProjectCount: 1 }
    : { ...base, role, activeExceptionCount: 0, pendingApprovalCount: 0 };
}

describe("R33 Web/iOS/Android Golden Workflow parity", () => {
  it("derives one owner next action and advances only from canonical readiness", () => {
    const initial = deriveGoldenWorkflow({ readiness: readiness(), field: false });
    expect(initial).toMatchObject({ currentStep: "CAPTURE_WORK", completedCount: 1, primaryAction: { code: "OPEN_ASSISTANT", route: "ASSISTANT" } });
    const advanced = deriveGoldenWorkflow({ readiness: readiness({ hasWorkIntent: true, hasSchedule: true }), field: false });
    expect(advanced).toMatchObject({ currentStep: "COLLECT_PROOF", completedCount: 3, primaryAction: { code: "ADD_EVIDENCE", route: "EVIDENCE" } });
  });

  it("keeps the field workflow independent and assignment-gated", () => {
    const projection = deriveGoldenWorkflow({ readiness: readiness({ hasAssignment: false }), field: true });
    expect(projection).toMatchObject({ currentStep: "PLAN_WORK", primaryAction: { code: "VIEW_ASSIGNMENTS", route: "JOBS" } });
    expect(projection.steps.map((item) => item.step)).toEqual(["PLAN_WORK", "COLLECT_PROOF", "REVIEW_HISTORY"]);
    expect(() => rejectFieldGoldenWorkflowLeaks({ pendingApprovalCount: 1 })).toThrow("GOLDEN_WORKFLOW_FIELD_PROJECTION_LEAK_REFUSED");
  });

  it("keeps one closed registry and route mapping on Web and mobile", () => {
    expect(GOLDEN_WORKFLOW_REGISTRY).toHaveLength(8);
    expect(new Set(GOLDEN_WORKFLOW_REGISTRY.map((entry) => entry.step)).size).toBe(8);
    for (const entry of GOLDEN_WORKFLOW_REGISTRY) {
      expect(WEB_ROUTES[entry.route]).toMatch(/^\/client/u);
      expect(MOBILE_ROUTES[entry.route]).toMatch(/^\//u);
    }
  });

  it("has exact complete French/English copy parity on both client implementations", () => {
    expect(assertGoldenWorkflowCopyComplete()).toBe(true);
    for (const locale of ["fr-CA", "en-CA"] as const) {
      expect(Object.keys(GOLDEN_WORKFLOW_COPY[locale]).sort()).toEqual(Object.keys(MOBILE_GOLDEN_WORKFLOW_COPY[locale]).sort());
      expect(MOBILE_GOLDEN_WORKFLOW_COPY[locale]).toEqual(GOLDEN_WORKFLOW_COPY[locale]);
    }
  });

  it("parses one exact business projection on server, Web and shared iOS/Android", () => {
    const owner = fixture("OWNER");
    expect(parseGoldenWorkflowProjection(owner)).toEqual(parseMobileGoldenWorkflow(owner));
    const field = fixture("FIELD_WORKER");
    expect(parseGoldenWorkflowProjection(field)).toEqual(parseMobileGoldenWorkflow(field));
    expect(JSON.stringify(field)).not.toMatch(/amountMinor|receivable|invoiceReference|contact|import|policy|secret/u);
  });

  it("keeps selected language and deterministic timezone/money formatting out of canonical state", () => {
    const instant = "2026-09-02T18:30:00.000Z";
    for (const locale of ["fr-CA", "en-CA"] as const) {
      expect(formatMobileGoldenWorkflowDateTime({ instant, locale, timezone: "America/Toronto" }))
        .toBe(formatGoldenWorkflowDateTime({ instant, locale, timezone: "America/Toronto" }));
      expect(formatMobileGoldenWorkflowMoney({ amountMinor: 120000, locale }))
        .toBe(formatGoldenWorkflowMoney({ amountMinor: 120000, locale }));
    }
    expect(formatGoldenWorkflowDateTime({ instant, locale: "fr-CA", timezone: "America/Toronto" }))
      .not.toBe(formatGoldenWorkflowDateTime({ instant, locale: "en-CA", timezone: "America/Toronto" }));
    expect(fixture("OWNER").stateFingerprint).toBe(fixture("OWNER").stateFingerprint);
    expect(() => parseGoldenWorkflowProjection({ ...fixture("OWNER"), workspace: { ...fixture("OWNER").workspace, locale: "es-MX" } })).toThrow();
  });

  it("keeps keyboard, focus, narrow-layout and non-colour meaning explicit on Web", () => {
    const source = readFileSync("src/components/construction-operating-assistant-r33/golden-workflow-cockpit.tsx", "utf8");
    expect(source).toContain('tabIndex={-1}');
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('aria-current=');
    expect(source).toContain('role="alert"');
    expect(source).toContain('flex flex-wrap');
    expect(source).toContain('grid gap-3 lg:grid-cols-2');
    expect(source).toContain('status.${step.status}');
  });

  it("keeps the shared iOS/Android cockpit labelled, scalable and scrollable", () => {
    const cockpit = readFileSync("apps/mobile/src/app/(app)/index.tsx", "utf8");
    const ui = readFileSync("apps/mobile/src/components/ui.tsx", "utf8");
    expect(cockpit).toContain('accessibilityRole="button"');
    expect(cockpit).toContain("accessibilityLabel=");
    expect(cockpit).toContain("accessibilityHint=");
    expect(cockpit).toContain("accessibilityState=");
    expect(cockpit).toContain('accessibilityRole="summary"');
    expect(ui).toContain("<ScrollView");
    expect(ui).toContain("minHeight: MINIMUM_TOUCH_TARGET");
  });
});
