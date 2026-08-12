import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessDemotionPricing,
  HUMAN_COST_UNKNOWN_NOTICE,
} from "@/lib/ai-work-engine/demotion-pricing";
import { buildCompilePreview } from "@/lib/ai-work-engine/compile-preview";
import { HANDOFF_REASONS } from "@/lib/ai-work-engine/compile";
import { PLAN_PRIMITIVES } from "@/lib/ai-work-engine/primitive-vocabulary";

/**
 * PRICING INTEGRITY — the invariant, generalised (2026-08-12): a step that
 * runs HUMAN in the final compiled plan, for ANY reason, may never produce a
 * suggested price when nothing costed the human work it now is.
 *
 * The first version of this gate fired only on `demotedForBudget`. L3 on Neon
 * found the hole was wider than the gate: two refusal mandates were 100%
 * humanised by compile.ts's mandate-level sensitivity/access gate — a code
 * path the budget flag has never heard of — and both kept a live,
 * un-suppressed AI-suggested price computed as if several of their steps
 * would still run as cheap automation. Every test below that used to read
 * `demotedForBudget: true` now reads `executesAsHuman: true`, and several are
 * new: they exist specifically to prove the mechanism does not care WHY a
 * step became human, only THAT it did and THAT nothing costed it.
 */

/* ─────────────── the detector, at its exact boundary ─────────────── */

