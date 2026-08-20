import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma-client";
import {
  bps,
  median,
  medianBig,
  percentile,
  percentileBig,
} from "@/lib/operational-intelligence/statistics";
import { decideCalibrationLevel } from "@/lib/operational-intelligence/calibration";
import { buildRecommendation } from "@/lib/operational-intelligence/recommendations";
import {
  PRICING_POLICY_VERSION,
  QUALITY_POLICY_VERSION,
  EXECUTION_KEY_VERSION,
} from "@/lib/operational-intelligence/policy";
import { EXTERNAL_OUTCOME_CLASSES } from "@/lib/operational-intelligence/outcome-class";
import { COST_CATALOG } from "@/lib/ai-work-engine/cost-catalog";

/**
 * PROFILE RECOMPUTE — a FULL REBUILD from the actuals, every time. Nothing
 * incremental: an incrementally-maintained aggregate and its source drift
 * apart the first time a bug ships, and nobody notices until the numbers
 * matter. Rebuilding from scratch is O(tasks-per-workflow), which stays
 * trivial for years at this product's volume.
 *
 * Denominator discipline (the whole point of the three eligibility gates):
 *  - RELIABILITY rates run over the wide set — commercial failures
 *    included, split into commercial success (all 8 outcome classes in the
 *    denominator) vs technical reliability (the three purely external
 *    interruptions excluded);
 *  - COST/PERFORMANCE distributions run over delivered, well-measured
 *    tasks only;
 *  - MARGIN over the subset with recognized revenue;
 *  - REPEAT over resolved windows only (open windows are censored).
 * Every rate is stored next to its own sample size.
 *
 * Strata: QC metrics per qualityPolicyVersion, estimate-variances and the
 * recommendation's cost distribution per pricingPolicyVersion. Pooled
 * metrics never mix into a stratum and vice versa.
 */

export const PROFILE_COMPUTATION_VERSION = 1;
const RECENT_WINDOW_DAYS = 90;

