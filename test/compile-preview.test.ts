import { describe, expect, it } from "vitest";
import {
  buildCompilePreview,
  previewUsd,
  type PreviewVersionRow,
} from "@/lib/ai-work-engine/compile-preview";
import { HANDOFF_REASONS } from "@/lib/ai-work-engine/compile";
import { PLAN_PRIMITIVES } from "@/lib/ai-work-engine/primitive-vocabulary";

/**
 * LOT B — the pre-quote compile preview is the commercial firewall's eyes.
 * These tests pin the two things that make it trustworthy:
 *
 *   1. The badges are FACTS derived from the same pure compiler the runtime
 *      uses — each scenario below constructs plan rows and asserts the exact
 *      badge set, including badges that must NOT appear.
 *   2. The preview never invents optimism: a plan the compiler would refuse
 *      shows as human on this screen, with the compiler's own reason string.
 *
 * (Zero-side-effect of the DB loader is pinned in the integration suite;
 * this file exercises the pure builder only.)
 */

const CUID = "claaaaaaaaaaaaaaaaaaaaaaa";

function versionRow(overrides: Partial<PreviewVersionRow> = {}): PreviewVersionRow {
  return {
    dataClass: "business_confidential",
    dataClassSignals: [],
    automationCostPolicyVersion: "ac1",
    expectedAutomationCostMicros: 1_500_000n,
    conservativeAutomationCostMicros: 3_000_000n,
    automationSpendCeilingMicros: 4_000_000n,
    calibration: "partial",
    steps: [],
    ...overrides,
  };
}

type StepRow = PreviewVersionRow["steps"][number];

function step(partial: Partial<StepRow> & Pick<StepRow, "order" | "title">): StepRow {
  return {
    id: `step-${partial.order}`,
    executor: "deterministic_code",
    primitiveId: null,
    primitiveVersion: null,
    params: null,
    dependsOnOrder: [],
    demotedForBudget: false,
    // A machine step's human effort, exactly as the planner writes it: zero.
    // The pricing-integrity suite below turns that into its own scenario.
    estimatedMinutesLikely: 0,
    estimatedMinutesConservative: 0,
    fixedMinutes: null,
    secondsPerUnit: null,
    ...partial,
  };
}

function filePipeline(): StepRow[] {
  return [
    step({
      order: 1,
      title: "Read the client file",
      primitiveId: "ingest.csv",
      primitiveVersion: PLAN_PRIMITIVES["ingest.csv"],
      params: { fileId: CUID, datasetName: "main" },
    }),
    step({
      order: 2,
      title: "Deduplicate",
      primitiveId: "data.dedupe",
      primitiveVersion: PLAN_PRIMITIVES["data.dedupe"],
      params: { dataset: "main", keyFields: ["email"] },
      dependsOnOrder: [1],
    }),
    step({
      order: 3,
      title: "Build the deliverable",
      primitiveId: "build.csv",
      primitiveVersion: PLAN_PRIMITIVES["build.csv"],
      params: { dataset: "main" },
      dependsOnOrder: [2],
    }),
  ];
}

const NO_GATE = { sensitiveData: false, requiredAccess: [] };

describe("case 1 — an excellent all-machine file plan", () => {
  const preview = buildCompilePreview(versionRow({ steps: filePipeline() }), NO_GATE);

  it("compiles every step machine, in order, with dependencies visible", () => {
    expect(preview.automatedCount).toBe(3);
    expect(preview.humanCount).toBe(0);
    expect(preview.machineStepShareBps).toBe(10_000);
    expect(preview.steps.map((s) => s.executionMode)).toEqual([
      "automated",
      "automated",
      "automated",
    ]);
    expect(preview.steps[2].dependsOnOrder).toEqual([2]);
  });

  it("badges: FILE AUTOMATION and nothing alarming", () => {
    expect(preview.badges).toContain("FILE AUTOMATION");
    expect(preview.badges).not.toContain("MOSTLY HUMAN");
    expect(preview.badges).not.toContain("SENSITIVE / HUMAN ONLY");
    expect(preview.badges).not.toContain("MISSING CAPABILITY");
    expect(preview.badges).not.toContain("DEMOTED FOR BUDGET");
    expect(preview.badges).not.toContain("UNPROVEN WORKFLOW");
  });

  it("economics are formatted for the operator, in dollars", () => {
    expect(preview.economics).toEqual({
      policyVersion: "ac1",
      expectedUsd: "$1.50",
      conservativeUsd: "$3.00",
      ceilingUsd: "$4.00",
    });
  });
});

describe("case 2 — a mostly-human plan says so", () => {
  const preview = buildCompilePreview(
    versionRow({
      steps: [
        step({
          order: 1,
          title: "Read the client file",
          primitiveId: "ingest.csv",
          primitiveVersion: PLAN_PRIMITIVES["ingest.csv"],
          params: { fileId: CUID, datasetName: "main" },
        }),
        step({ order: 2, title: "Call each supplier", executor: "human", dependsOnOrder: [1] }),
        step({ order: 3, title: "Negotiate terms", executor: "human", dependsOnOrder: [2] }),
      ],
    }),
    NO_GATE
  );

  it("shows MOSTLY HUMAN below the 50% machine line", () => {
    expect(preview.machineStepShareBps).toBeLessThan(5_000);
    expect(preview.badges).toContain("MOSTLY HUMAN");
  });

  it("human steps carry the compiler's reason, machine steps carry none", () => {
    expect(preview.steps[1].handoffReason).toBe(HANDOFF_REASONS.human_step);
    expect(preview.steps[0].handoffReason).toBeNull();
  });
});

