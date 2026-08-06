import "server-only";
import { prisma } from "@/lib/db";

/**
 * OPERATIONAL-INTELLIGENCE READS — ADMIN ONLY, all of them. Same discipline
 * as queries/execution.ts: every function here is called exclusively behind
 * requireRole("ADMIN"), nothing is ever selected into a client or worker
 * payload, and price-wall.test.ts pins the relation names out of the
 * role-shaped selects.
 */

/** The Estimated vs Actual block on the admin task page. */
export async function operationalComparisonForAdmin(taskId: string) {
  const [baseline, actual] = await Promise.all([
    prisma.taskOperationalBaseline.findUnique({
      where: { taskId },
      select: {
        executionWorkflowKey: true,
        pricingPolicyVersion: true,
        qualityPolicyVersion: true,
        costCatalogVersion: true,
        calibrationLevelAtQuote: true,
        unitsRequested: true,
        plannedWorkerMinutes: true,
        plannedReviewerMinutes: true,
        plannedAutomatedStepCount: true,
        plannedHumanStepCount: true,
        estimatedInternalCostLikelyCents: true,
        estimatedInternalCostConservativeCents: true,
        estimatedWorkerPayoutCents: true,
        estimatedWorkerMinutesAtQuote: true,
        clientPriceCents: true,
        modeledReviewerMinutesAtQuote: true,
        modeledTargetMarginBps: true,
        dataQualityFlags: true,
        createdAt: true,
      },
    }),
    prisma.taskOperationalActual.findUnique({
      where: { taskId },
      select: {
        outcomeClass: true,
        deliveredAt: true,
        workerActiveSeconds: true,
        reviewerActiveSeconds: true,
        revisionActiveSeconds: true,
        automatedElapsedSeconds: true,
        unitsRequested: true,
        unitsPrefilled: true,
        unitsResolvedAutomatically: true,
        unitsSentToHuman: true,
        unitsResolvedByHuman: true,
        unitsUnresolved: true,
        unitsCorrectedByReviewer: true,
        automatedUnitRateBps: true,
        exceptionRateBps: true,
        aiCostMeteredMicros: true,
        toolCostMeteredMicros: true,
        reviewerLaborModeledFromMeasuredTimeMicros: true,
        paymentFeeModeledMicros: true,
        workerPayoutCurrentLiabilityCents: true,
        workerPayoutPaidCents: true,
        workerPayoutVoidedCents: true,
        workerPayoutNetIncurredCents: true,
        bookedAndMeteredCostMicros: true,
        modeledCostAddonMicros: true,
        allInCostWithModeledMicros: true,
        recognizedRevenueMicros: true,
        grossMarginBookedMeteredBps: true,
        grossMarginAllInModeledBps: true,
        costVarianceMicros: true,
        revisionRounds: true,
        passedQcFirstAttempt: true,
        criticalErrorCount: true,
        totalErrorCount: true,
        disputeOpened: true,
        clientAcceptedWithoutCorrection: true,
        repeatWithin90Days: true,
        metricsCompletenessBps: true,
        dataQualityFlags: true,
        eligibleForReliabilityStatistics: true,
        eligibleForCostAndPerformanceCalibration: true,
        eligibleForMarginStatistics: true,
        computedAt: true,
        computationVersion: true,
      },
    }),
  ]);
  return { baseline, actual };
}

export type OperationalComparison = Awaited<ReturnType<typeof operationalComparisonForAdmin>>;

/** The /admin/calibration list. */
export async function calibrationOverviewForAdmin() {
  return prisma.workflowCalibrationProfile.findMany({
    orderBy: [{ sampleSizeReliability: "desc" }, { lastExecutionAt: "desc" }],
    select: {
      executionWorkflowKey: true,
      executionWorkflowHash: true,
      calibrationLevel: true,
      sampleSizeReliability: true,
      sampleSizeCostPerf: true,
      sampleSizeMargin: true,
      commercialSuccessRateBps: true,
      technicalReliabilityRateBps: true,
      firstPassQcRateBps: true,
      medianAutomatedUnitRateBps: true,
      medianExceptionRateBps: true,
      medianAllInCostMicros: true,
      medianGrossMarginAllInBps: true,
      driftFlags: true,
      lastExecutionAt: true,
      lastComputedAt: true,
    },
  });
}

/** One workflow's full profile, by hash (the key itself is URL-hostile). */
export async function calibrationProfileForAdmin(hash: string) {
  const profile = await prisma.workflowCalibrationProfile.findFirst({
    where: { executionWorkflowHash: hash },
    include: { strata: { orderBy: [{ dimension: "asc" }, { policyVersion: "asc" }] } },
  });
  if (!profile) return null;
  const recentExecutions = await prisma.taskOperationalActual.findMany({
    where: { executionWorkflowKey: profile.executionWorkflowKey },
    orderBy: { computedAt: "desc" },
    take: 20,
    select: {
      taskId: true,
      outcomeClass: true,
      deliveredAt: true,
      allInCostWithModeledMicros: true,
      grossMarginAllInModeledBps: true,
      automatedUnitRateBps: true,
      metricsCompletenessBps: true,
      dataQualityFlags: true,
      eligibleForCostAndPerformanceCalibration: true,
    },
  });
  return { profile, recentExecutions };
}
