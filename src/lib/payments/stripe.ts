import "server-only";
import { after } from "next/server";
import Stripe from "stripe";
import { addHours } from "date-fns";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";
import { insertLedgerEntry } from "@/lib/ledger";
import { notifyEligiblePoolWorkers } from "@/server/pool-notifications";
import { hasExecutableContract, startWorkflow } from "@/server/workflow-runs";

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
    // Manual capture: payment_status stays "unpaid" even once the customer
    // has successfully authorized the card. session.status "complete" is
    // the correct "they finished checkout" signal here — see fulfillCheckout.
    if (session.status === "complete") {
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
              description: "AfterDesk task — fixed price approved before work starts",
            },
          },
        },
      ],
      metadata: { taskId: task.id, paymentId: payment.id, clientId },
      // Authorize the card, don't capture it: the client's money genuinely
      // stays on hold, not a real charge, until QC approves the delivery
      // and admin-qc.ts enqueues capture_client_payment. See fulfillCheckout
      // below for the matching webhook-side change.
      payment_intent_data: {
        capture_method: "manual",
        metadata: { taskId: task.id, paymentId: payment.id },
      },
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

/**
 * Idempotent fulfillment called by both the webhook and checkout recovery.
 *
 * With capture_method: manual, completing Checkout AUTHORIZES the card —
 * it does not charge it. session.payment_status stays "unpaid" the whole
 * time; session.status "complete" is what actually means "they finished
 * checkout, the card is good, the amount is on hold." The real charge (and
 * the ledger "sale" entry recognizing revenue) only happens later, when
 * QC approval enqueues a capture_client_payment money intent — see
 * src/server/actions/admin-qc.ts and src/server/money-intents.ts.
 */
export async function fulfillCheckout(session: Stripe.Checkout.Session): Promise<void> {
  if (session.status !== "complete") return;
  const taskId = session.metadata?.taskId || session.client_reference_id;
  const paymentId = session.metadata?.paymentId;
  if (!taskId || !paymentId) throw new Error("Stripe Checkout session is missing task metadata.");

  const amount = session.amount_total;
  const currency = session.currency?.toUpperCase();
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (amount == null || !currency || !paymentIntent) {
    throw new Error("Stripe Checkout session is missing authorized payment details.");
  }

  /**
   * Set inside the transaction, acted on after it commits. Starting a run
   * inside the payment transaction would hold it open across model calls; a
   * run started before the commit could also observe a payment that then
   * rolls back.
   */
  let startedWorkflowFor: string | null = null;

  await prisma.$transaction(async (tx) => {
    // Claim the pending payment row. A redelivered webhook becomes a no-op.
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, taskId: true, amountCents: true, currency: true, status: true },
    });
    if (!payment || payment.taskId !== taskId) throw new Error("Payment/task mismatch.");
    if (payment.amountCents !== amount || payment.currency !== currency) {
      throw new Error("Authorized amount does not match the approved quote.");
    }

    if (payment.status === "pending") {
      // No ledger entry here on purpose: no money has moved yet, only a
      // hold. The ledger "sale" entry is inserted by the
      // capture_client_payment money intent, at actual capture time.
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "authorized",
          providerRef: paymentIntent,
          checkoutSessionId: session.id,
        },
      });
    }

    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: { status: true, clientId: true, title: true, tier: true, isInternal: true },
    });
    /**
     * PHASE 1B — where a paid task goes next.
     *
     * With an executable accepted plan it enters `ai_processing` and the
     * machine block runs before anyone is asked to do anything. Without one it
     * goes straight to `open`, which is what every task did before Phase 1B
     * and what the majority still do.
     *
     * The pool notification only fires on the direct path: a task entering
     * ai_processing is NOT claimable yet, and telling workers about it would
     * page them for work they cannot take. It is sent at the end of the run
     * instead (src/server/workflow-runs.ts finishRun).
     */
    const automate = task ? await hasExecutableContract(tx, taskId) : false;
    const afterPayment = automate ? ("ai_processing" as const) : ("open" as const);

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
        to: afterPayment,
        action: "client_payment_received",
        data: { paymentDueAt: null },
        meta: { provider: "stripe", checkoutSessionId: session.id },
      });
      if (!automate) await notifyEligiblePoolWorkers(tx, taskId, task);
      startedWorkflowFor = automate ? taskId : null;
    } else if (task?.status === "awaiting_payment") {
      await transitionTask({
        tx,
        taskId,
        from: "awaiting_payment",
        to: afterPayment,
        action: "client_payment_received",
        data: { paymentDueAt: null },
        meta: { provider: "stripe", checkoutSessionId: session.id },
      });
      if (!automate) await notifyEligiblePoolWorkers(tx, taskId, task);
      startedWorkflowFor = automate ? taskId : null;
    } else if (task?.status === "cancelled") {
      // Only ever a hold at this point, never a real charge (see above) — so
      // there is nothing to refund, only an authorization to release.
      await tx.moneyIntent.upsert({
        where: { idempotencyKey: `late-payment-cancel:${payment.id}` },
        create: {
          taskId,
          kind: "cancel_authorization",
          amountCents: amount,
          currency,
          idempotencyKey: `late-payment-cancel:${payment.id}`,
        },
        update: {},
      });
      await tx.notification.create({
        data: {
          userId: task.clientId,
          type: "refund_queued",
          title: "Payment received after cancellation",
          body: "The payment arrived too late to open the task. The hold on your card will be released.",
          taskId,
        },
      });
    } else if (
      task?.status !== "open" &&
      task?.status !== "claimed" &&
      task?.status !== "ai_processing"
    ) {
      throw new TransitionError(`Paid task cannot be fulfilled from ${task?.status ?? "missing"}.`);
    }
  });

  /**
   * The fast path. The cron is the guarantee; this is what makes a task the
   * client just paid for start moving within seconds instead of within the
   * hour. It cannot throw into the webhook: startWorkflow swallows its own
   * failures and the run stays in the database for the next tick either way.
   */
  const runFor = startedWorkflowFor;
  if (runFor) {
    after(() => startWorkflow(runFor));
  }
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

