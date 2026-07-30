import "server-only";
import Stripe from "stripe";
import { addHours } from "date-fns";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";
import { insertLedgerEntry } from "@/lib/ledger";

let client: Stripe | null = null;

export class PaymentUnavailableError extends Error {
  constructor(message = "Card payments are temporarily unavailable.") {
    super(message);
    this.name = "PaymentUnavailableError";
  }
}

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new PaymentUnavailableError();
  client ??= new Stripe(key, { maxNetworkRetries: 2 });
  return client;
}

function baseUrl(): string {
  const raw = process.env.APP_URL || process.env.BETTER_AUTH_URL;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new PaymentUnavailableError("APP_URL must be configured before card payments can start.");
    }
    return "http://localhost:3000";
  }
  return new URL(raw).origin;
}

/**
 * Creates or resumes the one hosted Checkout Session for an accepted quote.
 * No task is opened here: only the signed Stripe webhook may fulfill payment.
 */
export async function checkoutUrlForTask(taskId: string, clientId: string): Promise<string> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId, status: "awaiting_payment" },
    select: {
      id: true,
      title: true,
      currency: true,
      clientPriceCents: true,
      acceptedAt: true,
      paymentDueAt: true,
      client: { select: { email: true } },
      payments: {
        where: { provider: "stripe", status: "pending" },
        select: { id: true, checkoutSessionId: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!task || task.clientPriceCents == null || task.clientPriceCents <= 0) {
    throw new PaymentUnavailableError("This task is not awaiting payment.");
  }

  const stripeClient = stripe();
  const existing = task.payments[0];
  if (existing?.checkoutSessionId) {
    const session = await stripeClient.checkout.sessions.retrieve(existing.checkoutSessionId);
    if (session.status === "open" && session.url) return session.url;
    if (session.payment_status === "paid") {
      await fulfillCheckout(session);
      return `${baseUrl()}/client/tasks/${task.id}?payment=received`;
    }
  }

  const settings = await getSettings();
  const now = new Date();
  const due = task.paymentDueAt ?? addHours(now, settings.paymentWindowHours);
  const expiresAt = Math.floor(
    Math.min(
      now.getTime() + 24 * 60 * 60 * 1000,
      Math.max(due.getTime(), now.getTime() + 30 * 60 * 1000)
    ) / 1000
  );
  const payment =
    existing ??
    (await prisma.payment.create({
      data: {
        taskId: task.id,
        amountCents: task.clientPriceCents,
        currency: task.currency,
        method: "card",
        provider: "stripe",
        status: "pending",
      },
      select: { id: true },
    }));

  const session = await stripeClient.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: task.client.email,
      client_reference_id: task.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: task.currency.toLowerCase(),
            unit_amount: task.clientPriceCents,
            product_data: {
              name: task.title,
              description: "Second Shift task — fixed price approved before work starts",
            },
          },
        },
      ],
      metadata: { taskId: task.id, paymentId: payment.id, clientId },
      payment_intent_data: { metadata: { taskId: task.id, paymentId: payment.id } },
      success_url: `${baseUrl()}/client/tasks/${task.id}?payment=received`,
      cancel_url: `${baseUrl()}/client/tasks/${task.id}?payment=cancelled`,
      expires_at: expiresAt,
    },
    {
      // Stable across retries for one accepted quote. Stripe returns the same
      // Session if its response reached Stripe but not our database.
      idempotencyKey: `task-checkout:${task.id}:${task.acceptedAt?.getTime() ?? 0}`,
    }
  );

  if (!session.url) throw new PaymentUnavailableError("Stripe did not return a checkout URL.");
  await prisma.payment.update({
    where: { id: payment.id },
    data: { checkoutSessionId: session.id },
  });
  return session.url;
}

