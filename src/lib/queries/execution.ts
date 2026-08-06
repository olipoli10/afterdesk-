import "server-only";
import { prisma } from "@/lib/db";
import { VA_FILE_ACCESS_STATUSES } from "@/lib/status";

/**
 * EXECUTION READS, role-shaped like every other query file here.
 *
 * The worker's view and the operator's view are two separate functions on
 * purpose. Widening one select to serve both is exactly how an internal cost
 * ends up on a worker's screen — see src/lib/queries/tasks.ts, whose header
 * states the same rule for prices, and test/price-wall.test.ts, which now pins
 * the execution tables out of every client and worker task select.
 */

/**
 * The residual brief, for the worker who claimed the task.
 *
 * Scoped by claimedById INSIDE the query: a worker cannot read another's
 * package by guessing a task id. Carries no cost, no budget, no client price,
 * no step internals and no run status — only what the work itself needs.
 */
export async function humanPackageForVa(taskId: string, vaId: string) {
  const pkg = await prisma.taskHumanWorkPackage.findFirst({
    where: {
      taskId,
      task: { claimedById: vaId, status: { in: VA_FILE_ACCESS_STATUSES } },
    },
    select: {
      objective: true,
      whatIsAlreadyDone: true,
      instructions: true,
      checklist: true,
      unitsRemaining: true,
      unitsTotal: true,
      // NOT selected, deliberately: computedPayoutCents and
      // reservedBudgetCents. The worker's payout is Task.vaPayoutCents, which
      // the existing vaTaskSelect already carries; reservedBudgetCents IS the
      // quoted payout and has no business on a worker payload at all.
    },
  });
  if (!pkg) return null;

  const artifacts = await prisma.file.findMany({
    where: {
      taskId,
      kind: "artifact",
      purgedAt: null,
      artifactVisibility: { in: ["worker_after_claim", "deliverable_candidate"] },
    },
    select: { id: true, fileName: true, sizeBytes: true, artifactVisibility: true },
    orderBy: { createdAt: "asc" },
  });

  return { ...pkg, artifacts };
}

/*
 * A `poolPackageSummary` used to sit here, intended to advertise the reduced
 * mandate on the PRE-CLAIM pool card. Nothing ever called it. An unwired role
 * boundary is the kind that gets connected months later by someone who does
 * not re-derive why its select was shaped that way, so it is deleted rather
 * than left dangling. The pool already states the residual honestly through
 * Task.vaPayoutCents and estimatedMinutes, both written at handover; 1B-beta
 * can add more deliberately if the card needs it.
 */

/** Everything an operator needs to read one run. Admin-only by construction. */
export async function executionForAdmin(taskId: string) {
  return prisma.taskWorkflowRun.findUnique({
    where: { taskId },
    select: {
      id: true,
      status: true,
      planVersionId: true,
      automatedStepCount: true,
      humanStepCount: true,
      unitsTotal: true,
      unitsResolvedAutomatically: true,
      actualAiCostMicros: true,
      actualToolCostMicros: true,
      pausedReason: true,
      compiledAt: true,
      startedAt: true,
      finishedAt: true,
      steps: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          primitiveId: true,
          primitiveVersion: true,
          executionMode: true,
          status: true,
          handoffReason: true,
          attempts: true,
          lastError: true,
          nextAttemptAt: true,
          outputSummary: true,
          actualCostMicros: true,
          startedAt: true,
          finishedAt: true,
          planStep: { select: { title: true } },
          invocations: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              operationKey: true,
              attempt: true,
              provider: true,
              model: true,
              searchCount: true,
              costMicros: true,
              durationMs: true,
              ok: true,
              error: true,
            },
          },
        },
      },
      humanPackage: {
        select: {
          unitsRemaining: true,
          unitsTotal: true,
          estimatedMinutes: true,
          computedPayoutCents: true,
          reservedBudgetCents: true,
        },
      },
      artifacts: {
        where: { purgedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          fileName: true,
          sizeBytes: true,
          artifactVisibility: true,
          workflowStepRun: { select: { order: true } },
        },
      },
    },
  });
}

export type ExecutionForAdmin = NonNullable<Awaited<ReturnType<typeof executionForAdmin>>>;
export type HumanPackageForVa = NonNullable<Awaited<ReturnType<typeof humanPackageForVa>>>;