describe("assessDemotionPricing — zero minutes on a humanised step is 'unknown', not 'free'", () => {
  const step = (order: number, executesAsHuman: boolean, reason: string | null = "budget") => ({
    order,
    executesAsHuman,
    humanizedReason: reason,
    estimatedMinutesLikely: 0,
    estimatedMinutesConservative: 0,
    fixedMinutes: null,
    secondsPerUnit: null,
  });

  it("a humanised step with no effort at all is flagged", () => {
    const v = assessDemotionPricing([step(1, true)]);
    expect(v.humanCostUnknown).toBe(true);
    expect(v.unpricedOrders).toEqual([1]);
  });

  it("a step that stayed machine is never flagged, whatever its minutes", () => {
    expect(assessDemotionPricing([step(1, false)]).humanCostUnknown).toBe(false);
  });

  it("ANY positive effort figure clears it — the gate is on ignorance, not on the reason", () => {
    const shapes = [
      { estimatedMinutesLikely: 30 },
      { estimatedMinutesConservative: 45 },
      { fixedMinutes: 15 },
      { secondsPerUnit: 90 },
    ];
    for (const shape of shapes) {
      const v = assessDemotionPricing([{ ...step(1, true), ...shape }]);
      expect(v.humanCostUnknown, JSON.stringify(shape)).toBe(false);
    }
  });

  it("null and zero are the same answer: nothing was written, nothing is known", () => {
    const v = assessDemotionPricing([
      {
        order: 1,
        executesAsHuman: true,
        humanizedReason: "budget",
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
      step(1, false),
      step(2, true),
      { ...step(3, true), estimatedMinutesLikely: 20 },
      step(4, true),
    ]);
    expect(v.unpricedOrders).toEqual([2, 4]);
  });

  it("an empty plan is not a warning", () => {
    expect(assessDemotionPricing([]).humanCostUnknown).toBe(false);
  });

  /* ─── the generalisation itself: the reason must never matter ─── */

  it("fires identically whether the reason is budget, sensitivity, access, or anything else", () => {
    // The whole point of the fix. Four completely different reasons a step
    // could become human, same shape of unestimated cost, same verdict.
    const reasons = [
      "Demoted for budget by the economic preflight.",
      HANDOFF_REASONS.sensitive_data,
      HANDOFF_REASONS.required_access,
      HANDOFF_REASONS.unknown_primitive,
      "A future compiler rule nobody has written yet.",
    ];
    for (const reason of reasons) {
      const v = assessDemotionPricing([step(1, true, reason)]);
      expect(v.humanCostUnknown, reason).toBe(true);
      expect(v.unpricedReasons[1], reason).toBe(reason);
    }
  });

  it("a step planned human from the start, with real minutes, does not trip the gate even though it 'executes as human'", () => {
    // Exactly the case the order called out: a step already planned human
    // with a conservative estimate must not spuriously suppress.
    const v = assessDemotionPricing([
      {
        order: 1,
        executesAsHuman: true,
        humanizedReason: HANDOFF_REASONS.human_step,
        estimatedMinutesLikely: 45,
        estimatedMinutesConservative: 63,
        fixedMinutes: 20,
        secondsPerUnit: null,
      },
    ]);
    expect(v.humanCostUnknown).toBe(false);
    expect(v.unpricedOrders).toEqual([]);
  });

  it("the audit trail names which order and why, for exactly the unpriced ones", () => {
    const v = assessDemotionPricing([
      step(1, true, HANDOFF_REASONS.sensitive_data),
      { ...step(2, true, "should not appear"), estimatedMinutesLikely: 30 },
      step(3, true, HANDOFF_REASONS.required_access),
    ]);
    expect(Object.keys(v.unpricedReasons).sort()).toEqual(["1", "3"]);
    expect(v.unpricedReasons[1]).toBe(HANDOFF_REASONS.sensitive_data);
    expect(v.unpricedReasons[3]).toBe(HANDOFF_REASONS.required_access);
  });

  it("a missing reason still suppresses, with a generic fallback rather than a blank", () => {
    const v = assessDemotionPricing([
      {
        order: 1,
        executesAsHuman: true,
        estimatedMinutesLikely: 0,
        estimatedMinutesConservative: 0,
        fixedMinutes: null,
        secondsPerUnit: null,
      },
    ]);
    expect(v.humanCostUnknown).toBe(true);
    expect(v.unpricedReasons[1]).toBeTruthy();
  });
});

/* ─────────── the badge: the operator sees it before pricing, whatever humanised the step ─────────── */

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
    // A machine step's human effort, exactly as the planner writes it: zero.
    // The pricing-integrity suite below turns that into its own scenario.
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
        step({ demotedForBudget: true, primitiveId: null, primitiveVersion: null }),
        step({ id: "s2", order: 2, title: "Verify", executor: "human", primitiveId: null }),
      ]),
      NO_GATE
    );
    expect(preview.badges[0]).toBe("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });

  it("the same demotion WITH an estimate raises no such badge", () => {
    const preview = buildCompilePreview(
      version([
        step({
          demotedForBudget: true,
          primitiveId: null,
          primitiveVersion: null,
          estimatedMinutesLikely: 40,
        }),
        // Every humanised step needs its own estimate to clear the gate —
        // one costed step does not vouch for another.
        step({
          id: "s2",
          order: 2,
          title: "Verify",
          executor: "human",
          primitiveId: null,
          estimatedMinutesLikely: 15,
        }),
      ]),
      NO_GATE
    );
    expect(preview.badges).not.toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });

  it("no demotion, no badge — an ordinary human step planned WITH its own estimate does not cry wolf", () => {
    const preview = buildCompilePreview(
      version([
        step({
          id: "s2",
          order: 1,
          title: "Verify",
          executor: "human",
          primitiveId: null,
          estimatedMinutesLikely: 15,
        }),
      ]),
      NO_GATE
    );
    expect(preview.badges).not.toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });

  it("an ordinary human step planned WITHOUT any estimate trips the same gate — being 'always human' is not an exemption", () => {
    // The invariant only exempts a humanised step that CARRIES a cost. A step
    // that was human from the start but was never actually costed is exactly
    // the ignorance the badge exists to catch, same as a demoted one.
    const preview = buildCompilePreview(
      version([step({ id: "s2", order: 1, title: "Verify", executor: "human", primitiveId: null })]),
      NO_GATE
    );
    expect(preview.badges).toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });

  /* ─── the exact shape L3 on Neon found: humanised by the GATE, not the budget ─── */

  it("a sensitive mandate with un-costed machine steps ALSO raises the badge — the R1/R2 regression", () => {
    // No demotedForBudget anywhere on this plan. The mandate-level sensitivity
    // gate is what humanises every step, and that must be enough on its own.
    const preview = buildCompilePreview(
      version([
        step({ order: 1, primitiveId: "ingest.csv", primitiveVersion: PLAN_PRIMITIVES["ingest.csv"] }),
        step({
          id: "s2",
          order: 2,
          title: "Deduplicate",
          primitiveId: "data.dedupe",
          primitiveVersion: PLAN_PRIMITIVES["data.dedupe"],
          dependsOnOrder: [1],
        }),
        step({
          id: "s3",
          order: 3,
          title: "Verify",
          executor: "human",
          primitiveId: null,
          dependsOnOrder: [2],
          estimatedMinutesLikely: 45,
          fixedMinutes: 20,
        }),
      ]),
      { sensitiveData: true, requiredAccess: [] }
    );
    expect(preview.automatedCount).toBe(0);
    expect(preview.badges).toContain("SENSITIVE / HUMAN ONLY");
    expect(preview.badges).toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
    // FIRST, per the badge's own design intent: it invalidates every number
    // beside it, so it must not read as a footnote under other badges.
    expect(preview.badges[0]).toBe("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });

  it("a required-access mandate raises the same badge, for the same reason", () => {
    const preview = buildCompilePreview(
      version([
        step({
          order: 1,
          title: "Pull the leads",
          primitiveId: "research.web_search",
          primitiveVersion: PLAN_PRIMITIVES["research.web_search"],
        }),
      ]),
      { sensitiveData: false, requiredAccess: ["client HubSpot"] }
    );
    expect(preview.badges).toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });

  it("a missing-capability mandate raises the badge too, when the orphaned step carries no cost", () => {
    const preview = buildCompilePreview(
      version([
        step({
          order: 1,
          title: "Transcribe the recordings",
          primitiveId: "audio.transcribe", // does not exist in the registry
          primitiveVersion: 1,
        }),
      ]),
      NO_GATE
    );
    expect(preview.badges).toContain("MISSING CAPABILITY");
    expect(preview.badges).toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });
});

/* ───────── the quote path: no number is suggested when none is known, whatever humanised the step ───────── */

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

  it("pricing time runs the REAL compiler, not a proxy for it", () => {
    // The exact regression: pricing used to guess automatability from the
    // planner's own executor label, blind to compile.ts's mandate gate.
    expect(engineSource).toContain("compileDecisions(");
    expect(engineSource).toContain("compiledByOrder");
  });

  it("the preflight's automatable set comes from the compiled verdict, not the planner's raw label", () => {
    expect(engineSource).toContain('compiledByOrder.get(i + 1)?.executionMode === "automated"');
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

  it("the generalised type carries no lingering budget-only name", () => {
    // A field literally called demotedForBudget on the shared verdict type
    // would be exactly the kind of name that invites the next humanization
    // reason to be forgotten, the same way this one was.
    const detector = readFileSync(
      join(__dirname, "..", "src", "lib", "ai-work-engine", "demotion-pricing.ts"),
      "utf8"
    );
    expect(detector).toContain("executesAsHuman");
    expect(detector).not.toMatch(/export type \w+ = \{\s*order: number;\s*demotedForBudget/);
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
    // Which is precisely why the detector must fire on this shape — however
    // the step came to be human.
    expect(
      assessDemotionPricing([
        {
          order: 1,
          executesAsHuman: true,
          humanizedReason: "budget",
          estimatedMinutesLikely: 0,
          estimatedMinutesConservative: 0,
          fixedMinutes: null,
          secondsPerUnit: null,
        },
      ]).humanCostUnknown
    ).toBe(true);
  });

  it("the R1/R2 regression: a sensitivity-humanised, zero-minute machine step is caught identically", () => {
    // Same shape, different cause. This is the case the budget-only gate missed.
    expect(
      assessDemotionPricing([
        {
          order: 1,
          executesAsHuman: true,
          humanizedReason: HANDOFF_REASONS.sensitive_data,
          estimatedMinutesLikely: 0,
          estimatedMinutesConservative: 0,
          fixedMinutes: null,
          secondsPerUnit: null,
        },
      ]).humanCostUnknown
    ).toBe(true);
  });
});
