import { COST_CATALOG, type CostCatalog } from "@/lib/ai-work-engine/cost-catalog";
import { pertMinutes } from "@/lib/ai-work-engine/pricing";

/**
 * WHAT THE PERSON IS STILL OWED, once the machine has done its share.
 *
 * The rule this file exists to avoid: scaling the human estimate down in
 * proportion to the units the machine resolved. Proportional scaling shrinks
 * the fixed costs along with the variable ones, and the fixed costs do not
 * shrink. Opening the files, reading the brief, understanding what the machine
 * produced and signing off on the delivery cost the same whether 2 rows are
 * left or 80. A 2-of-80 residual paid at 2/80 of the estimate is a wage of
 * almost nothing for a real half hour of work.
 *
 * So the estimate is decomposed:
 *
 *     minutes = fixedMinutes + ceil(secondsPerUnit × unitsRemaining / 60)
 *
 * Integers throughout — seconds and cents, never a float on the path to money.
 *
 * NO AI SDK IMPORT. Same rule as pricing.ts: this half of the engine is code,
 * and the absence of the import is the enforcement.
 */

export type ResidualStepInput = {
  executor: "ai" | "human" | "deterministic_code";
  /** Human minutes that do not vary with volume. Null on pre-1B plans. */
  fixedMinutes: number | null;
  /** Human seconds per unit. Null on pre-1B plans. */
  secondsPerUnit: number | null;
  estimatedMinutesOptimistic: number;
  estimatedMinutesLikely: number;
  estimatedMinutesConservative: number;
};

export type ResidualRates = {
  /** max(catalog base, settings.minWorkerHourlyUsd), resolved by the caller. */
  workerHourlyUsd: number;
};

export type Residual = {
  minutes: number;
  payoutCents: number;
  /** True when at least one step had no decomposition and fell back to PERT. */
  usedPertFallback: boolean;
  /** True when the dignity floor, not the arithmetic, set the minutes. */
  floored: boolean;
  /**
   * True when the machine measurably reduced the work. False means the quoted
   * payout stands: no reduction, no recomputation.
   */
  reductionProven: boolean;
  /** The quoted payout this residual is measured against. */
  reservedBudgetCents: number;
  /** payoutCents > reservedBudgetCents. The run must pause; an admin decides. */
  overBudget: boolean;
};

const roundUpTo = (cents: number, step: number) => Math.ceil(cents / step) * step;

/**
 * Human minutes still owed. Machine steps contribute nothing: whatever the
 * machine did or failed to do, it did not consume a person's time.
 *
 * A step with no decomposition (a plan written before Phase 1B, or a model
 * that returned nulls) falls back to its FULL PERT estimate rather than to
 * zero or to a guessed split. The person is never paid less than the plan
 * promised because the plan lacked a field.
 */
