import { describe, expect, it } from "vitest";
import {
  computeResidual,
  payoutClearsHourlyFloor,
  residualHumanMinutes,
  residualPayoutCents,
  type ResidualStepInput,
} from "@/lib/ai-work-engine/residual";
import { COST_CATALOG } from "@/lib/ai-work-engine/cost-catalog";

/**
 * The residual is where an automation engine is most tempted to underpay, so
 * every rule that prevents it is pinned here.
 */

const RATES = { workerHourlyUsd: 15 };

const humanStep = (
  fixedMinutes: number | null,
  secondsPerUnit: number | null,
  pert: [number, number, number] = [0, 0, 0]
): ResidualStepInput => ({
  executor: "human",
  fixedMinutes,
  secondsPerUnit,
  estimatedMinutesOptimistic: pert[0],
  estimatedMinutesLikely: pert[1],
  estimatedMinutesConservative: pert[2],
});

const machineStep = (): ResidualStepInput => ({
  executor: "ai",
  fixedMinutes: null,
  secondsPerUnit: null,
  estimatedMinutesOptimistic: 0,
  estimatedMinutesLikely: 0,
  estimatedMinutesConservative: 0,
});

describe("residual minutes — fixed cost does not shrink with the work", () => {
  it("is fixed + per-unit, not a proportion of the original estimate", () => {
    // 30 fixed minutes plus 2 minutes per record, 80 records.
    // Full mandate: 30 + 160 = 190 minutes.
    // 2 records left is NOT 190 × 2/80 = 5 minutes. It is 30 + 4 = 34.
    const steps = [humanStep(30, 120)];
    expect(residualHumanMinutes(steps, 80).minutes).toBe(190);
    expect(residualHumanMinutes(steps, 2).minutes).toBe(34);
    // What proportional scaling would have paid, for contrast.
    expect(Math.round((190 * 2) / 80)).toBe(5);
  });

  it("keeps the whole fixed cost at zero remaining units", () => {
    // The case the arithmetic most wants to pay nothing for, and must not:
    // a person still opens the file and signs the delivery.
    const r = residualHumanMinutes([humanStep(30, 120)], 0);
    expect(r.minutes).toBe(30);
    expect(r.minutes).toBeGreaterThanOrEqual(COST_CATALOG.minimumResidualMinutes);
  });

  it("applies the dignity floor when even the fixed cost is tiny", () => {
    const r = residualHumanMinutes([humanStep(2, 1)], 0);
    expect(r.minutes).toBe(COST_CATALOG.minimumResidualMinutes);
    expect(r.floored).toBe(true);
  });

  it("never counts machine steps", () => {
    const withMachines = [humanStep(15, 120), machineStep(), machineStep()];
    expect(residualHumanMinutes(withMachines, 10).minutes).toBe(
      residualHumanMinutes([humanStep(15, 120)], 10).minutes
    );
  });

  it("falls back to the FULL PERT estimate when a step has no decomposition", () => {
    // A pre-1B plan, or a model that returned nulls. The person is never paid
    // less than the plan promised because the plan lacked a field.
    const r = residualHumanMinutes([humanStep(null, null, [60, 120, 240])], 1);
    expect(r.minutes).toBe(130); // (60 + 4×120 + 240) / 6 = 130
    expect(r.usedPertFallback).toBe(true);
  });

  it("treats a partial decomposition as a decomposition, not a fallback", () => {
    // fixedMinutes set, secondsPerUnit null: a step whose cost genuinely does
    // not vary with volume. Its missing half is zero, not a reason to guess.
    const r = residualHumanMinutes([humanStep(45, null, [10, 10, 10])], 999);
    expect(r.minutes).toBe(45);
    expect(r.usedPertFallback).toBe(false);
  });

  it("rounds partial minutes up, never down", () => {
    // 3 units × 30s = 90s = 1.5 min. The worker is not billed 1.
    expect(residualHumanMinutes([humanStep(30, 30)], 3).minutes).toBe(32);
  });

  it("ignores a negative or fractional unit count instead of trusting it", () => {
    expect(residualHumanMinutes([humanStep(30, 60)], -5).minutes).toBe(30);
    expect(residualHumanMinutes([humanStep(30, 60)], 2.7).minutes).toBe(32);
  });
});

