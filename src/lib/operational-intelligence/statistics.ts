/**
 * DETERMINISTIC STATISTICS for the calibration engine.
 *
 * One percentile method for the whole product: lower-rank on the sorted
 * array (idx = ceil(p/100 × n) − 1). No interpolation — an interpolated
 * percentile invents a value no task ever had, and two implementations that
 * "both do interpolation" still disagree in the last decimal. Rank always
 * returns a member of the sample, bit-identical on every recompute.
 *
 * Everything financial has a bigint twin. Number percentiles are for rates,
 * seconds and bps; micros go through the bigint path so a $5,000 task
 * cannot silently lose precision at 2^53 aggregates.
 *
 * NO AI SDK, NO PRISMA, NO server-only: pure code, pinned by tests.
 */

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  if (p <= 0 || p > 100) throw new Error(`percentile p out of range: ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function percentileBig(values: bigint[], p: number): bigint | null {
  if (values.length === 0) return null;
  if (p <= 0 || p > 100) throw new Error(`percentile p out of range: ${p}`);
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export const median = (v: number[]) => percentile(v, 50);
export const medianBig = (v: bigint[]) => percentileBig(v, 50);

/**
 * Basis points, floored, null on a non-positive denominator. Null and zero
 * are different answers: 0 bps means "measured at zero", null means "there
 * is nothing to measure against".
 */
export function bps(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return Math.floor((numerator * 10_000) / denominator);
}

/** bigint bps — floor division toward zero is fine: inputs are >= 0. */
export function bpsBig(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n) return null;
  return Number((numerator * 10_000n) / denominator);
}

export type VarianceCheck = {
  passed: boolean;
  flags: string[];
};

/**
 * THE VARIANCE RULE, with the p25 = 0 case defined instead of implied.
 *
 * p25 > 0            → ratio test: p75/p25 <= ratioCeiling.
 * p25 = 0, p75 > 0   → the ratio is UNDEFINED. Fall back to an ABSOLUTE
 *                      ceiling — and if none is configured, the test FAILS
 *                      with a flag rather than passing on a guess. Founder
 *                      decision: absolute ceilings are not invented from the
 *                      tiny local dataset, and `calibrated` is never granted
 *                      on the strength of an unconfigured test.
 * p25 = 0, p75 = 0   → degenerate but consistent: passes, flagged.
 *
 * p25 = 0 is frequent and meaningful (a quarter of runs with zero tool
 * cost). Treating it as 0, as infinity, or as a silent skip would bias the
 * calibration level in one direction or the other.
 */
export function varianceCheck(input: {
  p25: number | null;
  p75: number | null;
  ratioCeiling: number;
  absoluteCeiling: number | null;
}): VarianceCheck {
  if (input.p25 === null || input.p75 === null) {
    return { passed: false, flags: ["VARIANCE_NO_SAMPLE"] };
  }
  if (input.p25 < 0 || input.p75 < input.p25) {
    // Percentiles of a sorted sample cannot do this; if they do, the caller
    // fed garbage and the answer is "not calibrated", loudly.
    return { passed: false, flags: ["VARIANCE_INPUT_INVALID"] };
  }
  if (input.p25 > 0) {
    return {
      passed: input.p75 / input.p25 <= input.ratioCeiling,
      flags: [],
    };
  }
  if (input.p75 === 0) {
    return { passed: true, flags: ["VARIANCE_DEGENERATE"] };
  }
  if (input.absoluteCeiling === null) {
    return {
      passed: false,
      flags: ["VARIANCE_RATIO_UNDEFINED", "VARIANCE_CEILINGS_UNCONFIGURED"],
    };
  }
  return {
    passed: input.p75 - input.p25 <= input.absoluteCeiling,
    flags: ["VARIANCE_RATIO_UNDEFINED"],
  };
}