/** Idempotent fulfillment called by both the webhook and checkout recovery. */
export async function fulfillCheckout(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;
  const taskId = session.metadata?.taskId || session.client_reference_id;
  const paymentId = session.metadata?.paymentId;
  if (!taskId || !paymentId) throw new Error("Stripe Checkout session is missing task metadata.");

  const amount = session.amount_total;
  const currency = session.currency?.toUpperCase();
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (amount == null || !currency || !paymentIntent) {
    throw new Error("Stripe Checkout session is missing settled payment details.");
  }

  await prisma.$transaction(async (tx) => {
    // Claim the pending payment row. A redelivered webhook becomes a no-op.
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, taskId: true, amountCents: true, currency: true, status: true },
    });
    if (!payment || payment.taskId !== taskId) throw new Error("Payment/task mismatch.");
    if (payment.amountCents !== amount || payment.currency !== currency) {
      throw new Error("Paid amount does not match the approved quote.");
    }

    if (payment.status !== "received") {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "received",
          receivedAt: new Date(),
          providerRef: paymentIntent,
          checkoutSessionId: session.id,
        },
      });
      await insertLedgerEntry(tx, {
        kind: "sale",
        amountCents: amount,
        currency,
        sourceKind: "stripe_checkout",
        sourceId: session.id,
        taskId,
      });
    }

    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: { status: true, clientId: true },
    });
    if (task?.status === "expired") {
      await transitionTask({
        tx,
        taskId,
        from: "expired",
        to: "awaiting_payment",
        action: "late_client_payment_recovered",
        data: { expiredAt: null },
        meta: { provider: "stripe", checkoutSessionId: session.id },
      });
      await transitionTask({
        tx,
        taskId,
        from: "awaiting_payment",
        to: "open",
        action: "client_payment_received",
        data: { paymentDueAt: null },
        meta: { provider: "stripe", checkoutSessionId: session.id },
      });
    } else if (task?.status === "awaiting_payment") {
      await transitionTask({
        tx,
        taskId,
        from: "awaiting_payment",
        to: "open",
        action: "client_payment_received",
        data: { paymentDueAt: null },
        meta: { provider: "stripe", checkoutSessionId: session.id },
      });
    } else if (task?.status === "cancelled") {
      await tx.moneyIntent.upsert({
        where: { idempotencyKey: `late-payment-refund:${payment.id}` },
        create: {
          taskId,
          kind: "refund_client",
          amountCents: amount,
          currency,
          idempotencyKey: `late-payment-refund:${payment.id}`,
        },
        update: {},
      });
      await tx.notification.create({
        data: {
          userId: task.clientId,
          type: "refund_queued",
          title: "Payment received after cancellation",
          body: "The payment arrived too late to open the task. A full refund has been queued.",
          taskId,
        },
      });
    } else if (task?.status !== "open" && task?.status !== "claimed") {
      throw new TransitionError(`Paid task cannot be fulfilled from ${task?.status ?? "missing"}.`);
    }
  });
}

function stripePaymentIntentId(
  value: string | Stripe.PaymentIntent | null
): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

async function notifyAdmins(
  tx: Prisma.TransactionClient,
  input: { type: string; title: string; body: string; taskId: string }
) {
  const admins = await tx.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (admins.length === 0) return;
  await tx.notification.createMany({
    data: admins.map((admin) => ({ userId: admin.id, ...input })),
  });
}

/** Reconciles refunds created outside the app, including Stripe Dashboard actions. */
export async function reconcileStripeRefunds(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = stripePaymentIntentId(charge.payment_intent);
  if (!paymentIntentId || charge.amount_refunded <= 0) return;

  /**
   * `Charge.refunds` has NOT been included by default since Stripe API version
   * 2022-11-15, and a webhook payload cannot be expanded — so on a real
   * charge.refunded event this list is normally absent. Iterating it recorded
   * nothing while the status below still flipped to "refunded", which is worse
   * than no reconciliation: the money looks returned in our books with no
   * Refund row and no ledger entry behind it. Fetch the real list instead, and
   * do it OUTSIDE the transaction so a network call never holds it open.
   */
  let refunds: Stripe.Refund[] = [];
  let listFailed = false;
  try {
    // Always fetch rather than trusting the embedded list: when Stripe DOES
    // include it, it is capped at 10 and marked has_more, so a busy charge
    // would reconcile short while looking complete. autoPagingToArray also
    // covers the >100 case the first version silently truncated.
    refunds = await stripe()
      .refunds.list({ charge: charge.id, limit: 100 })
      .autoPagingToArray({ limit: 1000 });
  } catch {
    // Never let this throw out of the handler: the webhook route turns a throw
    // into a 400, Stripe retries a non-2xx for ~3 days and then drops the
    // event for good, and there is no webhook-event table to replay from. Fall
    // through with what the payload carried, record nothing we cannot prove,
    // and make sure the operator is told below.
    listFailed = true;
    refunds = charge.refunds?.data ?? [];
  }

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: {
        provider_providerRef: { provider: "stripe", providerRef: paymentIntentId },
      },
      select: {
        id: true,
        taskId: true,
        amountCents: true,
        status: true,
        task: {
          select: {
            clientId: true,
            isInternal: true,
            category: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    });
    if (!payment) return;

    let discovered = 0;
    for (const refund of refunds) {
      if (refund.status !== "succeeded") continue;
      const existing = await tx.refund.findUnique({
        where: {
          provider_providerRef: { provider: "stripe", providerRef: refund.id },
        },
        select: { id: true },
      });
      if (existing) continue;
      await tx.refund.create({
        data: {
          paymentId: payment.id,
          amountCents: refund.amount,
          provider: "stripe",
          providerRef: refund.id,
          reason: refund.reason ?? "Stripe refund",
        },
      });
      await insertLedgerEntry(tx, {
        kind: "refund",
        amountCents: refund.amount,
        currency: charge.currency.toUpperCase(),
        sourceKind: "stripe_refund",
        sourceId: refund.id,
        categoryId: payment.task.category?.id,
        categorySlug: payment.task.category?.slug,
        categoryName: payment.task.category?.name,
        isInternal: payment.task.isInternal,
      });
      discovered++;
    }

    /**
     * Derive the status from the Refund rows we actually hold, never from
     * charge.amount_refunded — that figure is frozen in the event payload, so
     * a redelivered or out-of-order charge.refunded would downgrade a fully
     * "refunded" payment back to "partially_refunded", and would clobber a
     * "chargeback" that landed in between. Same shape money-intents.ts uses.
     */
    const settled = await tx.refund.aggregate({
      where: { paymentId: payment.id },
      _sum: { amountCents: true },
    });
    const refundedCents = settled._sum.amountCents ?? 0;
    if (payment.status !== "chargeback" && refundedCents > 0) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: refundedCents >= payment.amountCents ? "refunded" : "partially_refunded",
        },
      });
    }

    /**
     * Stripe says money went back but our rows do not add up to it — the books
     * and the processor disagree. Never let that pass silently; the operator
     * has to reconcile it by hand, and the funding check in markPayoutPaid
     * keeps the worker payout blocked meanwhile.
     */
    if (listFailed || refundedCents < charge.amount_refunded) {
      await notifyAdmins(tx, {
        type: "refund_unreconciled",
        title: "Refund at Stripe does not match the ledger",
        body: `Charge ${charge.id} reports ${charge.amount_refunded} refunded; we hold ${refundedCents}${listFailed ? " (the refund list could not be read)" : ""}. Reconcile this payment by hand.`,
        taskId: payment.taskId,
      });
    }

    if (discovered > 0) {
      await tx.notification.create({
        data: {
          userId: payment.task.clientId,
          type: "refund_sent",
          title: "Refund processed",
          body: "Stripe has confirmed your refund.",
          taskId: payment.taskId,
        },
      });
    }
  });
}

