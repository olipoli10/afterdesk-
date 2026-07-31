"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { insertLedgerEntry } from "@/lib/ledger";
import { transitionTask, TransitionError } from "@/lib/state";
import { logAdminEvent } from "@/lib/audit";

export type MoneyActionResult = { ok: true } | { ok: false; error: string };

const manualPaymentSchema = z.object({
  taskId: z.string().min(1).max(100),
  reference: z.string().trim().min(3).max(200),
});

export async function recordManualPayment(input: unknown): Promise<MoneyActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = manualPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the bank or invoice reference." };

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: parsed.data.taskId },
        select: {
          id: true,
          status: true,
          clientId: true,
          clientPriceCents: true,
          currency: true,
          isInternal: true,
          category: { select: { id: true, slug: true, name: true } },
        },
      });
      if (!task || task.status !== "awaiting_payment" || task.clientPriceCents == null) {
        throw new TransitionError("not-awaiting-payment");
      }

      const payment = await tx.payment.create({
        data: {
          taskId: task.id,
          amountCents: task.clientPriceCents,
          currency: task.currency,
          method: "wire",
          provider: "manual",
          providerRef: parsed.data.reference,
          status: "received",
          receivedAt: new Date(),
          note: `Recorded by ${admin.id}`,
        },
      });
      await insertLedgerEntry(tx, {
        kind: "sale",
        amountCents: task.clientPriceCents,
        currency: task.currency,
        sourceKind: "manual_payment",
        sourceId: payment.id,
        categoryId: task.category?.id,
        categorySlug: task.category?.slug,
        categoryName: task.category?.name,
        isInternal: task.isInternal,
      });
      await transitionTask({
        tx,
        taskId: task.id,
        from: "awaiting_payment",
        to: "open",
        action: "admin_recorded_payment",
        actorId: admin.id,
        data: { paymentDueAt: null },
        meta: { method: "wire", paymentId: payment.id },
      });
      await tx.notification.create({
        data: {
          userId: task.clientId,
          type: "payment_received",
          title: "Payment received",
          body: "Your task is now available to the worker pool.",
          taskId: task.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof TransitionError) {
      return { ok: false, error: "This task is no longer awaiting payment." };
    }
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("unique constraint")
    ) {
      return { ok: false, error: "That payment reference has already been used." };
    }
    throw error;
  }

  revalidatePath(`/admin/tasks/${parsed.data.taskId}`);
  revalidatePath("/admin/tasks");
  revalidatePath("/client");
  return { ok: true };
}

const manualRefundSchema = z.object({
  intentId: z.string().min(1).max(100),
  reference: z.string().trim().min(3).max(200),
});

export async function recordManualRefund(input: unknown): Promise<MoneyActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = manualRefundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the refund reference." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const intent = await tx.moneyIntent.findUnique({
        where: { id: parsed.data.intentId },
        select: {
          id: true,
          taskId: true,
          kind: true,
          amountCents: true,
          currency: true,
          status: true,
          task: {
            select: {
              clientId: true,
              isInternal: true,
              category: { select: { id: true, slug: true, name: true } },
              payments: {
                where: {
                  provider: "manual",
                  status: { in: ["received", "partially_refunded"] },
                },
                orderBy: { receivedAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  amountCents: true,
                  refunds: { select: { amountCents: true } },
                },
              },
            },
          },
        },
      });
      const payment = intent?.task.payments[0];
      if (
        !intent ||
        intent.kind !== "refund_client" ||
        !["queued", "failed"].includes(intent.status) ||
        !payment
      ) {
        return null;
      }
      const alreadyRefunded = payment.refunds.reduce(
        (sum, refund) => sum + refund.amountCents,
        0
      );
      if (alreadyRefunded + intent.amountCents > payment.amountCents) {
        throw new Error("Refund exceeds the remaining received payment.");
      }

      const claimed = await tx.moneyIntent.updateMany({
        where: { id: intent.id, status: { in: ["queued", "failed"] } },
        data: {
          status: "done",
          attempts: { increment: 1 },
          processedAt: new Date(),
          lastError: null,
        },
      });
      if (claimed.count === 0) return null;

      const refund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          amountCents: intent.amountCents,
          provider: "manual",
          providerRef: parsed.data.reference,
          reason: `Recorded by ${admin.id}`,
        },
      });
      const refundedTotal = alreadyRefunded + intent.amountCents;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: refundedTotal >= payment.amountCents ? "refunded" : "partially_refunded",
        },
      });
      await insertLedgerEntry(tx, {
        kind: "refund",
        amountCents: intent.amountCents,
        currency: intent.currency,
        sourceKind: "manual_refund",
        sourceId: refund.id,
        categoryId: intent.task.category?.id,
        categorySlug: intent.task.category?.slug,
        categoryName: intent.task.category?.name,
        isInternal: intent.task.isInternal,
      });
      await tx.notification.create({
        data: {
          userId: intent.task.clientId,
          type: "refund_sent",
          title: "Refund sent",
          body: `Reference: ${parsed.data.reference}`,
          taskId: intent.taskId,
        },
      });
      await logAdminEvent({
        tx,
        actorId: admin.id,
        entity: "Refund",
        entityId: refund.id,
        action: "manual_refund_recorded",
        after: {
          moneyIntentId: intent.id,
          amountCents: intent.amountCents,
          reference: parsed.data.reference,
        },
      });
      return { taskId: intent.taskId };
    });

    if (!result) return { ok: false, error: "This refund is no longer awaiting action." };
    revalidatePath(`/admin/tasks/${result.taskId}`);
    revalidatePath("/client");
    return { ok: true };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("unique constraint")
    ) {
      return { ok: false, error: "That refund reference has already been used." };
    }
    throw error;
  }
}

