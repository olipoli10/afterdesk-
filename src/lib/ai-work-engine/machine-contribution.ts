import { bpsBig } from "@/lib/operational-intelligence/statistics";

/**
 * HOW MUCH OF A MANDATE'S INTERNAL COST THE MACHINE ACTUALLY CARRIED.
 *
 * A measurement, not a lever. Nothing here decides what anybody is paid:
 * residual.ts owns that, and it does not import this file. The separation is
 * deliberate and it is the whole reason this module is separate at all — the
 * moment a "machine share" figure is allowed to reach the payout arithmetic, a
 * worker's money starts moving because a cost model changed, which is exactly
 * the proportional scaling residual.ts was written to forbid.
 *
 * PURE, for the same reason data-class.ts and primitive-vocabulary.ts are: this
 * is arithmetic over numbers the caller already has, it is unit tested without
 * a database, and a `server-only` import here would make it unusable from the
 * admin console that has to display the number.
 *
 * ── WHY THE MINUTES ARE CARRIED BUT NEVER SUMMED ──
 *
 * `MandateEffort` holds step counts and minutes as well as micros because it is
 * the whole effort record of a mandate and callers need it whole. The ratio
 * below reads ONLY the three micro amounts. Adding minutes into a denominator
 * of microdollars would be a unit error that produces a plausible percentage,
 * and a plausible wrong percentage is worse than no percentage: it is the kind
 * of number somebody quotes in a decision six months later.
 */

/**
 * WHERE THE NUMBERS CAME FROM, AND WHY THIS TYPE EXISTS AT ALL.
 *
 * `planned`  what the accepted plan SAID the split would be. Available before
 *            a single step runs, useful for quoting and for the admin console,
 *            and a forecast — nothing more.
 * `measured` what production actually recorded: real provider cost, real
 *            worker seconds, real reviewer seconds, after delivery.
 *
 * The two must never be added, averaged, or silently substituted for one
 * another. The failure mode is specific and it is worth naming: a mandate
 * whose plan promised 85% machine, where the specialist then redid half the
 * file by hand, is a mandate whose machine contribution was NOT 85%. If the
 * planned figure is allowed to flow into the calibration statistics, the
 * platform ends up reporting the automation it hoped for instead of the
 * automation it got, and the numbers get worse as the gap gets bigger, which
 * is precisely backwards.
 *
 * So provenance travels WITH the ratio, in the return type, and a caller has
 * to handle both cases to compile. It cannot be dropped by accident.
 */
export type EffortProvenance = "planned" | "measured";

export type MandateEffort = {
  provenance: EffortProvenance;
  machineStepCount: number;
  humanStepCount: number;
  workerMinutes: number;
  reviewerMinutes: number;
  machineCostMicros: bigint;
  workerCostMicros: bigint;
  reviewerCostMicros: bigint;
};

/**
 * Everything the mandate cost US, machine and people together. BigInt like
 * every microdollar amount on the financial path: the Prisma Int ceiling is
 * $2,147.48 and an aggregate over a month of mandates passes it easily.
 */
export function allInInternalCostMicros(e: MandateEffort): bigint {
  return e.machineCostMicros + e.workerCostMicros + e.reviewerCostMicros;
}

/**
 * The machine's share of all-in internal cost, in basis points, or NULL.
 *
 * NULL IS NOT ZERO, and the distinction is the point of the function. A mandate
 * with no recorded cost at all has not been measured; reporting 0 bps would
 * claim it was measured and that the machine contributed nothing, which is a
 * claim nobody made. Same rule as `bps`/`bpsBig` in
 * src/lib/operational-intelligence/statistics.ts, whose idiom this follows, and
 * `bpsBig` is imported rather than restated so the two cannot drift: floored
 * bigint division, then one Number conversion at the very end.
 *
 * A negative component is garbage rather than a measurement — micros on this
 * path are non-negative by construction — so it refuses the same way, loudly,
 * instead of returning a negative percentage that would render as a share.
 */
export function machineContributionBps(e: MandateEffort): number | null {
  if (e.machineCostMicros < 0n || e.workerCostMicros < 0n || e.reviewerCostMicros < 0n) {
    return null;
  }
  return bpsBig(e.machineCostMicros, allInInternalCostMicros(e));
}

/** A ratio that always says whether it was forecast or observed. */
export type MachineContribution = { bps: number; provenance: EffortProvenance };

export function machineContribution(e: MandateEffort): MachineContribution | null {
  const bps = machineContributionBps(e);
  return bps === null ? null : { bps, provenance: e.provenance };
}

/**
 * THE MEASUREMENT WINS ONCE IT EXISTS.
 *
 * Not an average, not a blend, not a fallback that quietly prefers whichever
 * number is present: a plan is a forecast and an actual is a fact, and where
 * both exist the fact is the answer. The forecast keeps its own life beside
 * it — comparing the two IS the calibration loop 1C was built for, and that
 * comparison is impossible the moment one of them has been folded into the
 * other.
 *
 * Returns null when neither is computable, because an unmeasured mandate is
 * unknown rather than zero.
 */
export function preferMeasured(
  planned: MandateEffort | null,
  measured: MandateEffort | null
): MachineContribution | null {
  if (measured !== null && measured.provenance !== "measured") {
    // A caller passing a planned record in the measured slot would otherwise
    // launder a forecast into the statistics under the wrong label. Refuse
    // rather than trust the argument position.
    return null;
  }
  const fromMeasured = measured === null ? null : machineContribution(measured);
  if (fromMeasured !== null) return fromMeasured;
  return planned === null ? null : machineContribution(planned);
}