describe("residual payout", () => {
  it("rounds up to the whole dollar", () => {
    // 35 min at $15/h = $8.75 -> $9.
    expect(residualPayoutCents(35, RATES)).toBe(900);
  });

  it("never returns zero when a human package exists", () => {
    const r = computeResidual({
      steps: [humanStep(1, 1)],
      unitsRemaining: 0,
      rates: RATES,
      unitsTotal: 999,
      automatedStepCount: 5,
      quotedMinutes: 0,
      reservedBudgetCents: 19_000,
    });
    expect(r.payoutCents).toBeGreaterThan(0);
  });

  it("clears the hourly floor at fractional rates, in integer cents", () => {
    // The Phase 1A incident: float division rejected its own exact boundary.
    for (const rate of [15, 15.05, 15.25, 15.75, 16.75]) {
      for (const units of [0, 1, 2, 17, 80, 1200]) {
        const r = computeResidual({
          steps: [humanStep(30, 210), humanStep(15, 45)],
          unitsRemaining: units,
          rates: { workerHourlyUsd: rate },
          unitsTotal: 999,
      automatedStepCount: 5,
      quotedMinutes: 0,
      reservedBudgetCents: 10_000_000,
        });
        expect(payoutClearsHourlyFloor(r.payoutCents, r.minutes, rate)).toBe(true);
      }
    }
  });

  it("flags over-budget instead of quietly paying less", () => {
    // The residual is what the work is worth. If it exceeds what the quote
    // reserved, the mandate was mis-estimated and an operator decides.
    const r = computeResidual({
      steps: [humanStep(60, 300)],
      unitsRemaining: 80,
      rates: RATES,
      unitsTotal: 999,
      automatedStepCount: 5,
      quotedMinutes: 0,
      reservedBudgetCents: 5_000,
    });
    expect(r.overBudget).toBe(true);
    expect(r.payoutCents).toBeGreaterThan(r.reservedBudgetCents);
  });

  it("is not over budget on the ordinary case", () => {
    const r = computeResidual({
      steps: [humanStep(30, 210)],
      unitsRemaining: 19,
      rates: RATES,
      unitsTotal: 999,
      automatedStepCount: 5,
      quotedMinutes: 0,
      reservedBudgetCents: 19_000,
    });
    expect(r.overBudget).toBe(false);
  });

  it("is monotonic: more units left never costs less", () => {
    const steps = [humanStep(20, 90)];
    let previous = -1;
    for (const units of [0, 1, 5, 20, 100, 500]) {
      const r = computeResidual({
        steps,
        unitsRemaining: units,
        rates: RATES,
        unitsTotal: 999,
      automatedStepCount: 5,
      quotedMinutes: 0,
      reservedBudgetCents: 10_000_000,
      });
      expect(r.payoutCents).toBeGreaterThanOrEqual(previous);
      previous = r.payoutCents;
    }
  });
});

describe("a reduction must be PROVEN before it is paid", () => {
  // Found by adversarial review: three situations look like a reduction to
  // the arithmetic and are not. In each the quoted payout must stand.
  const QUOTED = 9_000;
  const QUOTED_MINUTES = 380;
  const base = {
    steps: [humanStep(10, 120, [300, 380, 500])],
    rates: RATES,
    reservedBudgetCents: QUOTED,
    quotedMinutes: QUOTED_MINUTES,
  };

  it("keeps the quoted payout when the compiler automated nothing", () => {
    // A sensitive-data mandate, or any pre-Phase-1B plan: every step is
    // human, the job is exactly the one that was quoted.
    const r = computeResidual({ ...base, unitsRemaining: 80, unitsTotal: 80, automatedStepCount: 0 });
    expect(r.reductionProven).toBe(false);
    expect(r.payoutCents).toBeGreaterThanOrEqual(QUOTED);
  });

  it("keeps the quoted payout when the mandate has no countable volume", () => {
    // quantity_interpreted is null for "compile a competitive landscape".
    // unitsTotal 0 makes the per-unit half of every estimate vanish.
    const r = computeResidual({ ...base, unitsRemaining: 0, unitsTotal: 0, automatedStepCount: 5 });
    expect(r.reductionProven).toBe(false);
    expect(r.payoutCents).toBeGreaterThanOrEqual(QUOTED);
    expect(r.minutes).toBeGreaterThanOrEqual(QUOTED_MINUTES);
  });

  it("keeps the quoted payout when the machine ran but resolved nothing", () => {
    const r = computeResidual({ ...base, unitsRemaining: 80, unitsTotal: 80, automatedStepCount: 5 });
    expect(r.reductionProven).toBe(false);
    expect(r.payoutCents).toBeGreaterThanOrEqual(QUOTED);
  });

  it("pays the residual only when units were actually resolved", () => {
    const r = computeResidual({ ...base, unitsRemaining: 19, unitsTotal: 80, automatedStepCount: 5 });
    expect(r.reductionProven).toBe(true);
    expect(r.payoutCents).toBeLessThan(QUOTED);
    expect(r.payoutCents).toBeGreaterThan(0);
  });
});