const payoutSchema = z.object({
  payoutId: z.string().min(1).max(100),
  method: z.string().trim().min(2).max(100),
  reference: z.string().trim().min(3).max(200),
});

export async function markPayoutPaid(input: unknown): Promise<MoneyActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = payoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the payout method and reference." };

  const result = await prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({
      where: { id: parsed.data.payoutId },
      select: {
        id: true,
        taskId: true,
        vaId: true,
        amountCents: true,
        currency: true,
        status: true,
        task: {
          select: {
            isInternal: true,
            category: { select: { id: true, slug: true, name: true } },
            // The funding behind this payout. A chargeback or refund means the
            // client's money is gone; paying the worker out of it anyway is a
            // straight loss, and nothing else in the flow stops it.
            payments: {
              select: {
                status: true,
                amountCents: true,
                refunds: { select: { amountCents: true } },
              },
            },
            payouts: { select: { id: true, status: true, amountCents: true } },
          },
        },
      },
    });
    if (!payout || !["owed", "released"].includes(payout.status)) return null;

    /**
     * FUNDING CHECK. Internal practice work is ours to fund, so it is exempt;
     * every other payout must be backed by money we still hold.
     *
     * Judge the MONEY, not the statuses. An earlier version refused whenever
     * any payment on the task had ever been refunded — which permanently
     * locked out a worker on a task that was re-quoted after a duplicate
     * charge was returned, with nothing left to "resolve in Stripe". And it
     * accepted any `received` row regardless of value, so a payment refunded
     * down to a dollar still authorised the whole payout.
     *
     * A chargeback is different in kind: the money is contested, not merely
     * partly returned, so it blocks outright until Stripe settles it.
     */
    if (!payout.task.isInternal) {
      if (payout.task.payments.some((p) => p.status === "chargeback")) {
        return { blocked: "chargeback" };
      }
      const held = payout.task.payments
        .filter((p) => p.status === "received" || p.status === "partially_refunded")
        .reduce(
          (sum, p) => sum + p.amountCents - p.refunds.reduce((r, x) => r + x.amountCents, 0),
          0
        );
      // Everything already paid out on this task, plus what is being paid now.
      const committed = payout.task.payouts
        .filter((p) => p.status === "paid" || p.id === payout.id)
        .reduce((sum, p) => sum + p.amountCents, 0);
      if (held <= 0) return { blocked: "unfunded" };
      if (committed > held) return { blocked: "short" };
    }

    const claimed = await tx.payout.updateMany({
      where: { id: payout.id, status: { in: ["owed", "released"] } },
      data: {
        status: "paid",
        paidAt: new Date(),
        method: parsed.data.method,
        reference: parsed.data.reference,
      },
    });
    if (claimed.count === 0) return null;

    await tx.moneyIntent.updateMany({
      where: {
        taskId: payout.taskId,
        kind: "release_payout",
        status: { in: ["queued", "processing", "failed"] },
      },
      data: { status: "done", processedAt: new Date(), lastError: null },
    });
    await insertLedgerEntry(tx, {
      kind: "payout",
      amountCents: payout.amountCents,
      currency: payout.currency,
      sourceKind: "manual_payout",
      sourceId: payout.id,
      categoryId: payout.task.category?.id,
      categorySlug: payout.task.category?.slug,
      categoryName: payout.task.category?.name,
      isInternal: payout.task.isInternal,
    });
    await tx.notification.create({
      data: {
        userId: payout.vaId,
        type: "payout_paid",
        title: "Payout sent",
        body: `Reference: ${parsed.data.reference}`,
        taskId: payout.taskId,
      },
    });
    await tx.adminEvent.create({
      data: {
        actorId: admin.id,
        entity: "Payout",
        entityId: payout.id,
        action: "payout_marked_paid",
        after: { method: parsed.data.method, reference: parsed.data.reference },
      },
    });
    return { taskId: payout.taskId };
  });

  if (result && "blocked" in result) {
    return {
      ok: false,
      error:
        result.blocked === "unfunded"
          ? "No settled client payment backs this payout yet."
          : result.blocked === "short"
            ? "The client money still held on this task does not cover this payout. Check the refunds before releasing it."
            : "This task's client payment is in chargeback. Resolve the dispute in Stripe before releasing the payout.",
    };
  }
  if (!result) return { ok: false, error: "This payout was already settled or voided." };
  revalidatePath(`/admin/tasks/${result.taskId}`);
  revalidatePath("/admin/workers");
  revalidatePath("/va");
  return { ok: true };
}
