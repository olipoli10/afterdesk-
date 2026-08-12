import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessDemotionPricing,
  HUMAN_COST_UNKNOWN_NOTICE,
} from "@/lib/ai-work-engine/demotion-pricing";
import { buildCompilePreview } from "@/lib/ai-work-engine/compile-preview";
import { PLAN_PRIMITIVES } from "@/lib/ai-work-engine/primitive-vocabulary";

/**
 * PRICING INTEGRITY — the invariant: a machine→human demotion may never
 * produce a suggested price when nothing costed the human work it created.
 *
 * The defect these pins close was measured, not imagined: across 29 real
 * mandates, 20 of 20 quotes carrying a demotion were unchanged to the cent and
 * 115 of 115 demoted steps carried zero human minutes.
 */

/* ─────────────── the detector, at its exact boundary ─────────────── */

describe("assessDemotionPricing — zero minutes on a demoted step is 'unknown', not 'free'", () => {
  const machineStep = (order: number, demoted: boolean) => ({
    order,
    demotedForBudget: demoted,
    estimatedMinutesLikely: 0,
    estimatedMinutesConservative: 0,
    fixedMinutes: null,
    secondsPerUnit: null,
  });

  it("a demoted step with no effort at all is flagged", () => {
    const v = assessDemotionPricing([machineStep(1, true)]);
    expect(v.humanCostUnknown).toBe(true);
    expect(v.unpricedOrders).toEqual([1]);
  });

  it("a step that was NOT demoted is never flagged, whatever its minutes", () => {
    expect(assessDemotionPricing([machineStep(1, false)]).humanCostUnknown).toBe(false);
  });

  it("ANY positive effort figure clears it — the gate is on ignorance, not on demotion", () => {
    const shapes = [
      { estimatedMinutesLikely: 30 },
      { estimatedMinutesConservative: 45 },
      { fixedMinutes: 15 },
      { secondsPerUnit: 90 },
    ];
    for (const shape of shapes) {
      const v = assessDemotionPricing([{ ...machineStep(1, true), ...shape }]);
      expect(v.humanCostUnknown, JSON.stringify(shape)).toBe(false);
    }
  });

  it("null and zero are the same answer: nothing was written, nothing is known", () => {
    const v = assessDemotionPricing([
      {
        order: 1,
        demotedForBudget: true,
        estimatedMinutesLikely: null,
        estimatedMinutesConservative: null,
        fixedMinutes: null,
        secondsPerUnit: null,
      },
    ]);
    expect(v.humanCostUnknown).toBe(true);
  });

  it("reports every unpriced order, in plan order", () => {
    const v = assessDemotionPricing([
      machineStep(1, false),
      machineStep(2, true),
      { ...machineStep(3, true), estimatedMinutesLikely: 20 },
      machineStep(4, true),
    ]);
    expect(v.unpricedOrders).toEqual([2, 4]);
  });

  it("an empty plan is not a warning", () => {
    expect(assessDemotionPricing([]).humanCostUnknown).toBe(false);
  });
});

/* ─────────── the badge: the operator sees it before pricing ─────────── */