describe("case 3 — an uncalibrated web.fetch plan warns three times", () => {
  const preview = buildCompilePreview(
    versionRow({
      dataClass: "public_business",
      calibration: "uncalibrated",
      steps: [
        step({
          order: 1,
          title: "Search for the companies",
          executor: "ai",
          primitiveId: "research.web_search",
          primitiveVersion: PLAN_PRIMITIVES["research.web_search"],
          params: {},
        }),
        step({
          order: 2,
          title: "Fetch the official pages",
          executor: "ai",
          primitiveId: "web.fetch",
          primitiveVersion: PLAN_PRIMITIVES["web.fetch"],
          params: { maxFetches: 3, maxContentTokens: 10_000 },
          dependsOnOrder: [1],
        }),
      ],
    }),
    NO_GATE
  );

  it("web.fetch compiles machine on a public-business mandate", () => {
    expect(preview.steps[1].executionMode).toBe("automated");
  });

  it("badges: WEB FETCH, UNPROVEN WORKFLOW and UNCALIBRATED, never a confidence score", () => {
    expect(preview.badges).toContain("WEB FETCH");
    expect(preview.badges).toContain("UNPROVEN WORKFLOW");
    expect(preview.badges).toContain("UNCALIBRATED");
    for (const b of preview.badges) expect(b).not.toMatch(/[0-9]%|score|confidence/i);
  });
});

describe("case 4 — a budget-demoted step is flagged at the quote", () => {
  const steps = filePipeline();
  steps[1] = { ...steps[1], primitiveId: null, primitiveVersion: null, demotedForBudget: true };
  const preview = buildCompilePreview(versionRow({ steps }), NO_GATE);

  it("the demoted step is human and marked, and the badge appears", () => {
    expect(preview.steps[1].executionMode).toBe("human");
    expect(preview.steps[1].demotedForBudget).toBe(true);
    expect(preview.badges).toContain("DEMOTED FOR BUDGET");
  });
});

describe("case 5 — a sensitive mandate is HUMAN ONLY regardless of the plan", () => {
  const preview = buildCompilePreview(versionRow({ steps: filePipeline() }), {
    sensitiveData: true,
    requiredAccess: [],
  });

  it("every step is human with the mandate-level reason", () => {
    expect(preview.automatedCount).toBe(0);
    for (const s of preview.steps) {
      expect(s.executionMode).toBe("human");
      expect(s.handoffReason).toBe(HANDOFF_REASONS.sensitive_data);
    }
  });

  it("badges: SENSITIVE / HUMAN ONLY, and no FILE AUTOMATION (nothing automated runs)", () => {
    expect(preview.badges).toContain("SENSITIVE / HUMAN ONLY");
    expect(preview.badges).not.toContain("FILE AUTOMATION");
  });

  it("badges: HUMAN COST UNKNOWN — the R1/R2 regression, live on this exact fixture", () => {
    // filePipeline()'s three steps were planned as near-free machine work
    // (zero human minutes) and the mandate-level sensitivity gate turned all
    // three human. Nothing here was ever "demoted for budget" — the old
    // gate, keyed only on demotedForBudget, stayed dark on precisely this
    // shape. It must fire now, first in the list.
    expect(preview.badges).toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
    expect(preview.badges[0]).toBe("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });
});

describe("case 6 — a capability gap is named, not hidden", () => {
  const preview = buildCompilePreview(
    versionRow({
      steps: [
        step({
          order: 1,
          title: "Transcribe the recordings",
          executor: "ai",
          primitiveId: "audio.transcribe", // does not exist in the registry
          primitiveVersion: 1,
          params: {},
        }),
        step({ order: 2, title: "Summarise", executor: "human", dependsOnOrder: [1] }),
      ],
    }),
    NO_GATE
  );

  it("the step is human with the unknown-primitive reason and the badge shows", () => {
    expect(preview.steps[0].executionMode).toBe("human");
    expect(preview.steps[0].handoffReason).toBe(HANDOFF_REASONS.unknown_primitive);
    expect(preview.badges).toContain("MISSING CAPABILITY");
  });

  it("badges: HUMAN COST UNKNOWN — a missing capability is still an un-costed humanisation", () => {
    // Neither step here carries a minute estimate: step 1 was planned "ai"
    // against a primitive that doesn't exist, step 2 was planned human with
    // no figure written. A missing capability is exactly the kind of reason
    // the generalised gate must not need a special case for.
    expect(preview.badges).toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });
});

describe("previewUsd — display formatting only, never arithmetic", () => {
  it("rounds micros half-up to cents", () => {
    expect(previewUsd(0n)).toBe("$0.00");
    expect(previewUsd(1_680_000n)).toBe("$1.68");
    expect(previewUsd(4_999n)).toBe("$0.00");
    expect(previewUsd(5_000n)).toBe("$0.01");
    expect(previewUsd(null)).toBeNull();
  });
});