export function residualHumanMinutes(
  steps: ResidualStepInput[],
  unitsRemaining: number,
  catalog: CostCatalog = COST_CATALOG,
  /**
   * Units the mandate was quoted for. Needed only to sanity-check the
   * decomposition against the estimate the quote was actually priced on.
   */
  unitsTotal = 0
): { minutes: number; usedPertFallback: boolean; floored: boolean } {
  const units = Math.max(0, Math.floor(unitsRemaining));
  const total = Math.max(0, Math.floor(unitsTotal));
  let minutes = 0;
  let usedPertFallback = false;

  for (const step of steps) {
    if (step.executor !== "human") continue;

    /**
     * A MISSING HALF IS NOT A ZERO HALF.
     *
     * The decomposition is only trusted when the FIXED half is present and
     * positive. Accepting `fixedMinutes` null-or-zero alongside a per-unit
     * rate defeats the entire purpose of this file: with a zero fixed half
     * the residual becomes exactly proportional to the remaining units, which
     * is the proportional scaling the module was written to forbid. Worse,
     * the scaling rule below cannot rescue it, because zero times any scale
     * is still zero.
     *
     * Measured: a step at PERT 240 minutes with `fixedMinutes: null,
     * secondsPerUnit: 60` and 2 of 80 units left paid 20 minutes (the dignity
     * floor) instead of the quoted 240. Five dollars for a sixty dollar
     * mandate, and the arithmetic looked correct the whole way down.
     *
     * The step's per-unit half may be absent — a genuine fixed-cost step
     * exists, and its missing half really is zero. The reverse does not: a
     * person always opens the file, reads the brief and signs the delivery,
     * so a step claiming no set-up cost is describing something other than
     * human work. When the model omits it we do not know the cost, and not
     * knowing is priced at the full PERT estimate, never at nothing.
     */
    const hasTrustedDecomposition = step.fixedMinutes !== null && step.fixedMinutes > 0;
    if (!hasTrustedDecomposition) {
      usedPertFallback = true;
      minutes += pertMinutes(step);
      continue;
    }

    // Positive, guaranteed by the guard above. The per-unit half may legitimately
    // be absent: a step whose cost genuinely does not vary with volume.
    const fixed = step.fixedMinutes as number;
    const perUnitSeconds = step.secondsPerUnit ?? 0;

    /**
     * THE DECOMPOSITION MAY REDISTRIBUTE THE ESTIMATE, NEVER SHRINK IT.
     *
     * `fixedMinutes` and `secondsPerUnit` come from the same model call as
     * the three PERT numbers the quote was priced on, and nothing forces the
     * two to agree. A step estimated at 240 PERT minutes whose decomposition
     * reads "5 fixed + 10 seconds each" describes a completely different job,
     * and taking the decomposition at face value would pay a fraction of what
     * the work was quoted at.
     *
     * So the decomposition is checked at FULL volume: if it cannot reproduce
     * the step's own PERT estimate, both halves are scaled up until it can.
     * The shape of the split (how much is set-up, how much is per record) is
     * the model's to choose; the total is not.
     */
    let effectiveFixed = fixed;
    let effectivePerUnit = perUnitSeconds;
    if (total > 0) {
      // decomposedFull is strictly positive: `fixed` is guaranteed > 0 above,
      // which is also what keeps `scale` finite.
      const decomposedFull = fixed + (perUnitSeconds * total) / 60;
      const pert = pertMinutes(step);
      if (decomposedFull < pert) {
        const scale = pert / decomposedFull;
        effectiveFixed = fixed * scale;
        effectivePerUnit = perUnitSeconds * scale;
      }
    }

    minutes += effectiveFixed + Math.ceil((effectivePerUnit * units) / 60);
  }

  minutes = Math.ceil(minutes);

  /**
   * The floor applies even at zero remaining units, and ESPECIALLY there.
   * Zero units left does not mean zero work: someone still opens the file,
   * checks what the machine produced against the brief, and delivers it under
   * their own name. The platform promises the client that a person reviews
   * every delivery, and that promise has a cost.
   */
  const floored = minutes < catalog.minimumResidualMinutes;
  return {
    minutes: floored ? catalog.minimumResidualMinutes : minutes,
    usedPertFallback,
    floored,
  };
}

/**
 * Minutes to money. Rounds UP to the whole dollar, like computeVaPayoutCents:
 * a payout only ever rounds in the worker's favour.
 */
export function residualPayoutCents(minutes: number, rates: ResidualRates): number {
  return roundUpTo(Math.ceil((minutes / 60) * rates.workerHourlyUsd * 100), 100);
}

/**
 * Does this payout clear the platform's hourly floor? Integer-cents
 * comparison, never float division — the float form rejected its own exact
 * boundary in Phase 1A ($147.00 over 560 minutes at $15.75/h divided to
 * 15.749999999999998).
 */
export function payoutClearsHourlyFloor(
  payoutCents: number,
  minutes: number,
  minWorkerHourlyUsd: number
): boolean {
  if (minutes <= 0) return true;
  const minHourlyCents = Math.round(minWorkerHourlyUsd * 100);
  return payoutCents * 60 >= minHourlyCents * minutes;
}

