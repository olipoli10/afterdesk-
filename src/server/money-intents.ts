import "server-only";
import { prisma } from "@/lib/db";
import { insertLedgerEntry } from "@/lib/ledger";
import { refundStripePayment } from "@/lib/payments/stripe";

const MAX_ATTEMPTS = 5;

export async function processMoneyIntents(): Promise<{
  completed: number;
  failed: number;
  manual: number;
}> {
  const intents = await prisma.moneyIntent.findMany({
    where: {
      status: { in: ["queued", "failed"] },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  let completed = 0;
  let failed = 0;
  let manual = 0;

  for (const intent of intents) {
    // Release intents are completed by the operator's payout action because
    // each worker's external payout account is intentionally outside V1.
    if (intent.kind === "release_payout") {
      manual++;
      continue;
    }

    const claimed = await prisma.moneyIntent.updateMany({
      where: {
        id: intent.id,
        status: { in: ["queued", "failed"] },
        attempts: { lt: MAX_ATTEMPTS },
      },
      data: { status: "processing", attempts: { increment: 1 }, lastError: null },
    });
    if (claimed.count === 0) continue;

    try {
      if (intent.kind === "void_payout") {
        await prisma.$transaction([
          prisma.payout.updateMany({
            where: { taskId: intent.taskId, status: { not: "paid" } },
            data: { status: "void", note: "Voided by money intent." },
          }),
          prisma.moneyIntent.update({
            where: { id: intent.id },
            data: { status: "done", processedAt: new Date() },
          }),
        ]);
        completed++;
        continue;
      }

      const payment = await prisma.payment.findFirst({
        where: {
          taskId: intent.taskId,
          status: { in: ["received", "partially_refunded"] },
        },
        orderBy: { receivedAt: "desc" },
        select: {
          id: true,
          amountCents: true,
          currency: true,
          provider: true,
          providerRef: true,
          task: {
            select: {
              isInternal: true,
              category: { select: { id: true, slug: true, name: true } },
            },
          },
        },
      });
      if (!payment) throw new Error("No received client payment exists for this refund.");
      if (payment.provider !== "stripe" || !payment.providerRef) {
        await prisma.moneyIntent.update({
          where: { id: intent.id },
          data: {
            status: "failed",
            lastError: "Manual payment: operator must record the refund.",
          },
        });
        manual++;
        continue;
      }
      const refund = await refundStripePayment({
        paymentIntentId: payment.providerRef,
        amountCents: intent.amountCents,
        taskId: intent.taskId,
        idempotencyKey: intent.idempotencyKey,
      });
      await prisma.$transaction(async (tx) => {
        await tx.refund.upsert({
          where: { provider_providerRef: { provider: "stripe", providerRef: refund.id } },
          create: {
            paymentId: payment.id,
            amountCents: intent.amountCents,
            provider: "stripe",
            providerRef: refund.id,
            reason: "Approved marketplace refund",
          },
          update: {},
        });
        const refunded = await tx.refund.aggregate({
          where: { paymentId: payment.id },
          _sum: { amountCents: true },
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status:
              (refunded._sum.amountCents ?? 0) >= payment.amountCents
                ? "refunded"
                : "partially_refunded",
          },
        });
        await insertLedgerEntry(tx, {
          kind: "refund",
          amountCents: intent.amountCents,
          currency: payment.currency,
          sourceKind: "stripe_refund",
          sourceId: refund.id,
          categoryId: payment.task.category?.id,
          categorySlug: payment.task.category?.slug,
          categoryName: payment.task.category?.name,
          isInternal: payment.task.isInternal,
        });
        await tx.moneyIntent.update({
          where: { id: intent.id },
          data: { status: "done", processedAt: new Date(), lastError: null },
        });
      });
      completed++;
    } catch (error) {
      failed++;
      await prisma.moneyIntent.update({
        where: { id: intent.id },
        data: {
          status: "failed",
          lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
        },
      });
    }
  }

  return { completed, failed, manual };
}