export async function recomputeWorkflowCalibration(executionWorkflowKey: string): Promise<void> {
  const now = new Date();
  const actuals = await prisma.taskOperationalActual.findMany({
    where: { executionWorkflowKey },
    select: {
      taskId: true,
      executionWorkflowHash: true,
      pricingPolicyVersion: true,
      qualityPolicyVersion: true,
      outcomeClass: true,
      deliveredAt: true,
      unitsRequested: true,
      unitsSentToHuman: true,
      automatedUnitRateBps: true,
      exceptionRateBps: true,
      aiCostMeteredMicros: true,
      toolCostMeteredMicros: true,
      allInCostWithModeledMicros: true,
      grossMarginAllInModeledBps: true,
      workerActiveSeconds: true,
      reviewerActiveSeconds: true,
      workerPayoutNetIncurredCents: true,
      revisionRounds: true,
      passedQcFirstAttempt: true,
      criticalErrorCount: true,
      disputeOpened: true,
      clientAcceptedWithoutCorrection: true,
      repeatWithin90Days: true,
      eligibleForReliabilityStatistics: true,
      eligibleForCostAndPerformanceCalibration: true,
      eligibleForMarginStatistics: true,
      metricsCompletenessBps: true,
      task: {
        select: {
          categoryId: true,
          operationalBaseline: {
            select: { estimatedInternalCostLikelyCents: true, estimatedWorkerPayoutCents: true },
          },
        },
      },
    },
  });
  if (actuals.length === 0) {
    // No actuals at all: nothing to profile. An existing profile stays as
    // its last honest computation rather than being zeroed.
    return;
  }

  const reliability = actuals.filter((a) => a.eligibleForReliabilityStatistics);
  const costPerf = actuals.filter((a) => a.eligibleForCostAndPerformanceCalibration);
  const margin = actuals.filter((a) => a.eligibleForMarginStatistics);
  const repeatResolved = reliability.filter((a) => a.repeatWithin90Days !== null);
  const recentCutoff = new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 3600 * 1000);
  const recent = costPerf.filter((a) => a.deliveredAt !== null && a.deliveredAt >= recentCutoff);

  // ── reliability: all eight outcome classes visible, none filtered ──
  const outcomeCounts: Record<string, number> = {};
  for (const a of reliability) {
    const key = a.outcomeClass ?? "in_flight";
    outcomeCounts[key] = (outcomeCounts[key] ?? 0) + 1;
  }
  const finished = reliability.filter((a) => a.outcomeClass !== null);
  const successes = finished.filter((a) => a.outcomeClass === "workflow_success").length;
  const technicalDenominator = finished.filter(
    (a) => !EXTERNAL_OUTCOME_CLASSES.includes(a.outcomeClass!)
  );
  const technicalSuccesses = technicalDenominator.filter(
    (a) => a.outcomeClass === "workflow_success"
  ).length;

  const delivered = reliability.filter((a) => a.deliveredAt !== null);
  const firstPassKnown = delivered.filter((a) => a.passedQcFirstAttempt !== null);
  const noCorrectionKnown = delivered.filter((a) => a.clientAcceptedWithoutCorrection !== null);

  // ── pooled distributions (cost/perf set) ──
  const rateArr = costPerf.map((a) => a.automatedUnitRateBps).filter((v): v is number => v !== null);
  const excArr = costPerf.map((a) => a.exceptionRateBps).filter((v): v is number => v !== null);
  const allInArr = costPerf.map((a) => a.allInCostWithModeledMicros);
  const aiPerUnit = costPerf
    .filter((a) => (a.unitsRequested ?? 0) > 0)
    .map((a) => a.aiCostMeteredMicros / BigInt(a.unitsRequested!));
  const toolPerUnit = costPerf
    .filter((a) => (a.unitsRequested ?? 0) > 0)
    .map((a) => a.toolCostMeteredMicros / BigInt(a.unitsRequested!));
  const workerSecPerException = costPerf
    .filter((a) => a.workerActiveSeconds !== null && (a.unitsSentToHuman ?? 0) > 0)
    .map((a) => Math.round(a.workerActiveSeconds! / a.unitsSentToHuman!));
  const reviewerSecPerUnit = costPerf
    .filter((a) => a.reviewerActiveSeconds !== null && (a.unitsRequested ?? 0) > 0)
    .map((a) => Math.round(a.reviewerActiveSeconds! / a.unitsRequested!));
  const marginArr = margin
    .map((a) => a.grossMarginAllInModeledBps)
    .filter((v): v is number => v !== null);
  const criticalShare = costPerf.filter((a) => (a.criticalErrorCount ?? 0) > 0).length;

  const p25AllIn = percentileBig(allInArr, 25);
  const p75AllIn = percentileBig(allInArr, 75);
  const completenessArr = costPerf.map((a) => a.metricsCompletenessBps);
  const criticalErrorRateBps = costPerf.length > 0 ? bps(criticalShare, costPerf.length) : null;

  const level = decideCalibrationLevel({
    sampleSizeCostPerf: costPerf.length,
    metricsCompletenessBps: median(completenessArr),
    varianceP25: p25AllIn === null ? null : Number(p25AllIn),
    varianceP75: p75AllIn === null ? null : Number(p75AllIn),
    criticalErrorRateBps,
    sampleSizeRecent: recent.length,
  });

  // ── strata ──
  type QualityStratum = {
    policyVersion: string;
    n: number;
    firstPassQcRateBps: number | null;
    criticalErrorRateBps: number | null;
    revisionRateBps: number | null;
    errorCountsBySeverity: { critical: number };
  };
  const qualityStrata = new Map<string, (typeof delivered)[number][]>();
  for (const a of delivered) {
    const v = a.qualityPolicyVersion ?? "unversioned";
    qualityStrata.set(v, [...(qualityStrata.get(v) ?? []), a]);
  }
  const qualityRows: QualityStratum[] = [...qualityStrata.entries()].map(([v, rows]) => {
    const fp = rows.filter((r) => r.passedQcFirstAttempt !== null);
    return {
      policyVersion: v,
      n: rows.length,
      firstPassQcRateBps:
        fp.length > 0 ? bps(fp.filter((r) => r.passedQcFirstAttempt).length, fp.length) : null,
      criticalErrorRateBps: bps(rows.filter((r) => (r.criticalErrorCount ?? 0) > 0).length, rows.length),
      revisionRateBps: bps(rows.filter((r) => (r.revisionRounds ?? 0) > 0).length, rows.length),
      errorCountsBySeverity: {
        critical: rows.reduce((s, r) => s + (r.criticalErrorCount ?? 0), 0),
      },
    };
  });

  const pricingStrata = new Map<string, (typeof costPerf)[number][]>();
  for (const a of costPerf) {
    const v = a.pricingPolicyVersion ?? "unversioned";
    pricingStrata.set(v, [...(pricingStrata.get(v) ?? []), a]);
  }
  const pricingRows = [...pricingStrata.entries()].map(([v, rows]) => {
    const costVariances = rows
      .filter((r) => r.task.operationalBaseline?.estimatedInternalCostLikelyCents != null)
      .map((r) => {
        const est = BigInt(r.task.operationalBaseline!.estimatedInternalCostLikelyCents!) * 10_000n;
        return est > 0n ? Number((r.allInCostWithModeledMicros * 10_000n) / est) - 10_000 : null;
      })
      .filter((x): x is number => x !== null);
    const payoutVariances = rows
      .filter(
        (r) =>
          r.task.operationalBaseline?.estimatedWorkerPayoutCents != null &&
          r.task.operationalBaseline.estimatedWorkerPayoutCents > 0
      )
      .map((r) =>
        Math.floor(
          (r.workerPayoutNetIncurredCents * 10_000) /
            r.task.operationalBaseline!.estimatedWorkerPayoutCents!
        ) - 10_000
      );
    const costs = rows.map((r) => r.allInCostWithModeledMicros);
    return {
      policyVersion: v,
      n: rows.length,
      medianCostVarianceBps: median(costVariances),
      medianPayoutVarianceBps: median(payoutVariances),
      allInCostP75Micros: percentileBig(costs, 75),
      allInCostP90Micros: percentileBig(costs, 90),
    };
  });

  const pricingVersions = [...pricingStrata.keys()].sort();
  const qualityVersions = [...qualityStrata.keys()].sort();
  const driftFlags = [...level.flags];
  if (pricingVersions.length > 1) driftFlags.push("POLICY_MIXED");

  // ── recommendation: ACTIVE policy stratum only, null over fallback ──
  const activeStratum = pricingRows.find((r) => r.policyVersion === PRICING_POLICY_VERSION);
  const recommendation = buildRecommendation({
    calibrationLevel: level.level,
    pricingPolicyVersion: activeStratum?.policyVersion ?? PRICING_POLICY_VERSION,
    qualityPolicyVersion: QUALITY_POLICY_VERSION,
    activePricingPolicyVersion: PRICING_POLICY_VERSION,
    activePolicyAllInCostP75Micros: activeStratum?.allInCostP75Micros ?? null,
    activePolicyAllInCostP90Micros: activeStratum?.allInCostP90Micros ?? null,
    activePolicySampleSize: activeStratum?.n ?? 0,
    targetMarginBps: Math.round(COST_CATALOG.targetGrossMargin * 10_000),
    paymentFeePctBps: Math.round(COST_CATALOG.stripeFeePct * 10_000),
    paymentFeeFixedCents: COST_CATALOG.stripeFeeFixedCents,
    minimumPriceCents: COST_CATALOG.minimumPriceCents,
    minimumMarginBps: Math.round(COST_CATALOG.minimumMargin * 10_000),
    policyMixed: pricingVersions.length > 1,
    missingData: [
      ...(costPerf.length < reliability.length
        ? [`${reliability.length - costPerf.length} task(s) excluded from cost distributions`]
        : []),
      ...(margin.length < costPerf.length
        ? [`${costPerf.length - margin.length} task(s) without recognized revenue`]
        : []),
    ],
  });

  const sample = actuals[0];
  const profileData = {
    executionWorkflowHash: sample.executionWorkflowHash ?? "",
    executionKeyVersion: EXECUTION_KEY_VERSION,
    categoryId: sample.task.categoryId,
    primitiveSignature: executionWorkflowKey.split("|").at(-2) ?? "",

    sampleSizeReliability: reliability.length,
    sampleSizeCostPerf: costPerf.length,
    sampleSizeMargin: margin.length,
    sampleSizeRepeatResolved: repeatResolved.length,
    sampleSizeRecent: recent.length,

    calibrationLevel: level.level,
    metricsCompletenessBps: median(completenessArr),

    commercialSuccessRateBps: finished.length > 0 ? bps(successes, finished.length) : null,
    technicalReliabilityRateBps:
      technicalDenominator.length > 0 ? bps(technicalSuccesses, technicalDenominator.length) : null,
    firstPassQcRateBps:
      firstPassKnown.length > 0
        ? bps(firstPassKnown.filter((a) => a.passedQcFirstAttempt).length, firstPassKnown.length)
        : null,
    disputeRateBps:
      delivered.length > 0 ? bps(delivered.filter((a) => a.disputeOpened).length, delivered.length) : null,
    revisionRateBps:
      delivered.length > 0
        ? bps(delivered.filter((a) => (a.revisionRounds ?? 0) > 0).length, delivered.length)
        : null,
    criticalErrorRateBps,
    noCorrectionRateBps:
      noCorrectionKnown.length > 0
        ? bps(
            noCorrectionKnown.filter((a) => a.clientAcceptedWithoutCorrection).length,
            noCorrectionKnown.length
          )
        : null,
    repeatWithin90dRateBps:
      repeatResolved.length > 0
        ? bps(repeatResolved.filter((a) => a.repeatWithin90Days).length, repeatResolved.length)
        : null,

    medianAutomatedUnitRateBps: median(rateArr),
    p25AutomatedUnitRateBps: percentile(rateArr, 25),
    p75AutomatedUnitRateBps: percentile(rateArr, 75),
    medianExceptionRateBps: median(excArr),

    medianAiCostPerUnitMicros: medianBig(aiPerUnit),
    p75AiCostPerUnitMicros: percentileBig(aiPerUnit, 75),
    medianToolCostPerUnitMicros: medianBig(toolPerUnit),

    medianWorkerSecondsPerException: median(workerSecPerException),
    p75WorkerSecondsPerException: percentile(workerSecPerException, 75),
    medianReviewerSecondsPerUnit: median(reviewerSecPerUnit),

    medianAllInCostMicros: medianBig(allInArr),
    p25AllInCostMicros: p25AllIn,
    p75AllInCostMicros: p75AllIn,
    p90AllInCostMicros: percentileBig(allInArr, 90),

    medianGrossMarginAllInBps: median(marginArr),
    p25GrossMarginAllInBps: percentile(marginArr, 25),

    outcomeCounts: outcomeCounts as Prisma.InputJsonValue,
    pricingPolicyVersions: pricingVersions,
    qualityPolicyVersions: qualityVersions,
    driftFlags,
    recommendation: recommendation as unknown as Prisma.InputJsonValue,
    recommendationGeneratedAt: now,
    lastExecutionAt:
      delivered
        .map((a) => a.deliveredAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    lastComputedAt: now,
    computationVersion: PROFILE_COMPUTATION_VERSION,
  };

  await prisma.$transaction(async (tx) => {
    const profile = await tx.workflowCalibrationProfile.upsert({
      where: { executionWorkflowKey },
      create: { executionWorkflowKey, ...profileData },
      update: profileData,
      select: { id: true },
    });
    // Full rebuild of the strata: delete-and-recreate is what guarantees a
    // removed policy version cannot linger as a stale row.
    await tx.workflowCalibrationStratum.deleteMany({ where: { profileId: profile.id } });
    await tx.workflowCalibrationStratum.createMany({
      data: [
        ...qualityRows.map((r) => ({
          profileId: profile.id,
          dimension: "quality" as const,
          policyVersion: r.policyVersion,
          n: r.n,
          firstPassQcRateBps: r.firstPassQcRateBps,
          criticalErrorRateBps: r.criticalErrorRateBps,
          revisionRateBps: r.revisionRateBps,
          errorCountsBySeverity: r.errorCountsBySeverity as Prisma.InputJsonValue,
        })),
        ...pricingRows.map((r) => ({
          profileId: profile.id,
          dimension: "pricing" as const,
          policyVersion: r.policyVersion,
          n: r.n,
          medianCostVarianceBps: r.medianCostVarianceBps,
          medianPayoutVarianceBps: r.medianPayoutVarianceBps,
          allInCostP75Micros: r.allInCostP75Micros,
          allInCostP90Micros: r.allInCostP90Micros,
        })),
      ],
    });
  });
}
