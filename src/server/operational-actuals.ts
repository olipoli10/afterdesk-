import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { canonicalHash } from "@/lib/operational-intelligence/fingerprint";
import {
  computeCostBreakdown,
  computeMargins,
  partitionPayouts,
  recognizeRevenue,
  type PayoutPartitionInput,
} from "@/lib/operational-intelligence/cost-provenance";
import {
  deriveOutcomeClass,
  type TaskOutcomeClassValue,
} from "@/lib/operational-intelligence/outcome-class";
import {
  COST_PERF_COMPLETENESS_FLOOR_BPS,
  eligibleForCostAndPerformanceCalibration,
  eligibleForMarginStatistics,
  eligibleForReliabilityStatistics,
} from "@/lib/operational-intelligence/eligibility";
import { resolveRepeatStatus } from "@/lib/operational-intelligence/repeat-window";
import { bps } from "@/lib/operational-intelligence/statistics";
import { COST_CATALOG } from "@/lib/ai-work-engine/cost-catalog";
import { metricsSchemaFor } from "@/lib/delivery-metrics";
import { recomputeWorkflowCalibration } from "@/server/workflow-calibration";

/**
 * THE OPERATIONAL ACTUAL — one recomputable projection per task, written
 * under a per-task advisory lock so beforeHash → upsert → TaskEvent is ONE
 * coherent transition, with an input fingerprint that catches IN-PLACE
 * mutations, not just row counts.
 *
 * Why counts are not enough (the mandate's own list): a payout re-armed to
 * a new amount, a session accumulating seconds, a refund corrected, a
 * payment captured — none of them changes any count. The fingerprint
 * therefore hashes counts AND max(updatedAt) AND the value sums of every
 * mutable source; append-only sources contribute count + max(createdAt).
 * An integration test mutates a payout amount mid-recompute and proves the
 * abort-and-retry path.
 *
 * Recompute discipline (the resolvePoolAudience lesson — Prisma interactive
 * transactions time out at 5 s): ALL heavy reads and all pure computation
 * happen OUTSIDE the transaction. Inside are only: the advisory lock, one
 * cheap fingerprint re-read, the upsert and the event. Equal significant
 * hashes write NOTHING — the silence is what proves idempotence and keeps
 * the journal a sequence of real transitions.
 */

export const ACTUAL_COMPUTATION_VERSION = 1;
const MAX_FINGERPRINT_RETRIES = 2;

type Db = Prisma.TransactionClient;

