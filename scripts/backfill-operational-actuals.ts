import { prisma } from "@/lib/db";
import { COST_CATALOG, COST_CATALOG_VERSION } from "@/lib/ai-work-engine/cost-catalog";
import {
  EXECUTION_KEY_VERSION,
  PRICING_POLICY_VERSION,
  QUALITY_POLICY_VERSION,
} from "@/lib/operational-intelligence/policy";
import { buildExecutionWorkflowKey } from "@/lib/operational-intelligence/execution-workflow-key";
import { repeatWindowEndsAt } from "@/lib/operational-intelligence/repeat-window";
import { recomputeOperationalIntelligence } from "@/server/operational-actuals";

/**
 * HONEST BACKFILL — idempotent, non-destructive, and it invents NOTHING.
 *
 * For every task that has an acceptance snapshot but no baseline, it
 * reconstructs only what the historical record can actually prove:
 *
 *  - the quoted client price: from the snapshot (immutable, trustworthy);
 *  - the quoted worker payout: from TaskHumanWorkPackage.reservedBudgetCents
 *    when a run exists (that column IS the pre-overwrite quote), else from
 *    Task.vaPayoutCents ONLY when no run ever overwrote it;
 *  - the quoted worker minutes: NULL whenever a run finished — finishRun
 *    overwrote Task.estimatedMinutes with the residual, and no source
 *    remembers the original. Null + flag, never a guess;
 *  - plan-derived fields from the accepted plan version, verbatim.
 *
 * Every backfilled baseline carries BACKFILLED in dataQualityFlags, and the
 * actuals are then produced by the SAME recompute pipeline as live tasks
 * (which adds its own flags: E2E_DATA, MISSING_WORKER_TIME, …).
 *
 * Run it deliberately, never automatically:
 *   npx tsx scripts/backfill-operational-actuals.ts
 * It refuses to run unless BACKFILL_CONFIRM=1 — one more explicit gate
 * between "the script exists" and "the script wrote".
 */