describe("the compile preview leads with the badge that invalidates its own numbers", () => {
  const step = (over: Record<string, unknown>) => ({
    id: "s",
    order: 1,
    title: "Structure the fetched rows",
    executor: "ai",
    primitiveId: "extract.structured_rows",
    primitiveVersion: PLAN_PRIMITIVES["extract.structured_rows"],
    params: {},
    dependsOnOrder: [] as number[],
    demotedForBudget: false,
    estimatedMinutesLikely: 0,
    estimatedMinutesConservative: 0,
    fixedMinutes: null as number | null,
    secondsPerUnit: null as number | null,
    ...over,
  });
  const version = (steps: ReturnType<typeof step>[]) => ({
    dataClass: "public_business",
    dataClassSignals: [] as string[],
    automationCostPolicyVersion: "ac5",
    expectedAutomationCostMicros: 2_400_000n,
    conservativeAutomationCostMicros: 5_000_000n,
    automationSpendCeilingMicros: 20_000_000n,
    calibration: "partial",
    steps,
  });
  const NO_GATE = { sensitiveData: false, requiredAccess: [] };

  it("a budget demotion with no human minutes raises the badge, FIRST in the list", () => {
    const preview = buildCompilePreview(
      version([
        step({ demotedForBudget: true }),
        step({ id: "s2", order: 2, title: "Verify", executor: "human", primitiveId: null }),
      ]),
      NO_GATE
    );
    expect(preview.badges[0]).toBe("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });

  it("the same demotion WITH an estimate raises no such badge", () => {
    const preview = buildCompilePreview(
      version([
        step({ demotedForBudget: true, estimatedMinutesLikely: 40 }),
        step({ id: "s2", order: 2, title: "Verify", executor: "human", primitiveId: null }),
      ]),
      NO_GATE
    );
    expect(preview.badges).not.toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });

  it("no demotion, no badge — the preview does not cry wolf on ordinary human steps", () => {
    const preview = buildCompilePreview(
      version([step({ id: "s2", order: 1, title: "Verify", executor: "human", primitiveId: null })]),
      NO_GATE
    );
    expect(preview.badges).not.toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });
});

/* ───────── the quote path: no number is suggested when none is known ───────── */

describe("the engine suppresses the suggestion rather than guessing", () => {
  const engineSource = readFileSync(
    join(__dirname, "..", "src", "lib", "ai-work-engine", "index.ts"),
    "utf8"
  );

  it("the suppression writes NULL across every suggestion column", () => {
    // The whole point: not a smaller price, not a padded one — none. A number
    // the engine knows is wrong is the one an operator approves in one click.
    for (const column of [
      "aiSuggestedPriceCents: null",
      "aiLowCents: null",
      "aiHighCents: null",
      "aiSuggestedVaPayoutCents: null",
      "aiEstimatedMinutes: null",
    ]) {
      expect(engineSource, `suppression must set ${column}`).toContain(column);
    }
    expect(engineSource).toContain("demotionPricing.humanCostUnknown");
  });

  it("the operator is told why, and confidence never stays high on a refused quote", () => {
    expect(engineSource).toContain("HUMAN_COST_UNKNOWN_NOTICE");
    expect(engineSource).toContain('aiConfidence: demotionPricing.humanCostUnknown ? "low"');
  });

  it("the notice names the condition and the required action, once", () => {
    expect(HUMAN_COST_UNKNOWN_NOTICE).toContain("HUMAN COST UNKNOWN");
    expect(HUMAN_COST_UNKNOWN_NOTICE).toContain("MANUAL PRICING REQUIRED");
    expect(HUMAN_COST_UNKNOWN_NOTICE).toContain("No price is suggested");
  });

  it("no fabricated human-effort table exists anywhere in the fix", () => {
    /**
     * The refusal branch was chosen BECAUSE no measured per-primitive human
     * fallback effort exists. If someone later invents one, this pin should
     * fail and force the measurement conversation rather than let a made-up
     * number into a client's contract.
     */
    const detector = readFileSync(
      join(__dirname, "..", "src", "lib", "ai-work-engine", "demotion-pricing.ts"),
      "utf8"
    );
    expect(detector).not.toMatch(/secondsPerUnit:\s*\d/);
    expect(detector).not.toMatch(/fixedMinutes:\s*\d/);
    expect(detector).not.toMatch(/FALLBACK_(EFFORT|MINUTES)/);
  });
});

/* ── the regression that made this necessary, as a standing pin ── */

describe("the measured defect, restated so it cannot return quietly", () => {
  it("reprice() alone leaves a zero-minute demotion costing nothing", async () => {
    const { pricePlan } = await import("@/lib/ai-work-engine/pricing");
    const rates = { workerHourlyUsd: 15 };
    const machine = {
      executor: "ai" as const,
      estimatedMinutesOptimistic: 0,
      estimatedMinutesLikely: 0,
      estimatedMinutesConservative: 0,
      estimatedAiCostCents: 120,
      estimatedToolUnits: 0,
      tool: null,
    };
    const human = {
      executor: "human" as const,
      estimatedMinutesOptimistic: 240,
      estimatedMinutesLikely: 360,
      estimatedMinutesConservative: 480,
      estimatedAiCostCents: 0,
      estimatedToolUnits: 0,
      tool: null,
    };
    const raw = pricePlan([machine, human], rates);
    // Exactly what reprice() does to a demoted step, and nothing more.
    const demoted = pricePlan(
      [{ ...machine, executor: "human" as const, estimatedAiCostCents: 0 }, human],
      rates
    );
    // The demoted plan is CHEAPER, so max() pins the quote to the raw figures
    // and the work that just moved to a person is billed at nothing.
    expect(demoted.internalCostConservativeCents).toBeLessThanOrEqual(
      raw.internalCostConservativeCents
    );
    expect(demoted.suggestedVaPayoutCents).toBe(raw.suggestedVaPayoutCents);
    expect(Math.max(raw.suggestedPriceCents, demoted.suggestedPriceCents)).toBe(
      raw.suggestedPriceCents
    );
    // Which is precisely why the detector must fire on this shape.
    expect(
      assessDemotionPricing([
        {
          order: 1,
          demotedForBudget: true,
          estimatedMinutesLikely: 0,
          estimatedMinutesConservative: 0,
          fixedMinutes: null,
          secondsPerUnit: null,
        },
      ]).humanCostUnknown
    ).toBe(true);
  });
});
