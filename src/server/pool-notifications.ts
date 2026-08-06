import "server-only";
import type { Prisma, TaskTier } from "@prisma/client";
import { prisma } from "@/lib/db";
import { eligibleVaUserIds } from "@/lib/queries/va-profile";

/**
 * "A task just became claimable" — told to every worker the tier allows.
 *
 * This used to live privately inside src/lib/payments/stripe.ts, called from
 * the two places that moved a task to `open` on payment. Phase 1B adds a third
 * route to `open` (the end of an automated run) and a task reaching the pool
 * without anyone being told is a task nobody claims, so the helper is shared
 * rather than copied.
 *
 * Always called INSIDE the transaction that performs the transition: a
 * notification for a move that then rolls back is worse than none.
 */
export async function notifyEligiblePoolWorkers(
  tx: Prisma.TransactionClient,
  taskId: string,
  task: { title: string; tier: TaskTier; isInternal: boolean }
): Promise<void> {
  // Operator practice work never goes to the pool at large.
  if (task.isInternal) return;
  const workerIds = await eligibleVaUserIds(tx, task.tier);
  await writePoolNotifications(tx, taskId, task.title, workerIds);
}

/**
 * The read half, callable OUTSIDE a transaction.
 *
 * Resolving the audience means reading Settings and every approved worker's
 * profile, and doing that inside an interactive transaction pushed finishRun
 * past Prisma's 5-second limit on a local database — the whole handover then
 * rolled back and the task sat in ai_processing with its machine work already
 * done. A transaction should hold writes; this read belongs before it.
 */
export async function resolvePoolAudience(
  taskId: string,
  task: { tier: TaskTier; isInternal: boolean }
): Promise<string[]> {
  if (task.isInternal) return [];
  return eligibleVaUserIds(prisma, task.tier);
}

/** The write half. Runs inside the transaction that performs the transition. */
export async function writePoolNotifications(
  tx: Prisma.TransactionClient,
  taskId: string,
  title: string,
  workerIds: string[]
): Promise<void> {
  if (workerIds.length === 0) return;
  await tx.notification.createMany({
    data: workerIds.map((userId) => ({
      userId,
      type: "pool_task_available",
      title: "New task in the pool",
      body: title,
      taskId,
    })),
  });
}
