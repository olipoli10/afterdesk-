import "server-only";
import { prisma } from "@/lib/db";
import { insertLedgerEntry } from "@/lib/ledger";
import { cancelStripeAuthorization, captureStripePayment, refundStripePayment } from "@/lib/payments/stripe";

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

      if (intent.kind === "capture_client_payment") {
        // Enqueued only by admin-qc.ts approveDeliverable, so an
        // "authorized" payment should exist. If the hold expired first
        // (7-day card window; see reconcileStripePaymentIntentCanceled in
        // src/lib/payments/stripe.ts), this throws and the generic catch
        // below records why, without silently retrying forever.
        const authorized = await prisma.payment.findFirst({
          where: { taskId: intent.taskId, status: "authorized" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amountCents: true,
            currency: true,
            provider: true,
            providerRef: true,
            // Needed for the ledger entry below. The refund branch has always
            // selected these; the sale branch never did, so every captured
            // sale landed with isInternal defaulting to false and no category.
            task: {
              select: {
                isInternal: true,
                category: { select: { id: true, slug: true, name: true } },
              },
            },
          },
        });
        if (!authorized) throw new Error("No authorized client payment exists for this task.");
        if (authorized.provider !== "stripe" || !authorized.providerRef) {
          throw new Error("Non-Stripe payment cannot be auto-captured.");
        }
        await captureStripePayment({
          paymentIntentId: authorized.providerRef,
          idempotencyKey: intent.idempotencyKey,
        });
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: authorized.id },
            data: { status: "received", receivedAt: new Date() },
          });
          // Revenue is recognized here, at actual capture, not at checkout —
          // this is the whole point of the authorize/capture split.
          // isInternal and the category snapshot are passed for the same
          // reason the refund branch passes them: insertLedgerEntry defaults
          // isInternal to false and publiclyVisible to true, so an operator's
          // own practice transaction would otherwise clear BOTH gates of the
          // public ledger filter and inflate the public total — permanently,
          // since the table is append-only and only a correction entry can
          // offset it.
          await insertLedgerEntry(tx, {
            kind: "sale",
            amountCents: authorized.amountCents,
            currency: authorized.currency,
            sourceKind: "stripe_checkout",
            sourceId: authorized.providerRef!,
            taskId: intent.taskId,
            categoryId: authorized.task.category?.id,
            categorySlug: authorized.task.category?.slug,
            categoryName: authorized.task.category?.name,
            isInternal: authorized.task.isInternal,
          });
          await tx.moneyIntent.update({
            where: { id: intent.id },
            data: { status: "done", processedAt: new Date(), lastError: null },
          });
        });
        completed++;
        continue;
      }

      if (intent.kind === "cancel_authorization") {
        const authorized = await prisma.payment.findFirst({
          where: { taskId: intent.taskId, status: "authorized" },
          orderBy: { createdAt: "desc" },
          select: { id: true, provider: true, providerRef: true },
        });
        if (!authorized) {
          // Already resolved — most likely reconcileStripePaymentIntentCanceled
          // (src/lib/payments/stripe.ts) already saw the same cancellation via
          // webhook and updated the row first. Not an error.
          await prisma.moneyIntent.update({
            where: { id: intent.id },
            data: { status: "done", processedAt: new Date(), lastError: null },
          });
          completed++;
          continue;
        }
        if (authorized.provider !== "stripe" || !authorized.providerRef) {
          throw new Error("Non-Stripe payment cannot be auto-cancelled.");
        }
        await cancelStripeAuthorization({
          paymentIntentId: authorized.providerRef,
          idempotencyKey: intent.idempotencyKey,
        });
        await prisma.$transaction([
          prisma.payment.update({ where: { id: authorized.id }, data: { status: "cancelled" } }),
          prisma.moneyIntent.update({
            where: { id: intent.id },
            data: { status: "done", processedAt: new Date(), lastError: null },
          }),
        ]);
        completed++;
        continue;
      }

      // refund_client — the only remaining kind. Reverses money that was
      // actually captured (see capture_client_payment above); a payment
      // that's merely "authorized" has no captured funds to refund, which
      // is exactly why cancel_authorization exists as a separate kind.
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