/** Cheap aggregate snapshot of every source that feeds the computation. */
async function fingerprintSources(db: Db, taskId: string): Promise<string> {
  /**
   * SEQUENTIAL on purpose: ten concurrent aggregates was exactly the burst
   * that toppled the fragile local prisma-dev proxy mid-e2e, and each query
   * here is a per-task indexed aggregate measured in single-digit
   * milliseconds — parallelism bought nothing but peak connections.
   */
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { updatedAt: true, status: true },
  });
  const events = await db.taskEvent.aggregate({
    // Our own recompute journal is an OUTPUT of this pipeline, not an
    // input: counting it would make every write look like a source
    // mutation to the next racer.
    where: { taskId, action: { not: "operational_actual_recomputed" } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const payments = await db.payment.aggregate({
    where: { taskId },
    _count: { _all: true },
    _max: { updatedAt: true },
    _sum: { amountCents: true, capturedAmountCents: true },
  });
  const refunds = await db.refund.aggregate({
    where: { payment: { taskId } },
    _count: { _all: true },
    _sum: { amountCents: true },
  });
  const payouts = await db.payout.aggregate({
    where: { taskId },
    _count: { _all: true },
    _max: { updatedAt: true },
    _sum: { amountCents: true },
  });
  const sessions = await db.taskWorkSession.aggregate({
    where: { taskId },
    _count: { _all: true },
    _max: { updatedAt: true },
    _sum: { accumulatedSeconds: true },
  });
  const submissions = await db.submission.aggregate({
    where: { taskId },
    _count: { _all: true },
    _max: { reviewedAt: true, submittedAt: true },
  });
  const reviews = await db.taskQualityReview.aggregate({
    where: { taskId },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const run = await db.taskWorkflowRun.findUnique({
    where: { taskId },
    select: {
      status: true,
      unitsTotal: true,
      unitsResolvedAutomatically: true,
      unitsPrefilled: true,
      unitsVerifiedByMachine: true,
      actualAiCostMicros: true,
      actualToolCostMicros: true,
      finishedAt: true,
    },
  });
  const ops = await db.aiOperation.aggregate({
    where: { taskId },
    _count: { _all: true },
    _sum: { attempts: true },
    _max: { updatedAt: true },
  });
  // Submissions have no updatedAt; count + max(reviewedAt) + the per-status
  // pending count cover every mutation path (create bumps count, a QC
  // decision sets reviewedAt, a supersede is always paired with a create).
  const pendingSubmissions = await db.submission.count({
    where: { taskId, qcStatus: "pending" },
  });
  const usage = await db.aiUsage.aggregate({
    where: { taskId },
    _count: { _all: true },
    _sum: { costMicros: true },
  });
  return canonicalHash({
    task,
    events,
    payments,
    refunds,
    payouts,
    sessions,
    submissions,
    pendingSubmissions,
    reviews,
    run,
    ops,
    usage,
  });
}

type AssembledActual = {
  data: Omit<
    Prisma.TaskOperationalActualUncheckedCreateInput,
    "taskId" | "inputFingerprint" | "computedAt" | "computationVersion"
  >;
  workflowKey: string | null;
};

async function loadAndAssemble(taskId: string, now: Date): Promise<AssembledActual | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      status: true,
      isInternal: true,
      standingCapacityAccountId: true,
      clientId: true,
      claimedAt: true,
      firstCompletedAt: true,
      revisionRounds: true,
      revisionWindowEndsAt: true,
      disputeWindowEndsAt: true,
      acceptanceSnapshot: { select: { id: true, createdAt: true } },
      operationalBaseline: {
        select: {
          executionWorkflowKey: true,
          executionWorkflowHash: true,
          pricingPolicyVersion: true,
          qualityPolicyVersion: true,
          unitsRequested: true,
          estimatedInternalCostLikelyCents: true,
          repeatWindowEndsAt: true,
          createdAt: true,
        },
      },
      workflowRun: {
        select: {
          id: true,
          status: true,
          startedAt: true,
          compiledAt: true,
          finishedAt: true,
          unitsTotal: true,
          unitsResolvedAutomatically: true,
          unitsPrefilled: true,
          unitsVerifiedByMachine: true,
          actualAiCostMicros: true,
          actualToolCostMicros: true,
          steps: {
            where: { status: "failed" },
            select: { invocations: { where: { ok: false }, select: { id: true }, take: 1 } },
          },
        },
      },
      aiClassification: { select: { quantityInterpreted: true, categorySlugGuess: true } },
      category: { select: { slug: true } },
      events: { select: { action: true, reason: true, createdAt: true } },
      payments: {
        select: {
          status: true,
          amountCents: true,
          capturedAmountCents: true,
          refunds: { select: { amountCents: true } },
        },
      },
      payouts: { select: { status: true, amountCents: true } },
      disputes: { select: { outcome: true } },
      submissions: {
        orderBy: { attemptNo: "asc" },
        select: { attemptNo: true, qcStatus: true, deliveryMetrics: true },
      },
      qualityReviews: {
        select: {
          criticalErrorCount: true,
          majorErrorCount: true,
          minorErrorCount: true,
          duplicateCount: true,
          invalidSourceCount: true,
          missingSourceCount: true,
          formattingErrorCount: true,
          correctedByReviewerCount: true,
        },
      },
      workSessions: {
        select: { role: true, phase: true, accumulatedSeconds: true },
      },
    },
  });
  if (!task) return null;

  const flags = new Set<string>();
  const baseline = task.operationalBaseline;
  const run = task.workflowRun;
  const actions = new Set(task.events.map((e) => e.action));
  if (task.events.some((e) => e.reason === "e2e")) flags.add("E2E_DATA");

  // ── outcome class ──
  const outcomeClass: TaskOutcomeClassValue | null = deriveOutcomeClass({
    status: task.status,
    everDelivered: task.firstCompletedAt !== null,
    disputeUpheld: task.disputes.some((d) => d.outcome === "upheld"),
    paymentCancelledOrChargeback: task.payments.some((p) =>
      ["cancelled", "chargeback"].includes(p.status)
    ),
    paymentWindowExpired: actions.has("payment_window_expired"),
    cancelledByClient: false, // no client-cancel path exists in the product
    cancelledByAdmin: actions.has("admin_cancelled"),
    workerExhaustedOrAbandoned:
      actions.has("admin_qc_rejected_exhausted") || actions.has("va_released"),
    runFailedWithProviderErrors:
      run !== null &&
      ["paused", "abandoned"].includes(run.status) &&
      run.steps.some((s) => s.invocations.length > 0),
    runFailedOtherwise: run !== null && ["paused", "abandoned"].includes(run.status),
  });

  // ── money ──
  const payoutPartition = partitionPayouts(
    task.payouts.map((p) => ({ status: p.status, amountCents: p.amountCents }) as PayoutPartitionInput)
  );
  if (actions.has("payout_amount_rearmed")) flags.add("PAYOUT_REARMED");

  const revenue = recognizeRevenue({
    payments: task.payments.map((p) => ({
      status: p.status,
      amountCents: p.amountCents,
      capturedAmountCents: p.capturedAmountCents,
      refundedCents: p.refunds.reduce((s, r) => s + r.amountCents, 0),
    })),
  });

  // ── time from sessions (accumulated only — a running stint is not yet a fact) ──
  const sessions = task.workSessions;
  const secondsOf = (pred: (s: (typeof sessions)[number]) => boolean) => {
    const rows = sessions.filter(pred);
    return rows.length === 0 ? null : rows.reduce((sum, s) => sum + s.accumulatedSeconds, 0);
  };
  const workerActiveSeconds = secondsOf(
    (s) => s.role === "worker" && (s.phase === "residual_work" || s.phase === "manual_fallback")
  );
  const revisionActiveSeconds = secondsOf((s) => s.role === "worker" && s.phase === "revision");
  const reviewerActiveSeconds = secondsOf((s) => s.role === "reviewer");
  if (workerActiveSeconds === null && task.claimedAt !== null) flags.add("MISSING_WORKER_TIME");
  if (reviewerActiveSeconds === null && task.qualityReviews.length > 0)
    flags.add("MISSING_REVIEWER_TIME");

  // ── AI usage (pre-quote pipeline) + unaccounted attempts ──
  const usageAgg = await prisma.aiUsage.aggregate({
    where: { taskId },
    _sum: { costMicros: true },
    _count: { _all: true },
  });
  const opsAgg = await prisma.aiOperation.aggregate({
    where: { taskId },
    _sum: { attempts: true },
  });
  const usageWithOp = await prisma.aiUsage.count({
    where: { taskId, operationId: { not: null } },
  });
  if ((opsAgg._sum.attempts ?? 0) > usageWithOp) flags.add("AI_ATTEMPT_UNACCOUNTED");

  const breakdown = computeCostBreakdown({
    aiInvocationMicros: BigInt(run?.actualAiCostMicros ?? 0),
    toolInvocationMicros: BigInt(run?.actualToolCostMicros ?? 0),
    pipelineAiMicros: BigInt(usageAgg._sum.costMicros ?? 0),
    payoutPartition,
    reviewerMeasuredSeconds: reviewerActiveSeconds,
    reviewerHourlyUsd: COST_CATALOG.reviewerHourlyUsd,
    recognizedRevenueMicros: revenue.recognizedRevenueMicros,
    paymentFeePctBps: Math.round(COST_CATALOG.stripeFeePct * 10_000),
    paymentFeeFixedCents: COST_CATALOG.stripeFeeFixedCents,
  });
  const margins = computeMargins({
    recognizedRevenueMicros: revenue.recognizedRevenueMicros,
    bookedAndMeteredCostMicros: breakdown.bookedAndMeteredCostMicros,
    allInCostWithModeledMicros: breakdown.allInCostWithModeledMicros,
  });
  for (const f of [...breakdown.flags, ...revenue.flags]) flags.add(f);

  // ── units ──
  const unitsRequested =
    baseline?.unitsRequested ?? task.aiClassification?.quantityInterpreted ?? run?.unitsTotal ?? null;
  const unitsSentToHuman =
    run !== null && run.unitsTotal !== null && run.unitsResolvedAutomatically !== null
      ? Math.max(0, run.unitsTotal - run.unitsResolvedAutomatically)
      : null;

  // The worker's own structured declaration, present only for the two
  // metrics categories. Everything derived from it is null elsewhere —
  // never zero — with the flag saying why.
  const approvedMetrics = task.submissions
    .filter((s) => s.qcStatus === "approved" && s.deliveryMetrics !== null)
    .at(-1)?.deliveryMetrics;
  let unitsUnresolved: number | null = null;
  if (approvedMetrics && typeof approvedMetrics === "object") {
    const parsedCategory = (approvedMetrics as { category?: string }).category;
    const schema = metricsSchemaFor(parsedCategory);
    const parsed = schema?.safeParse(approvedMetrics);
    if (parsed?.success) {
      unitsUnresolved = (parsed.data as { recordsWithGap: number }).recordsWithGap;
    }
  }
  if (unitsUnresolved === null && task.firstCompletedAt !== null) flags.add("NO_CATEGORY_METRICS");
  const unitsResolvedByHuman =
    unitsSentToHuman !== null && unitsUnresolved !== null
      ? Math.max(0, unitsSentToHuman - unitsUnresolved)
      : null;

  // ── quality ──
  const criticalErrorCount =
    task.qualityReviews.length > 0
      ? task.qualityReviews.reduce((s, r) => s + r.criticalErrorCount, 0)
      : null;
  const totalErrorCount =
    task.qualityReviews.length > 0
      ? task.qualityReviews.reduce(
          (s, r) =>
            s +
            r.criticalErrorCount +
            r.majorErrorCount +
            r.minorErrorCount +
            r.duplicateCount +
            r.invalidSourceCount +
            r.missingSourceCount +
            r.formattingErrorCount,
          0
        )
      : null;
  const unitsCorrectedByReviewer =
    task.qualityReviews.length > 0
      ? task.qualityReviews.reduce((s, r) => s + r.correctedByReviewerCount, 0)
      : null;

  const qcDecisionActions = task.events.filter((e) =>
    ["admin_qc_rejected", "admin_qc_rejected_exhausted"].includes(e.action)
  );
  const passedQcFirstAttempt =
    task.firstCompletedAt !== null
      ? qcDecisionActions.length === 0 && (task.revisionRounds ?? 0) === 0
      : null;

  // ── client acceptance & repetition, both censored honestly ──
  const windowsClosed =
    task.revisionWindowEndsAt !== null &&
    task.disputeWindowEndsAt !== null &&
    task.revisionWindowEndsAt < now &&
    task.disputeWindowEndsAt < now;
  const clientAcceptedWithoutCorrection =
    task.firstCompletedAt === null
      ? null
      : task.disputes.length > 0 || (task.revisionRounds ?? 0) > 0
        ? false
        : windowsClosed
          ? true
          : null;

  let repeatWithin90Days: boolean | null = null;
  if (baseline && task.acceptanceSnapshot) {
    /**
     * Anchored on the SNAPSHOT's createdAt — the real acceptance instant.
     * baseline.createdAt is the row's own birth, which for a BACKFILLED
     * cohort is the day the backfill ran: anchoring there made every real
     * historical repeat invisible and resolved the whole cohort to false —
     * the exact censoring bias this tri-state exists to prevent.
     */
    const acceptedAt = task.acceptanceSnapshot.createdAt;
    const nextAccepted = await prisma.taskAcceptanceSnapshot.findFirst({
      where: {
        createdAt: { gt: acceptedAt },
        task: { clientId: task.clientId, id: { not: taskId } },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    repeatWithin90Days = resolveRepeatStatus({
      acceptedAt,
      windowEndsAt: baseline.repeatWindowEndsAt,
      nextAcceptedAt: nextAccepted?.createdAt ?? null,
      now,
    });
  }

  // ── completeness: applicable components only, never credit for N/A ──
  const components: boolean[] = [];
  components.push(baseline !== null);
  if (run) components.push(run.finishedAt !== null);
  if (task.claimedAt !== null) components.push(workerActiveSeconds !== null);
  if (task.firstCompletedAt !== null) {
    components.push(task.qualityReviews.length > 0);
    components.push(reviewerActiveSeconds !== null);
    components.push(payoutPartition.workerPayoutNetIncurredCents > 0);
    components.push(revenue.recognizedRevenueMicros !== null);
    components.push(unitsUnresolved !== null);
  }
  const metricsCompletenessBps =
    components.length === 0
      ? 0
      : Math.floor((components.filter(Boolean).length * 10_000) / components.length);
  /**
   * PARTIAL_TELEMETRY marks completeness BELOW THE FOUNDER FLOOR (7000), not
   * below perfection. The first cut flagged anything under 100% — and since
   * the flag also disqualifies from cost/perf, the 7000 floor became dead
   * code and nothing could ever calibrate (adversarial finding: a category
   * without a metrics schema tops out at ~8750 bps by construction).
   */
  if (metricsCompletenessBps < COST_PERF_COMPLETENESS_FLOOR_BPS && components.length > 1) {
    flags.add("PARTIAL_TELEMETRY");
  }

  // ── eligibility, three gates ──
  const reliabilityEligible = eligibleForReliabilityStatistics({
    hasAcceptanceSnapshot: task.acceptanceSnapshot !== null,
    isInternal: task.isInternal,
    isStandingCapacity: task.standingCapacityAccountId !== null,
    dataQualityFlags: [...flags],
  });
  const costPerfEligible = eligibleForCostAndPerformanceCalibration({
    reliabilityEligible,
    outcomeClass,
    metricsCompletenessBps,
    dataQualityFlags: [...flags],
  });
  const marginEligible = eligibleForMarginStatistics({
    costPerfEligible,
    recognizedRevenueMicros: revenue.recognizedRevenueMicros,
    workerPayoutNetIncurredCents:
      payoutPartition.workerPayoutNetIncurredCents > 0
        ? payoutPartition.workerPayoutNetIncurredCents
        : null,
  });

  const estimatedLikelyMicros =
    baseline?.estimatedInternalCostLikelyCents != null
      ? BigInt(baseline.estimatedInternalCostLikelyCents) * 10_000n
      : null;

  return {
    workflowKey: baseline?.executionWorkflowKey ?? null,
    data: {
      snapshotId: task.acceptanceSnapshot?.id ?? null,
      workflowRunId: run?.id ?? null,
      executionWorkflowKey: baseline?.executionWorkflowKey ?? null,
      executionWorkflowHash: baseline?.executionWorkflowHash ?? null,
      pricingPolicyVersion: baseline?.pricingPolicyVersion ?? null,
      qualityPolicyVersion: baseline?.qualityPolicyVersion ?? null,

      outcomeClass,
      deliveredAt: task.firstCompletedAt,

      executionStartedAt: run?.startedAt ?? task.claimedAt,
      executionFinishedAt: task.firstCompletedAt,
      automatedElapsedSeconds:
        run?.compiledAt && run?.finishedAt
          ? Math.max(0, Math.floor((run.finishedAt.getTime() - run.compiledAt.getTime()) / 1000))
          : null,
      workerActiveSeconds,
      reviewerActiveSeconds,
      revisionActiveSeconds,

      unitsRequested,
      unitsDiscovered: run?.unitsPrefilled ?? null,
      unitsPrefilled: run?.unitsPrefilled ?? null,
      unitsResolvedAutomatically: run?.unitsResolvedAutomatically ?? null,
      unitsSentToHuman,
      unitsResolvedByHuman,
      unitsUnresolved,
      unitsCorrectedByReviewer,
      automatedUnitRateBps:
        unitsRequested !== null && run?.unitsResolvedAutomatically != null
          ? bps(run.unitsResolvedAutomatically, unitsRequested)
          : null,
      exceptionRateBps:
        unitsRequested !== null && unitsSentToHuman !== null
          ? bps(unitsSentToHuman, unitsRequested)
          : null,

      aiCostMeteredMicros: breakdown.aiCostMeteredMicros,
      toolCostMeteredMicros: breakdown.toolCostMeteredMicros,
      reviewerLaborModeledFromMeasuredTimeMicros:
        breakdown.reviewerLaborModeledFromMeasuredTimeMicros,
      paymentFeeModeledMicros: breakdown.paymentFeeModeledMicros,

      workerPayoutCurrentLiabilityCents: payoutPartition.workerPayoutCurrentLiabilityCents,
      workerPayoutPaidCents: payoutPartition.workerPayoutPaidCents,
      workerPayoutVoidedCents: payoutPartition.workerPayoutVoidedCents,
      workerPayoutNetIncurredCents: payoutPartition.workerPayoutNetIncurredCents,

      bookedAndMeteredCostMicros: breakdown.bookedAndMeteredCostMicros,
      modeledCostAddonMicros: breakdown.modeledCostAddonMicros,
      allInCostWithModeledMicros: breakdown.allInCostWithModeledMicros,

      recognizedRevenueMicros: revenue.recognizedRevenueMicros,
      grossMarginBookedMeteredMicros: margins.grossMarginBookedMeteredMicros,
      grossMarginBookedMeteredBps: margins.grossMarginBookedMeteredBps,
      grossMarginAllInModeledMicros: margins.grossMarginAllInModeledMicros,
      grossMarginAllInModeledBps: margins.grossMarginAllInModeledBps,
      /**
       * Variance against COMPARABLES: the estimated internal cost includes
       * worker + AI + tools + reviewer + rework, but NOT the payment fee
       * (pricing folds that into the price denominator, never the cost). So
       * the actual side here is booked+metered plus the modeled reviewer —
       * all-in would carry the fee and read permanently "over estimate" by
       * construction.
       */
      costVarianceMicros:
        estimatedLikelyMicros !== null
          ? breakdown.bookedAndMeteredCostMicros +
            (breakdown.reviewerLaborModeledFromMeasuredTimeMicros ?? 0n) -
            estimatedLikelyMicros
          : null,

      revisionRounds: task.revisionRounds,
      passedQcFirstAttempt,
      criticalErrorCount,
      totalErrorCount,
      disputeOpened: task.disputes.length > 0,
      clientRevisionRequested: (task.revisionRounds ?? 0) > 0,
      clientAcceptedWithoutCorrection,
      repeatWithin90Days,

      eligibleForReliabilityStatistics: reliabilityEligible,
      eligibleForCostAndPerformanceCalibration: costPerfEligible,
      eligibleForMarginStatistics: marginEligible,

      metricsCompletenessBps,
      dataQualityFlags: [...flags].sort(),
    },
  };
}

/** The subset whose change constitutes a "significant recompute". */
function significantState(data: AssembledActual["data"]): Record<string, unknown> {
  // Timestamps that merely restate other fields are excluded so a recompute
  // at a later wall-clock does not fabricate a transition.
  const rest: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  delete rest.executionStartedAt;
  delete rest.executionFinishedAt;
  delete rest.deliveredAt;
  return rest;
}

/**
 * The stored row seen THROUGH the assembled shape: same keys, same
 * normalization (undefined → null). Hashing the raw Prisma row instead
 * would drag id/createdAt/updatedAt/inputFingerprint into the comparison
 * and no recompute could ever be "unchanged" — the exact bug the
 * integration suite caught on its first real run.
 */
function significantOfRow(
  row: Record<string, unknown>,
  shape: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) out[key] = row[key] ?? null;
  return out;
}

export type RecomputeResult =
  | { outcome: "written"; changedFields: string[] }
  | { outcome: "unchanged" }
  | { outcome: "skipped"; reason: string };

/**
 * Serialized per task by pg_advisory_xact_lock (the standing-period /
 * academy / claim-cap motif — hashtext collisions between two taskIds cost
 * an occasional harmless serialization, the accepted trade at all three
 * existing sites). The xact variant releases on commit AND rollback.
 */
export async function computeTaskOperationalActual(
  taskId: string,
  reason: string
): Promise<RecomputeResult> {
  const now = new Date();
  for (let attempt = 1; attempt <= MAX_FINGERPRINT_RETRIES; attempt++) {
    const fingerprintBefore = await fingerprintSources(prisma, taskId);
    const assembled = await loadAndAssemble(taskId, now);
    if (!assembled) return { outcome: "skipped", reason: "task not found" };

    const afterHash = canonicalHash(significantState(assembled.data));

    const written = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"op-actual:" + taskId}))`;

      const fingerprintUnderLock = await fingerprintSources(tx, taskId);
      if (fingerprintUnderLock !== fingerprintBefore) return "retry" as const;

      const current = await tx.taskOperationalActual.findUnique({
        where: { taskId },
      });
      const afterSig = significantState(assembled.data);
      const beforeHash = current
        ? canonicalHash(significantOfRow(current as unknown as Record<string, unknown>, afterSig))
        : null;
      if (beforeHash === afterHash) return "unchanged" as const;

      const changedFields = current
        ? Object.keys(afterSig).filter(
            (k) =>
              canonicalHash({ v: afterSig[k] ?? null }) !==
              canonicalHash({ v: (current as Record<string, unknown>)[k] ?? null })
          )
        : ["*created*"];

      await tx.taskOperationalActual.upsert({
        where: { taskId },
        create: {
          taskId,
          ...assembled.data,
          inputFingerprint: fingerprintUnderLock,
          computedAt: now,
          computationVersion: ACTUAL_COMPUTATION_VERSION,
        },
        update: {
          ...assembled.data,
          inputFingerprint: fingerprintUnderLock,
          computedAt: now,
          computationVersion: ACTUAL_COMPUTATION_VERSION,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId,
          action: "operational_actual_recomputed",
          meta: {
            computationVersion: ACTUAL_COMPUTATION_VERSION,
            reason,
            beforeHash,
            afterHash,
            changedFields,
          },
        },
      });
      return changedFields;
    });

    if (written === "retry") continue;
    if (written === "unchanged") return { outcome: "unchanged" };
    return { outcome: "written", changedFields: written };
  }
  return { outcome: "skipped", reason: "sources kept mutating; the next trigger recomputes" };
}

/**
 * The one entry point callers use. Never throws (an intelligence failure
 * must never break a payment or a QC decision); recomputes the profile only
 * when the actual actually changed.
 */
export async function recomputeOperationalIntelligence(
  taskId: string,
  reason: string
): Promise<void> {
  try {
    const result = await computeTaskOperationalActual(taskId, reason);
    if (result.outcome !== "written") return;
    const actual = await prisma.taskOperationalActual.findUnique({
      where: { taskId },
      select: { executionWorkflowKey: true },
    });
    if (actual?.executionWorkflowKey) {
      await recomputeWorkflowCalibration(actual.executionWorkflowKey);
    }
  } catch (error) {
    console.error("[operational-intelligence] recompute failed", { taskId, reason, error });
  }
}

// ── Repeat-window triggers ────────────────────────────────────────────────

/**
 * Fired when THIS client accepts a new task: every still-open window of
 * their earlier tasks may have just flipped to true.
 */
export async function recomputeOpenRepeatWindowsForClient(clientId: string): Promise<void> {
  try {
    const open = await prisma.taskOperationalBaseline.findMany({
      where: { clientId, repeatWindowEndsAt: { gt: new Date() } },
      select: { taskId: true },
      take: 50,
    });
    for (const b of open) {
      await recomputeOperationalIntelligence(b.taskId, "client_accepted_new_task");
    }
  } catch (error) {
    console.error("[operational-intelligence] repeat-window recompute failed", { clientId, error });
  }
}

/**
 * The sweep half of censoring: a window that expired with no repeat must be
 * WRITTEN as false — leaving it null forever would silently remove the
 * task from the repeat denominator, which is the exact bias the tri-state
 * exists to prevent.
 */
export async function closeExpiredRepeatWindows(): Promise<number> {
  const expired = await prisma.taskOperationalBaseline.findMany({
    where: {
      repeatWindowEndsAt: { lte: new Date() },
      task: { operationalActual: { is: { repeatWithin90Days: null } } },
    },
    select: { taskId: true },
    take: 50,
  });
  for (const b of expired) {
    await recomputeOperationalIntelligence(b.taskId, "repeat_window_expired");
  }
  return expired.length;
}

/**
 * The catch-up sweep: tasks whose sources moved after their actual was
 * computed (or that have a baseline and no actual yet). Payments, payouts
 * and sessions all carry updatedAt precisely so this query can see
 * in-place mutations.
 */
export async function recomputeStaleOperationalActuals(): Promise<number> {
  const limit = 25;
  const candidates = new Set<string>();

  const noActual = await prisma.taskOperationalBaseline.findMany({
    where: { task: { operationalActual: null } },
    select: { taskId: true },
    take: limit,
  });
  for (const b of noActual) candidates.add(b.taskId);

  // Prisma cannot compare a column against another relation's column, so
  // the staleness scan is raw SQL over the indexed timestamps.
  const rows = await prisma.$queryRaw<{ taskId: string }[]>`
    SELECT a."taskId" FROM "TaskOperationalActual" a
    WHERE EXISTS (SELECT 1 FROM "TaskEvent" e
                  WHERE e."taskId" = a."taskId" AND e."createdAt" > a."computedAt"
                    AND e."action" <> 'operational_actual_recomputed')
       OR EXISTS (SELECT 1 FROM "Payment" p
                  WHERE p."taskId" = a."taskId" AND p."updatedAt" > a."computedAt")
       OR EXISTS (SELECT 1 FROM "Payout" po
                  WHERE po."taskId" = a."taskId" AND po."updatedAt" > a."computedAt")
       OR EXISTS (SELECT 1 FROM "TaskWorkSession" s
                  WHERE s."taskId" = a."taskId" AND s."updatedAt" > a."computedAt")
    LIMIT ${limit}`;
  for (const r of rows) candidates.add(r.taskId);

  let done = 0;
  for (const taskId of [...candidates].slice(0, limit)) {
    await recomputeOperationalIntelligence(taskId, "stale_sweep");
    done++;
  }
  return done;
}
