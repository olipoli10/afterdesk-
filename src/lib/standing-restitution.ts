import "server-only";
import type { Prisma } from "@prisma/client";
import { lockStandingAccount } from "@/lib/standing-period";

/**
 * What happened to a cancelled standing task's minutes. Callers use this to
 * tell the client the truth instead of a generic refund line — a standing
 * client has no Payment row of their own (the block is paid through
 * StandingCapacityPayment, recorded by an operator), so the one-off refund
 * wording promises money that will never move.
 */
export type StandingRestitution =
  /** Not a standing task — the caller's existing payment/refund logic applies. */
  | { kind: "not_standing" }
  /** Minutes were credited back to the block the client is currently in. */
  | { kind: "returned"; minutes: number }
  /**
   * The task was submitted in a period that has since ended. Weekly capacity
   * does not roll over, so there is no week left to credit — returning the
   * minutes to the current period would hand the client capacity in a week
   * they never spent it in. An operator settles this at the block level.
   */
  | { kind: "period_closed"; minutes: number };

/**
 * Gives a cancelled standing task's minutes back to its block.
 *
 * The minutes are deducted at submission (submitStandingTask increments
 * minutesUsedThisPeriod before any work exists) and nothing ever gave them
 * back. A client whose dispute Endvera upheld — meaning the delivery failed
 * against the written standard — lost the work AND the capacity, which leaves
 * them strictly worse off than a one-off client, who gets refunded for the
 * same failure. This is the standing equivalent of that refund.
 *
 * Takes the same account lock as submitStandingTask and the rollover sweep, so
 * a credit cannot interleave with a submission reading the counter or with a
 * period rolling underneath it. Idempotent on its own TaskEvent, so a second
 * caller — or a retried transaction — credits nothing twice.
 */
export async function returnStandingMinutes(
  tx: Prisma.TransactionClient,
  taskId: string
): Promise<StandingRestitution> {
  const task = await tx.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { standingCapacityAccountId: true, estimatedMinutes: true, createdAt: true },
  });
  if (!task.standingCapacityAccountId) return { kind: "not_standing" };

  const minutes = task.estimatedMinutes ?? 0;
  await lockStandingAccount(tx, task.standingCapacityAccountId);

  const already = await tx.taskEvent.findFirst({
    where: { taskId, action: "standing_minutes_returned" },
    select: { id: true },
  });
  if (already) return { kind: "returned", minutes };

  const account = await tx.standingCapacityAccount.findUniqueOrThrow({
    where: { id: task.standingCapacityAccountId },
    select: { currentPeriodStart: true, minutesUsedThisPeriod: true },
  });

  if (task.createdAt < account.currentPeriodStart) {
    return { kind: "period_closed", minutes };
  }

  // Clamped rather than a bare decrement: a rollover resets the counter to 0,
  // and this must never drive it negative and hand the client more capacity
  // than their tier.
  const credited = Math.min(minutes, account.minutesUsedThisPeriod);
  if (credited > 0) {
    await tx.standingCapacityAccount.update({
      where: { id: task.standingCapacityAccountId },
      data: { minutesUsedThisPeriod: { decrement: credited } },
    });
  }
  await tx.taskEvent.create({
    data: {
      taskId,
      action: "standing_minutes_returned",
      meta: { minutes: credited, requested: minutes },
    },
  });
  return { kind: "returned", minutes: credited };
}

/** The client-facing line for each outcome. Kept next to the logic so the
 *  wording cannot drift away from what actually happened to the money. */
export function restitutionMessage(result: StandingRestitution): string | null {
  switch (result.kind) {
    case "not_standing":
      return null;
    case "returned":
      return result.minutes > 0
        ? `The ${result.minutes} minutes this task reserved have been credited back to your block for this week.`
        : "Your block's capacity for this week is unaffected.";
    case "period_closed":
      return "This task was submitted in a week that has already closed, so its minutes cannot be credited to your current block. Your operator will settle it directly.";
  }
}
