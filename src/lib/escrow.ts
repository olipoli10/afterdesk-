import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Releases a one-off task's held money: the worker's payout moves from
 * "owed" to "released" (queued for the operator's manual payout action —
 * see MAX_ATTEMPTS/"release_payout is completed by the operator" in
 * money-intents.ts), and the client's authorized-but-not-yet-captured
 * payment gets a capture_client_payment intent enqueued.
 *
 * Two call sites, same invariant both times ("this delivery is now final,
 * pay for it"): the dispute-window sweep (releaseDisputeWindowFunds in
 * sweeps.ts) when nothing was disputed, and decideDispute's "rejected"
 * outcome (admin-resolutions.ts) when a dispute was opened but the client's
 * complaint didn't hold up. Never called for a Standing Capacity task — that
 * flow pays per period, not per task (see standing-capacity.ts).
 *
 * Idempotent by construction: both the Payout update and the MoneyIntent
 * upserts key off the task, so calling this twice for the same task is a
 * no-op the second time.
 */
export async function releaseHeldFunds(tx: Prisma.TransactionClient, taskId: string): Promise<void> {
  const task = await tx.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      claimedById: true,
      vaPayoutCents: true,
      currency: true,
      payments: {
        where: { status: "authorized" },
        select: { id: true, amountCents: true, currency: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (task.claimedById && task.vaPayoutCents) {
    await tx.payout.updateMany({
      where: { taskId, vaId: task.claimedById, status: { not: "paid" } },
      data: { status: "released", releasedAt: new Date(), note: null },
    });
    await tx.moneyIntent.upsert({
      where: { idempotencyKey: `release-payout:${taskId}:${task.claimedById}` },
      create: {
        taskId,
        kind: "release_payout",
        amountCents: task.vaPayoutCents,
        currency: task.currency,
        idempotencyKey: `release-payout:${taskId}:${task.claimedById}`,
      },
      update: { status: "queued", lastError: null, processedAt: null },
    });
  }

  const authorizedPayment = task.payments[0];
  if (authorizedPayment) {
    await tx.moneyIntent.upsert({
      where: { idempotencyKey: `capture-payment:${taskId}:${authorizedPayment.id}` },
      create: {
        taskId,
        kind: "capture_client_payment",
        amountCents: authorizedPayment.amountCents,
        currency: authorizedPayment.currency,
        idempotencyKey: `capture-payment:${taskId}:${authorizedPayment.id}`,
      },
      update: {},
    });
  }
}