/**
 * "New task in the pool" moved to src/server/pool-notifications.ts.
 *
 * It used to live here, private, called from the two payment paths that moved
 * a task to `open`. Phase 1B adds a third route to `open` (the end of an
 * automated run), and a task reaching the pool with nobody told is a task
 * nobody claims — so the helper is shared instead of copied.
 */

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

/**
 * Reconciles an authorization Stripe canceled on its own — almost always
 * the 7-day card-authorization window expiring before QC approval ever
 * triggered a capture (see the "explicitly out of scope" note on the plan:
 * this is treated as a rare edge case flagged for an operator, not
 * something auto-recovered). Our own cancel_authorization money intent
 * (task cancelled, dispute upheld pre-approval) also lands here, but that
 * path already updated the payment row itself before this event arrives,
 * so it is a no-op redelivery in that case.
 */
export async function reconcileStripePaymentIntentCanceled(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { provider_providerRef: { provider: "stripe", providerRef: paymentIntent.id } },
      select: { id: true, taskId: true, status: true },
    });
    if (!payment || payment.status !== "authorized") return;

    await tx.payment.update({ where: { id: payment.id }, data: { status: "cancelled" } });

    const task = await tx.task.findUnique({
      where: { id: payment.taskId },
      select: {
        status: true,
        clientId: true,
      },
    });
    const stillActive =
      task &&
      !["cancelled", "expired", "declined"].includes(task.status);
    if (stillActive) {
      // We didn't ask for this cancellation (see the doc comment above) —
      // the hold just expired out from under an in-flight task. Nothing
      // else in this codebase can silently re-request payment, so this has
      // to reach a human.
      await notifyAdmins(tx, {
        type: "authorization_expired",
        title: "A client's payment hold expired before approval",
        body: `Task ${payment.taskId} is still ${task!.status}, but the Stripe authorization on it (${paymentIntent.id}) expired unused. The client needs to be asked to pay again.`,
        taskId: payment.taskId,
      });
    }
  });
}

export function constructStripeEvent(payload: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new PaymentUnavailableError("STRIPE_WEBHOOK_SECRET is not configured.");
  return stripe().webhooks.constructEvent(payload, signature, secret);
}

/**
 * Turns a held authorization into a real charge. Called only from the
 * capture_client_payment money intent (src/server/money-intents.ts), which
 * is only ever enqueued at QC approval (src/server/actions/admin-qc.ts) —
 * so by the time this runs, the delivery has already cleared review.
 */
export async function captureStripePayment(input: {
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<{ id: string; amountReceived: number }> {
  const intent = await stripe().paymentIntents.capture(input.paymentIntentId, undefined, {
    idempotencyKey: input.idempotencyKey,
  });
  return { id: intent.id, amountReceived: intent.amount_received };
}

/**
 * Releases a held authorization that will never be captured: the task was
 * cancelled, or a dispute was upheld, before QC approval ever happened.
 * Distinct from refundStripePayment — no money has moved yet, so there is
 * nothing to refund, only a hold to release.
 */
export async function cancelStripeAuthorization(input: {
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<{ id: string }> {
  const intent = await stripe().paymentIntents.cancel(input.paymentIntentId, undefined, {
    idempotencyKey: input.idempotencyKey,
  });
  return { id: intent.id };
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