async function main() {
  if (process.env.BACKFILL_CONFIRM !== "1") {
    console.error("Refusing to run: set BACKFILL_CONFIRM=1 to write the backfill.");
    process.exit(1);
  }

  const candidates = await prisma.task.findMany({
    where: { acceptanceSnapshot: { isNot: null }, operationalBaseline: null },
    select: {
      id: true,
      clientId: true,
      categoryId: true,
      estimatedMinutes: true,
      vaPayoutCents: true,
      acceptanceSnapshot: { select: { id: true, planVersionId: true, clientPriceCents: true, createdAt: true } },
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
      workflowRun: { select: { finishedAt: true } },
      humanWorkPackage: { select: { reservedBudgetCents: true } },
    },
  });

  let created = 0;
  let incomplete = 0;
  const skipped: string[] = [];

  for (const task of candidates) {
    const snapshot = task.acceptanceSnapshot!;
    const flags = ["BACKFILLED"];

    const planVersion = snapshot.planVersionId
      ? await prisma.taskExecutionPlanVersion.findUnique({
          where: { id: snapshot.planVersionId },
          select: {
            internalCostLikelyCents: true,
            internalCostConservativeCents: true,
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

    /**
     * The overwrite predicate is THE PACKAGE, not run.finishedAt: only
     * finishRun's success branch rewrites the Task columns, and that branch
     * is exactly the one that creates TaskHumanWorkPackage. A run abandoned
     * by the sweep has finishedAt set but never touched the task — its
     * quoted pair is intact and must be kept, not nulled with a lying flag.
     */
    const overwroteQuote = task.humanWorkPackage != null;
    const estimatedWorkerPayoutCents =
      task.humanWorkPackage?.reservedBudgetCents ?? (overwroteQuote ? null : task.vaPayoutCents);
    const estimatedWorkerMinutesAtQuote = overwroteQuote ? null : task.estimatedMinutes;
    if (overwroteQuote) flags.push("QUOTED_MINUTES_LOST_TO_OVERWRITE");
    flags.push("POLICY_VERSION_ASSUMED");
    if (estimatedWorkerPayoutCents === null) incomplete++;

    const c = task.aiClassification;
    const key = planVersion
      ? buildExecutionWorkflowKey({
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
      (s.estimatedMinutesOptimistic + 4 * s.estimatedMinutesLikely + s.estimatedMinutesConservative) / 6;
    const humanSteps = planVersion?.steps.filter((s) => s.executor === "human") ?? [];

    try {
      await prisma.taskOperationalBaseline.create({
        data: {
          taskId: task.id,
          snapshotId: snapshot.id,
          planVersionId: snapshot.planVersionId,
          clientId: task.clientId,
          executionWorkflowKey: key?.key ?? null,
          executionWorkflowHash: key?.hash ?? null,
          executionKeyVersion: EXECUTION_KEY_VERSION,
          /**
           * SUFFIXED #backfilled: these acceptances happened under policy
           * versions nobody recorded, and stamping today's would merge them
           * into the ACTIVE stratum the price recommendation reads. Their
           * own stratum keeps them visible without contaminating it.
           */
          pricingPolicyVersion: `${PRICING_POLICY_VERSION}#backfilled`,
          qualityPolicyVersion: `${QUALITY_POLICY_VERSION}#backfilled`,
          costCatalogVersion: COST_CATALOG_VERSION,
          categoryId: task.categoryId,
          unitsRequested: c?.quantityInterpreted ?? null,
          verificationLevel: c?.verificationLevel ?? null,
          sensitiveData: c?.sensitiveData ?? null,
          requiredAccessCount: c ? c.requiredAccess.length : null,
          plannedWorkerMinutes: planVersion
            ? Math.round(
                humanSteps.filter((s) => s.humanRole !== "reviewer").reduce((x, s) => x + pert(s), 0)
              )
            : null,
          plannedReviewerMinutes: planVersion
            ? Math.round(
                humanSteps.filter((s) => s.humanRole === "reviewer").reduce((x, s) => x + pert(s), 0)
              )
            : null,
          plannedAutomatedStepCount: planVersion
            ? planVersion.steps.filter((s) => s.primitiveId !== null && s.executor !== "human").length
            : null,
          plannedHumanStepCount: planVersion ? humanSteps.length : null,
          estimatedInternalCostLikelyCents: planVersion?.internalCostLikelyCents ?? null,
          estimatedInternalCostConservativeCents: planVersion?.internalCostConservativeCents ?? null,
          estimatedWorkerPayoutCents,
          estimatedWorkerMinutesAtQuote,
          clientPriceCents: snapshot.clientPriceCents,
          modeledReviewerMinutesAtQuote: COST_CATALOG.reviewerMinutesPerDelivery,
          modeledReworkReservePctBps: Math.round(COST_CATALOG.reworkReservePct * 10_000),
          modeledStripeFeePctBps: Math.round(COST_CATALOG.stripeFeePct * 10_000),
          modeledStripeFeeFixedCents: COST_CATALOG.stripeFeeFixedCents,
          modeledTargetMarginBps: Math.round(COST_CATALOG.targetGrossMargin * 10_000),
          calibrationLevelAtQuote: planVersion?.calibration ?? null,
          // Bounded at the ACCEPTANCE instant, excluding the task itself —
          // counting at backfill time leaked months of future completions
          // into a historical row that the immutability trigger then engraves.
          clientPriorCompletedTaskCount: await prisma.task.count({
            where: {
              clientId: task.clientId,
              id: { not: task.id },
              firstCompletedAt: { not: null, lt: snapshot.createdAt },
            },
          }),
          repeatWindowEndsAt: repeatWindowEndsAt(snapshot.createdAt),
          dataQualityFlags: flags,
        },
      });
      created++;
      await recomputeOperationalIntelligence(task.id, "backfill");
    } catch (error) {
      skipped.push(`${task.id}: ${String(error).slice(0, 120)}`);
    }
  }

  const withoutSnapshot = await prisma.task.count({ where: { acceptanceSnapshot: null } });
  console.log("── backfill report ──");
  console.log(`baselines created:      ${created}`);
  console.log(`of which incomplete:    ${incomplete} (missing quoted payout — null, not invented)`);
  console.log(`skipped with errors:    ${skipped.length}`);
  for (const s of skipped) console.log(`  · ${s}`);
  console.log(`tasks with no contract: ${withoutSnapshot} (no snapshot → no baseline, by design)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
