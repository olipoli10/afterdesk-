import type { TaskOutcomeClassValue } from "@/lib/operational-intelligence/outcome-class";

/**
 * THREE ELIGIBILITY PREDICATES, three denominators. The single flag they
 * replace conflated two opposite needs: commercial failures MUST count in
 * reliability (hiding them is survivorship bias) and MUST NOT contaminate
 * the cost distributions of finished work (a task cancelled at 30% has
 * partial costs over no delivered units — its "cost per unit" describes
 * nothing that ever happened).
 *
 * Founder-approved threshold: metricsCompletenessBps >= 7000 for the
 * cost/performance gate.
 */

export const COST_PERF_COMPLETENESS_FLOOR_BPS = 7000;

/** Flags that mark data as unfit for any statistics. */
const DISQUALIFYING_DATA_FLAGS = ["E2E_DATA", "TEST_TASK", "SEED_DATA"] as const;

/** Flags that keep a task out of cost/perf distributions specifically. */
const COST_PERF_EXCLUSION_FLAGS = ["MANUAL_OVERRIDE", "OUTLIER", "PARTIAL_TELEMETRY"] as const;

export function eligibleForReliabilityStatistics(input: {
  hasAcceptanceSnapshot: boolean;
  isInternal: boolean;
  isStandingCapacity: boolean;
  dataQualityFlags: string[];
}): boolean {
  if (!input.hasAcceptanceSnapshot) return false;
  if (input.isInternal || input.isStandingCapacity) return false;
  return !DISQUALIFYING_DATA_FLAGS.some((f) => input.dataQualityFlags.includes(f));
}

export function eligibleForCostAndPerformanceCalibration(input: {
  reliabilityEligible: boolean;
  outcomeClass: TaskOutcomeClassValue | null;
  metricsCompletenessBps: number;
  dataQualityFlags: string[];
}): boolean {
  if (!input.reliabilityEligible) return false;
  if (input.outcomeClass !== "workflow_success") return false;
  if (input.metricsCompletenessBps < COST_PERF_COMPLETENESS_FLOOR_BPS) return false;
  return !COST_PERF_EXCLUSION_FLAGS.some((f) => input.dataQualityFlags.includes(f));
}

export function eligibleForMarginStatistics(input: {
  costPerfEligible: boolean;
  recognizedRevenueMicros: bigint | null;
  workerPayoutNetIncurredCents: number | null;
}): boolean {
  if (!input.costPerfEligible) return false;
  // A margin without recognized revenue is not a low margin, it is an
  // unknown margin — and an authorization is not revenue. Zero is treated
  // like null here: a fully charged-back task recognizes 0n and has no
  // margin to measure, only a loss to count in reliability.
  if (input.recognizedRevenueMicros === null || input.recognizedRevenueMicros <= 0n) return false;
  return input.workerPayoutNetIncurredCents !== null;
}
