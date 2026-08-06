import { varianceCheck, type VarianceCheck } from "@/lib/operational-intelligence/statistics";

/**
 * CALIBRATION LEVELS, decided in code from explicit thresholds. The enum is
 * new (4 levels) and deliberately NOT the Phase-1A CostCalibration enum
 * (3 levels, hardcoded "uncalibrated"): 1C-β will bridge pricing onto this
 * one; until then the two coexist without pretending to be each other.
 *
 * Sample basis: eligibleForCostAndPerformanceCalibration ONLY. Reliability
 * uses its own, larger denominator and never gates the level — a workflow
 * can be perfectly calibrated about its costs while having a visible
 * failure rate, and hiding the level would hide the costs too.
 */

export const CALIBRATION_LEVELS = [
  "uncalibrated",
  "early_signal",
  "partially_calibrated",
  "calibrated",
] as const;

export type CalibrationLevelValue = (typeof CALIBRATION_LEVELS)[number];

export const CALIBRATION_THRESHOLDS = {
  earlySignalMinSample: 10,
  partialMinSample: 30,
  calibratedMinSample: 100,
  earlySignalMinCompletenessBps: 7000,
  partialMinCompletenessBps: 8500,
  calibratedMinCompletenessBps: 9000,
  calibratedMinRecentSample: 10,
  calibratedMaxCriticalErrorBps: 500,
  varianceRatioCeiling: 3,
  /**
   * FOUNDER DECISION, recorded as code: absolute variance ceilings are NOT
   * invented from the tiny local dataset. While this is null, the p25 = 0
   * branch of the variance test fails closed and `calibrated` cannot be
   * granted on that basis (statistics.ts documents the exact rule). Configure
   * per-metric ceilings here once real distributions exist.
   */
  varianceAbsoluteCeilings: null as Record<string, number> | null,
} as const;

export function decideCalibrationLevel(input: {
  sampleSizeCostPerf: number;
  metricsCompletenessBps: number | null;
  /** p25/p75 of the cost-per-task distribution (micros, as numbers of the ratio scale is fine — callers pass Number(bigint) safe values or the raw pair). */
  varianceP25: number | null;
  varianceP75: number | null;
  criticalErrorRateBps: number | null;
  sampleSizeRecent: number;
}): { level: CalibrationLevelValue; flags: string[]; variance: VarianceCheck } {
  const t = CALIBRATION_THRESHOLDS;
  const completeness = input.metricsCompletenessBps ?? 0;
  const variance = varianceCheck({
    p25: input.varianceP25,
    p75: input.varianceP75,
    ratioCeiling: t.varianceRatioCeiling,
    absoluteCeiling: t.varianceAbsoluteCeilings?.totalCostMicros ?? null,
  });
  const flags = [...variance.flags];

  if (input.sampleSizeCostPerf < t.earlySignalMinSample) {
    return { level: "uncalibrated", flags, variance };
  }
  if (
    input.sampleSizeCostPerf < t.partialMinSample ||
    completeness < t.earlySignalMinCompletenessBps
  ) {
    return {
      level: completeness >= t.earlySignalMinCompletenessBps ? "early_signal" : "uncalibrated",
      flags,
      variance,
    };
  }
  if (
    input.sampleSizeCostPerf < t.calibratedMinSample ||
    completeness < t.partialMinCompletenessBps
  ) {
    return {
      level: completeness >= t.partialMinCompletenessBps ? "partially_calibrated" : "early_signal",
      flags,
      variance,
    };
  }
  const calibrated =
    completeness >= t.calibratedMinCompletenessBps &&
    variance.passed &&
    (input.criticalErrorRateBps ?? 0) <= t.calibratedMaxCriticalErrorBps &&
    input.sampleSizeRecent >= t.calibratedMinRecentSample;
  return { level: calibrated ? "calibrated" : "partially_calibrated", flags, variance };
}