/** Records Stripe chargebacks and reversals without confusing them with refunds. */
export async function reconcileStripeDispute(dispute: Stripe.Dispute): Promise<void> {
  const paymentIntentId = stripePaymentIntentId(dispute.payment_intent);
  if (!paymentIntentId) return;

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: {
        provider_providerRef: { provider: "stripe", providerRef: paymentIntentId },
      },
      select: {
        id: true,
        taskId: true,
        amountCents: true,
        status: true,
        refunds: { select: { amountCents: true } },
        task: {
          select: {
            isInternal: true,
            category: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    });
    if (!payment) return;

    if (dispute.status === "won") {
      if (payment.status !== "chargeback") return;
      const refunded = payment.refunds.reduce((sum, row) => sum + row.amountCents, 0);
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status:
            refunded >= payment.amountCents
              ? "refunded"
              : refunded > 0
                ? "partially_refunded"
                : "received",
        },
      });
      await insertLedgerEntry(tx, {
        kind: "chargeback_reversal",
        amountCents: dispute.amount,
        currency: dispute.currency.toUpperCase(),
        sourceKind: "stripe_dispute_won",
        sourceId: dispute.id,
        categoryId: payment.task.category?.id,
        categorySlug: payment.task.category?.slug,
        categoryName: payment.task.category?.name,
        isInternal: payment.task.isInternal,
      });
      await notifyAdmins(tx, {
        type: "chargeback_won",
        title: "Chargeback reversed",
        body: `Stripe dispute ${dispute.id} was won.`,
        taskId: payment.taskId,
      });
      return;
    }

    if (payment.status === "chargeback") return;
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "chargeback" },
    });
    await insertLedgerEntry(tx, {
      kind: "chargeback",
      amountCents: dispute.amount,
      currency: dispute.currency.toUpperCase(),
      sourceKind: "stripe_dispute",
      sourceId: dispute.id,
      categoryId: payment.task.category?.id,
      categorySlug: payment.task.category?.slug,
      categoryName: payment.task.category?.name,
      isInternal: payment.task.isInternal,
    });
    await notifyAdmins(tx, {
      type: "chargeback_opened",
      title: "Stripe chargeback opened",
      body: `${dispute.id} requires operator review in Stripe.`,
      taskId: payment.taskId,
    });
  });
}

export function constructStripeEvent(payload: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new PaymentUnavailableError("STRIPE_WEBHOOK_SECRET is not configured.");
  return stripe().webhooks.constructEvent(payload, signature, secret);
}

export async function refundStripePayment(input: {
  paymentIntentId: string;
  amountCents: number;
  taskId: string;
  idempotencyKey: string;
}): Promise<{ id: string }> {
  const refund = await stripe().refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountCents,
      metadata: { taskId: input.taskId, moneyIntentKey: input.idempotencyKey },
    },
    { idempotencyKey: input.idempotencyKey }
  );
  return { id: refund.id };
}
