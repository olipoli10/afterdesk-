import "server-only";
import type { Prisma } from "@prisma-client";
import { COST_CATALOG, COST_CATALOG_VERSION } from "@/lib/ai-work-engine/cost-catalog";
import {
  EXECUTION_KEY_VERSION,
  PRICING_POLICY_VERSION,
  QUALITY_POLICY_VERSION,
} from "@/lib/operational-intelligence/policy";
import { buildExecutionWorkflowKey } from "@/lib/operational-intelligence/execution-workflow-key";
import { repeatWindowEndsAt } from "@/lib/operational-intelligence/repeat-window";

/**
 * THE BASELINE WRITE — called inside acceptQuote's transaction, right after
 * the TaskAcceptanceSnapshot, and at no other moment. Acceptance is the
 * last instant Task.estimatedMinutes and Task.vaPayoutCents still carry the
 * QUOTED values: finishRun overwrites both at handover
 * (workflow-runs.ts, action automated_processing_complete), which is
 * precisely why this row exists and why a Postgres trigger makes it
 * immutable.
 *
 * Three provenances, separated by prefix and never blended:
 *   planned*         — derived from the accepted plan's own steps
 *   estimated*       — the quote as it was actually computed
 *   modeled*AtQuote  — catalog constants that entered the price without
 *                      being in the plan (the flat reviewer minutes)
 */
export async function createOperationalBaseline(
  tx: Prisma.TransactionClient,
  input: { taskId: string; acceptedAt: Date }
): Promise<void> {
  const task = await tx.task.findUniqueOrThrow({
    where: { id: input.taskId },
    select: {
      clientId: true,
      categoryId: true,
      estimatedMinutes: true,
      vaPayoutCents: true,
      acceptanceSnapshot: { select: { id: true, planVersionId: true, clientPriceCents: true } },
      aiClassification: {
        select: {
          categorySlugGuess: true,
          deliverableFormat: true,
          quantityInterpreted: true,
          verificationLevel: true,
          sensitiveData: true,
          requiredAccess: true,
        },
      },
      category: { select: { slug: true } },
    },
  });
  const snapshot = task.acceptanceSnapshot;
  if (!snapshot) {
    // The caller creates the snapshot first, in this same transaction. A
    // missing one here is a programming error, and recording a baseline
    // with no contract to anchor it would be worse than failing.
    throw new Error(`operational baseline: task ${input.taskId} has no acceptance snapshot`);
  }

  const planVersion = snapshot.planVersionId
    ? await tx.taskExecutionPlanVersion.findUnique({
        where: { id: snapshot.planVersionId },
        select: {
          internalCostLikelyCents: true,
          internalCostConservativeCents: true,
          suggestedVaPayoutCents: true,
          calibration: true,
          steps: {
            orderBy: { order: "asc" },
            select: {
              executor: true,
              humanRole: true,
              primitiveId: true,
              primitiveVersion: true,
              estimatedMinutesOptimistic: true,
              estimatedMinutesLikely: true,
              estimatedMinutesConservative: true,
            },
          },
        },
      })
    : null;

  const c = task.aiClassification;
  const key = planVersion
    ? buildExecutionWorkflowKey({
        // NEVER categorySlugGuess: that field is free model prose, and the
        // key's privacy is structural only while every dimension is ours.
        categorySlug: task.category?.slug ?? null,
        deliverableFormat: c?.deliverableFormat ?? null,
        unitsRequested: c?.quantityInterpreted ?? null,
        verificationLevel: c?.verificationLevel ?? null,
        sensitiveData: c?.sensitiveData ?? null,
        requiredAccessCount: c?.requiredAccess.length ?? null,
        steps: planVersion.steps,
      })
    : null;

  const pert = (s: {
    estimatedMinutesOptimistic: number;
    estimatedMinutesLikely: number;
    estimatedMinutesConservative: number;
  }) =>
    (s.estimatedMinutesOptimistic + 4 * s.estimatedMinutesLikely + s.estimatedMinutesConservative) /
    6;

  const humanSteps = planVersion?.steps.filter((s) => s.executor === "human") ?? [];
  const plannedWorkerMinutes = planVersion
    ? Math.round(
        humanSteps.filter((s) => s.humanRole !== "reviewer").reduce((sum, s) => sum + pert(s), 0)
      )
    : null;
  // Authentically derivable: reviewer-role steps exist in real plans. NOT
  // the catalog's flat 20 minutes — that constant goes in modeled* below.
  const plannedReviewerMinutes = planVersion
    ? Math.round(
        humanSteps.filter((s) => s.humanRole === "reviewer").reduce((sum, s) => sum + pert(s), 0)
      )
    : null;
  const plannedAutomatedStepCount = planVersion
    ? planVersion.steps.filter((s) => s.primitiveId !== null && s.executor !== "human").length
    : null;

  const priorCompleted = await tx.task.count({
    where: { clientId: task.clientId, firstCompletedAt: { not: null } },
  });

  await tx.taskOperationalBaseline.create({
    data: {
      taskId: input.taskId,
      snapshotId: snapshot.id,
      planVersionId: snapshot.planVersionId,
      clientId: task.clientId,

      executionWorkflowKey: key?.key ?? null,
      executionWorkflowHash: key?.hash ?? null,
      executionKeyVersion: EXECUTION_KEY_VERSION,
      pricingPolicyVersion: PRICING_POLICY_VERSION,
      qualityPolicyVersion: QUALITY_POLICY_VERSION,
      costCatalogVersion: COST_CATALOG_VERSION,

      categoryId: task.categoryId,
      unitsRequested: c?.quantityInterpreted ?? null,
      verificationLevel: c?.verificationLevel ?? null,
      sensitiveData: c?.sensitiveData ?? null,
      requiredAccessCount: c ? c.requiredAccess.length : null,

      plannedWorkerMinutes,
      plannedReviewerMinutes,
      plannedAutomatedStepCount,
      plannedHumanStepCount: planVersion ? humanSteps.length : null,

      estimatedInternalCostLikelyCents: planVersion?.internalCostLikelyCents ?? null,
      estimatedInternalCostConservativeCents: planVersion?.internalCostConservativeCents ?? null,
      // The APPROVED payout the admin actually set, not the suggestion.
      estimatedWorkerPayoutCents: task.vaPayoutCents,
      estimatedWorkerMinutesAtQuote: task.estimatedMinutes,
      clientPriceCents: snapshot.clientPriceCents,

      modeledReviewerMinutesAtQuote: COST_CATALOG.reviewerMinutesPerDelivery,
      modeledReworkReservePctBps: Math.round(COST_CATALOG.reworkReservePct * 10_000),
      modeledStripeFeePctBps: Math.round(COST_CATALOG.stripeFeePct * 10_000),
      modeledStripeFeeFixedCents: COST_CATALOG.stripeFeeFixedCents,
      modeledTargetMarginBps: Math.round(COST_CATALOG.targetGrossMargin * 10_000),

      calibrationLevelAtQuote: planVersion?.calibration ?? null,
      clientPriorCompletedTaskCount: priorCompleted,
      repeatWindowEndsAt: repeatWindowEndsAt(input.acceptedAt),

      dataQualityFlags: [],
    },
  });
}