export function computeResidual(input: {
  steps: ResidualStepInput[];
  unitsRemaining: number;
  unitsTotal: number;
  rates: ResidualRates;
  reservedBudgetCents: number;
  /** How many plan steps the compiler actually handed to the machine. */
  automatedStepCount: number;
  /** The quoted effort, kept when no reduction can be proven. */
  quotedMinutes: number;
  catalog?: CostCatalog;
}): Residual {
  const catalog = input.catalog ?? COST_CATALOG;
  const { minutes, usedPertFallback, floored } = residualHumanMinutes(
    input.steps,
    input.unitsRemaining,
    catalog,
    input.unitsTotal
  );
  const payoutCents = residualPayoutCents(minutes, input.rates);

  /**
   * A REDUCTION MUST BE PROVEN BEFORE IT IS PAID.
   *
   * Recomputing the payout is only honest when the machine demonstrably took
   * work off the person's plate. Three situations look like a reduction to
   * the arithmetic and are not:
   *
   *  - the compiler automated nothing (a sensitive-data mandate, a plan with
   *    no primitives, every pre-Phase-1B plan). The job is exactly the one
   *    that was quoted;
   *  - the mandate has no countable volume, so `unitsTotal` is 0 and the
   *    per-unit half of every estimate silently evaluates to nothing;
   *  - the machine ran but resolved no units, so nothing was actually taken
   *    off the plate.
   *
   * In all three the quoted payout stands untouched. Underpaying a person
   * because a model could not count is the exact failure the founder ruled
   * out, and "the arithmetic said so" is not a defence.
   */
  const reductionProven =
    input.automatedStepCount > 0 &&
    input.unitsTotal > 0 &&
    input.unitsRemaining < input.unitsTotal;

  /**
   * WITHOUT A PROVEN REDUCTION, THE ANSWER IS THE QUOTE — THE WHOLE QUOTE.
   *
   * An earlier version took the maximum of the residual and the quote on each
   * field SEPARATELY, so the minutes could come from one source while the
   * money came from the other. That pair is incoherent: a mandate quoted at
   * 760 minutes for $190 came back as 774 minutes for $190, which reads as a
   * rate below the floor, and repairing the rate then pushed the payout above
   * the reserve and paused a run in which nothing had actually happened.
   *
   * The quoted pair was already validated against the hourly floor by
   * approvePricing, and it is the number the worker will be shown. Nothing the
   * machine failed to do is a reason to restate it.
   *
   * In the proven branch the pair is coherent by construction (the payout is
   * derived from the minutes at the current rate), but the rate itself may
   * have moved since the quote, so the floor is still checked. It is a promise
   * about the rate, so it is repaired by raising the money, never by
   * shortening the minutes.
   */
  const finalMinutes = reductionProven ? minutes : Math.max(input.quotedMinutes, 0);
  const rawPayout = reductionProven ? payoutCents : input.reservedBudgetCents;
  const finalPayout = payoutClearsHourlyFloor(rawPayout, finalMinutes, input.rates.workerHourlyUsd)
    ? rawPayout
    : residualPayoutCents(finalMinutes, input.rates);

  return {
    minutes: finalMinutes,
    payoutCents: finalPayout,
    reductionProven,
    usedPertFallback,
    floored,
    reservedBudgetCents: input.reservedBudgetCents,
    /**
     * Over budget is NOT resolved by quietly paying less. The residual is what
     * the work is worth; if it exceeds what the quote reserved, the mandate
     * was mis-estimated and that is an operator decision, not an arithmetic
     * one. The run pauses.
     *
     * Measured against what is ACTUALLY PAID, not against the raw arithmetic.
     * When no reduction was proven the payout is pinned to the reserve, so
     * there is by definition nothing to be over budget about — comparing the
     * raw figure instead paused every fully-human mandate whose quote was
     * approved below this engine's own hourly base, left it parked in
     * ai_processing, and made it invisible until a six-hourly sweep found it.
     */
    overBudget: finalPayout > input.reservedBudgetCents,
  };
}