describe("the decomposition may redistribute the estimate, never shrink it", () => {
  it("scales a decomposition that cannot reproduce its own PERT total", () => {
    // The model writes "5 fixed + 10 seconds each" for a step it estimated at
    // 240 PERT minutes over 80 units. Taken at face value that pays a
    // fraction of the quoted work.
    const step = humanStep(5, 10, [180, 240, 300]);
    const pert = 240; // (180 + 4*240 + 300) / 6
    const full = residualHumanMinutes([step], 80, COST_CATALOG, 80);
    expect(full.minutes).toBeGreaterThanOrEqual(pert);
  });

  it("leaves an honest decomposition alone", () => {
    // 30 + 80*120/60 = 190, and PERT is 190 too. Nothing to correct.
    const step = humanStep(30, 120, [160, 190, 220]);
    const r = residualHumanMinutes([step], 80, COST_CATALOG, 80);
    expect(r.minutes).toBe(190);
  });

  it("falls back to PERT when the decomposition is all zeros", () => {
    const r = residualHumanMinutes([humanStep(0, 0, [60, 120, 240])], 10, COST_CATALOG, 10);
    expect(r.usedPertFallback).toBe(true);
    expect(r.minutes).toBe(130);
  });

  it("still shrinks with the remaining units after scaling", () => {
    const step = humanStep(5, 10, [180, 240, 300]);
    const atFull = residualHumanMinutes([step], 80, COST_CATALOG, 80).minutes;
    const atFew = residualHumanMinutes([step], 4, COST_CATALOG, 80).minutes;
    expect(atFew).toBeLessThan(atFull);
    expect(atFew).toBeGreaterThan(0);
  });
});

describe("a missing fixed half is not a zero fixed half", () => {
  /**
   * Found by adversarial review. A decomposition with no fixed half makes the
   * residual exactly proportional to the remaining units, which is the one
   * thing this module exists to forbid, and the scaling rule cannot rescue it
   * because zero times any scale is still zero.
   */
  it("never prices a step at 2/80 of its estimate", () => {
    const step = humanStep(null, 60, [180, 240, 300]); // PERT 240
    const proportional = Math.round((240 * 2) / 80); // 6 minutes, the failure
    const r = residualHumanMinutes([step], 2, COST_CATALOG, 80);
    expect(r.minutes).toBeGreaterThan(proportional);
    expect(r.usedPertFallback).toBe(true);
  });

  it("treats an explicit zero the same as an omission", () => {
    // A model writing 0 is not asserting a free set-up cost, it is failing to
    // answer. A person always opens the file and signs the delivery.
    const omitted = residualHumanMinutes([humanStep(null, 60, [180, 240, 300])], 2, COST_CATALOG, 80);
    const zeroed = residualHumanMinutes([humanStep(0, 60, [180, 240, 300])], 2, COST_CATALOG, 80);
    expect(zeroed.minutes).toBe(omitted.minutes);
  });

  it("still trusts a decomposition whose per-unit half is the missing one", () => {
    // The legitimate inverse: a step whose cost genuinely does not vary with
    // volume. Its missing half really is zero.
    const r = residualHumanMinutes([humanStep(45, null, [10, 10, 10])], 999, COST_CATALOG, 999);
    expect(r.minutes).toBe(45);
    expect(r.usedPertFallback).toBe(false);
  });

  it("pays at least the quoted amount for the whole 2-of-80 case end to end", () => {
    const r = computeResidual({
      steps: [humanStep(null, 60, [180, 240, 300])],
      unitsRemaining: 2,
      unitsTotal: 80,
      automatedStepCount: 5,
      quotedMinutes: 240,
      rates: RATES,
      reservedBudgetCents: 6000,
    });
    // 240 min at $15/h is $60. The defect paid $5.
    expect(r.payoutCents).toBeGreaterThanOrEqual(6000);
  });
});

describe("the hourly floor is enforced on what is written, not just measured", () => {
  it("raises a payout that would land below the current floor", () => {
    // The quote was approved at exactly $15.00/h, then an operator raised the
    // floor to $18. The unproven branch takes minutes and money from two
    // different sources, so the pair could land under the new floor.
    const r = computeResidual({
      steps: [humanStep(300, null, [300, 300, 300])],
      unitsRemaining: 0,
      unitsTotal: 0,
      automatedStepCount: 0,
      quotedMinutes: 360,
      rates: { workerHourlyUsd: 18 },
      reservedBudgetCents: 9000,
    });
    expect(payoutClearsHourlyFloor(r.payoutCents, r.minutes, 18)).toBe(true);
    expect(r.payoutCents).toBeGreaterThanOrEqual(9000);
  });

  it("does not pause a run that is paying exactly what it reserved", () => {
    // overBudget must be measured on the payout actually written. Comparing
    // the raw arithmetic parked every fully-human mandate quoted below this
    // engine's own hourly base in ai_processing until a six-hourly sweep.
    const r = computeResidual({
      steps: [humanStep(null, null, [700, 760, 900])],
      unitsRemaining: 80,
      unitsTotal: 80,
      automatedStepCount: 0,
      quotedMinutes: 760,
      rates: RATES,
      reservedBudgetCents: 19_000,
    });
    expect(r.reductionProven).toBe(false);
    expect(r.payoutCents).toBe(19_000);
    expect(r.overBudget).toBe(false);
  });
});

describe("the residual half imports no model SDK", () => {
  it("residual.ts is pure code", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(__dirname, "..", "src/lib/ai-work-engine/residual.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/@anthropic-ai\/sdk|from "openai"|from 'openai'/);
  });
});
