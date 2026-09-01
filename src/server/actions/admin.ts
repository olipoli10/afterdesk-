"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { recomputeOperationalIntelligence } from "@/server/operational-actuals";
import { z } from "zod";
import { addHours } from "date-fns";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { parseMoneyToCents } from "@/lib/money";
import { computeVaDeadline } from "@/lib/schedule";
import { NON_TERMINAL_STATUSES } from "@/lib/status";
import {
  transitionTask,
  isAllowedTransition,
  TransitionError,
  IllegalTransitionError,
} from "@/lib/state";
import { nextInPricingQueue } from "@/lib/queries/tasks";
import { upsertClosedJobLog } from "@/lib/closed-job-log";
import { releaseToPoolWithoutAutomation } from "@/server/workflow-runs";
import { returnStandingMinutes, restitutionMessage } from "@/lib/standing-restitution";
import { withdrawHumanUnit } from "@/server/human-unit";

const approveSchema = z.object({
  taskId: z.string(),
  clientPrice: z.string().trim().min(1),
  vaPayout: z.string().trim().min(1),
  tier: z.enum(["standard", "high_value"]),
  filesVerified: z.boolean(),
  // Required before a quote goes out: the category drives the dispute criteria
  // the worker is judged against and the per-category medians; the estimate
  // is what makes "is this payout fair" answerable.
  categoryId: z.string().min(1),
  estimatedMinutes: z.coerce.number().int().min(1).max(100000),
  /**
   * The execution-plan version the admin was viewing when they approved —
   * becomes Task.quotedPlanVersionId, the basis the quote's scope block and
   * the acceptance snapshot record. Optional: a task priced without the
   * work engine (pipeline failure, pre-engine task) quotes plan-less,
   * exactly as before Phase 1A.
   */
  planVersionId: z.string().optional(),
});

export type ApproveResult =
  | { ok: true; nextId: string | null }
  | { ok: false; error: string };

/**
 * Admin sets the two independent numbers (RULE 2) and releases the quote
 * (RULE 3 — nothing reaches the client before this).
 */
export async function approvePricing(input: unknown): Promise<ApproveResult> {
  const admin = await requireRole("ADMIN");
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    const missingCategory = parsed.error.issues.some((i) => i.path[0] === "categoryId");
    return {
      ok: false,
      error: missingCategory
        ? "Pick a category and an estimate — both are needed before a quote goes out."
        : "Invalid form data.",
    };
  }
  const { taskId, tier, filesVerified, categoryId, estimatedMinutes, planVersionId } = parsed.data;

  let clientPriceCents: number;
  let vaPayoutCents: number;
  try {
    clientPriceCents = parseMoneyToCents(parsed.data.clientPrice);
    vaPayoutCents = parseMoneyToCents(parsed.data.vaPayout);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount." };
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    // clientId is here for the "your price is ready" notification below, which
    // is the only moment the client is told a quote exists.
    select: { clientDeadlineUtc: true, standingCapacityAccountId: true, clientId: true },
  });
  if (!task) return { ok: false, error: "Task not found." };

  // The queue no longer lists standing tasks, but this action is reachable by
  // task id alone. Pricing one would bill a second time for work the client's
  // block already covers, and whose minutes were already deducted at
  // submission. A trigger refuses the transition as well; this exists so the
  // operator reads a sentence telling them what to do instead of hitting it.
  if (task.standingCapacityAccountId) {
    return {
      ok: false,
      error:
        "This is a standing capacity task — its price is set by the client's weekly block, so it is never quoted. It is sitting in submitted because the account has no assigned specialist; assign one on the standing capacity page and it routes automatically.",
    };
  }

  // The admin pricing step is the content gate on everything the client wrote
  // (description and quantity are VA-visible verbatim) and everything they
  // uploaded. The attestation is unconditional — a task with no files still
  // carries a free-text description that can name the client.
  if (!filesVerified) {
    return {
      ok: false,
      error:
        "Confirm you reviewed the description, quantity and any files for contact info or identifying details before quoting.",
    };
  }

  const settings = await getSettings();
  // Integer-cents comparison: the float division form rejected its own exact
  // boundary (payout $147.00 at $15.75/h over 560 min divides to
  // 15.749999999999998). payout/h >= floor  <=>  payoutCents·60 >= minCents·minutes.
  const minHourlyCents = Math.round(settings.minWorkerHourlyUsd * 100);
  if (vaPayoutCents * 60 < minHourlyCents * estimatedMinutes) {
    const effectiveHourlyUsd = (vaPayoutCents / 100) / (estimatedMinutes / 60);
    return {
      ok: false,
      error: `That payout is about $${effectiveHourlyUsd.toFixed(2)}/hour. Raise it to at least $${settings.minWorkerHourlyUsd.toFixed(2)}/hour for the estimate.`,
    };
  }

  // The quoted plan version must actually belong to this task — a forged or
  // stale id must fail loudly here, not become a quote whose scope block
  // renders another task's plan.
  if (planVersionId) {
    const version = await prisma.taskExecutionPlanVersion.findUnique({
      where: { id: planVersionId },
      select: { taskId: true },
    });
    if (!version || version.taskId !== taskId) {
      return { ok: false, error: "That plan version does not belong to this task. Reload and re-approve." };
    }
  }
  const now = new Date();
  const quoteExpiresAt = addHours(now, settings.quoteValidityHours);
  const vaDeadlineUtc = task.clientDeadlineUtc
    ? computeVaDeadline(task.clientDeadlineUtc, settings)
    : null;

  try {
    await prisma.$transaction(async (tx) => {
    await transitionTask({
      tx,
      taskId,
      from: ["submitted", "pricing_review"],
      to: "quoted",
      action: "admin_quoted",
      actorId: admin.id,
      data: {
        clientPriceCents,
        vaPayoutCents,
        tier,
        categoryId,
        estimatedMinutes,
        filesVerified: true,
        quotedAt: now,
        quoteExpiresAt,
        vaDeadlineUtc,
        // The plan version this quote is built on — the same unchecked-FK
        // mechanism as claimedById in claimTask. Null clears any stale link
        // when a task is approved plan-less.
        quotedPlanVersionId: planVersionId ?? null,
      },
      // RULE 2: never persist raw prices in TaskEvent.meta — the authoritative
      // values live on the Task row behind the role-shaped selects, and meta
      // has no role-shaping of its own.
      meta: { tier, priced: true },
    });

    /**
     * THE CLIENT IS TOLD THEIR PRICE IS READY.
     *
     * This is the one step of the service the client has to act on, and until
     * now nothing announced it: the quote appeared on the dashboard and the
     * client learned about it only by going to look. Every other state change
     * they care about (payment received, delivery approved, cancellation)
     * already notifies; the one that asks them to decide did not.
     *
     * RULE 2 holds: the amount is NOT in the body. Notifications are relayed
     * verbatim by email, and a price in an email subject line is a price
     * sitting in an inbox forever, outside the role-shaped reads that are
     * supposed to be the only place it is rendered. The client signs in to see
     * the number, which is also where the scope and the accept/decline
     * controls live.
     *
     * Inside the transaction on purpose: a quote nobody was told about is the
     * defect being fixed, so the two facts commit together or not at all.
     */
    await tx.notification.create({
      data: {
        userId: task.clientId,
        type: "quote_ready",
        title: "Your fixed price is ready",
        body: "Sign in to review the scope and approve or decline it. Nothing starts until you approve.",
        taskId,
      },
    });
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task already left the pricing queue." };
    }
    throw e;
  }

  revalidatePath("/admin/pricing");
  revalidatePath("/admin");
  const nextId = await nextInPricingQueue(taskId);
  return { ok: true, nextId };
}

const reassignSchema = z.object({
  taskId: z.string(),
  reason: z.string().trim().min(3).max(2000),
});

/**
 * Pulls a task out of a worker's hands and back into the pool. Without this,
 * a suspended or unresponsive worker's in-flight tasks are frozen: they cannot
 * deliver (the pool gate blocks them) and nobody else can pick it up.
 *
 * QC rounds reset, because the next worker starts fresh.
 */
export async function reassignTask(input: unknown): Promise<CancelResult> {
  const admin = await requireRole("ADMIN");
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A reason is required to reassign." };

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: parsed.data.taskId },
        select: { standingCapacityAccountId: true },
      });
      if (!task) throw new TransitionError("not-found");

      // A standing task must never land in the public pool. It belongs to one
      // client's private block, and any approved worker could have claimed it
      // there — with none of the account context, and no way to be paid for it,
      // since standing work is paid per period to the account's assignee. It
      // goes back to `submitted` instead, where it waits for routing exactly
      // like a task submitted with nobody assigned, and shows up in the
      // standing capacity page's waiting-to-be-routed count.
      await transitionTask({
        tx,
        taskId: parsed.data.taskId,
        from: ["claimed", "qc_rejected", "submitted_for_qc", "revision_requested"],
        to: task.standingCapacityAccountId ? "submitted" : "open",
        action: "admin_reassigned",
        actorId: admin.id,
        reason: parsed.data.reason,
        data: { claimedById: null, claimedAt: null, qcRounds: 0 },
      });
      // A pending delivery must not dangle forever once the task leaves the
      // worker's hands — resolve it with a worker-visible note so their
      // history shows an honest record instead of a silent disappearance.
      await tx.submission.updateMany({
        where: { taskId: parsed.data.taskId, qcStatus: "pending" },
        data: {
          qcStatus: "rejected",
          reviewedAt: new Date(),
          qcComment:
            "The operator returned this task to the pool before review — a reassignment, not a quality strike.",
        },
      });
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task is not currently assigned to anyone." };
    }
    throw e;
  }

  revalidatePath("/admin/tasks");
  revalidatePath("/admin/workers");
  revalidatePath("/admin/standing-capacity");
  return { ok: true };
}

const cancelSchema = z.object({
  taskId: z.string(),
  /**
   * INTERNAL. Goes to the audit log, the closed-job log, the void note on the
   * payouts and the cancelReason column. It is NEVER sent to the client.
   *
   * It used to be. When a cancellation carried neither a refund nor a card
   * hold — the ordinary case at the pricing stage, where nothing has been paid
   * yet — this string WAS the body of the client's notification, and
   * notifications are relayed verbatim by email. Both forms that collect it
   * promise the opposite in their own labels ("logged", "written to the audit
   * log"), so an operator typing "margin too thin" or "no worker for this"
   * mailed it to the client believing it stayed inside.
   */
  reason: z.string().trim().min(3).max(2000),
  /**
   * OPTIONAL, AND THE ONLY THING THE CLIENT READS.
   *
   * Written deliberately for them, in a field labelled as such. Absent, the
   * client gets the neutral sentence below and nothing about our reasoning —
   * which is the correct default: the operator has to CHOOSE to say something,
   * rather than discover afterwards that a private note was published.
   */
  clientMessage: z.string().trim().max(500).optional(),
  lostReasonCategory: z.enum([
    "deadline_at_risk",
    "worker_unavailable",
    "client_cancelled_no_reason",
    "qc_failed_repeatedly",
    // LOT B: the firewall's own verdict, named. A request the platform
    // cannot take responsibility for is a measurable outcome, not "other".
    "out_of_scope",
    "other",
  ]),
});

export type CancelResult = { ok: true } | { ok: false; error: string };

/**
 * Admin override — reason mandatory. The compare-set is every state that can
 * LEGALLY reach cancelled, not every non-terminal state: `completed` is
 * non-terminal (dispute window) but cannot be cancelled, and transitionTask
 * rejects the whole call if any from-state is illegal.
 */
export async function cancelTask(input: unknown): Promise<CancelResult> {
  const admin = await requireRole("ADMIN");
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A cancellation reason is required." };
  const { taskId, reason, clientMessage, lostReasonCategory } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: {
          clientId: true,
          isInternal: true,
          currency: true,
          payments: {
            // Both are eligible for cancellation cleanup, but need different
            // Stripe calls: "authorized" money never moved (cancel the hold),
            // "received"/"partially_refunded" money did (refund it). See the
            // branch below.
            where: { status: { in: ["authorized", "received", "partially_refunded"] } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              amountCents: true,
              refunds: { select: { amountCents: true } },
            },
          },
        },
      });
      if (!task) throw new TransitionError("Task not found.");

      await transitionTask({
        tx,
        taskId,
        from: NON_TERMINAL_STATUSES.filter((s) => isAllowedTransition(s, "cancelled")),
        to: "cancelled",
        action: "admin_cancelled",
        actorId: admin.id,
        reason,
        data: { cancelledAt: new Date(), cancelReason: reason },
      });
      await withdrawHumanUnit(tx, {
        taskId,
        cause: "lifecycle_exit",
        actorId: admin.id,
      });

      // Excluded for internal practice tasks — not a real business outcome.
      if (!task.isInternal) {
        await upsertClosedJobLog(tx, taskId, {
          outcome: "lost",
          lostReasonCategory,
          lostReasonDetail: reason,
        });
      }

      await tx.payout.updateMany({
        where: { taskId, status: { not: "paid" } },
        data: { status: "void", note: `Task cancelled: ${reason}` },
      });
      await tx.moneyIntent.updateMany({
        where: {
          taskId,
          kind: { in: ["release_payout", "capture_client_payment"] },
          status: { in: ["queued", "failed"] },
        },
        data: { status: "done", processedAt: new Date(), lastError: null },
      });

      const payment = task.payments[0];
      const alreadyRefunded =
        payment?.refunds.reduce((sum, refund) => sum + refund.amountCents, 0) ?? 0;
      const refundDue =
        payment && payment.status !== "authorized" ? payment.amountCents - alreadyRefunded : 0;
      const holdToRelease = payment?.status === "authorized";
      if (!task.isInternal && payment && refundDue > 0) {
        await tx.moneyIntent.upsert({
          where: { idempotencyKey: `refund-admin-cancel:${taskId}:${payment.id}` },
          create: {
            taskId,
            kind: "refund_client",
            amountCents: refundDue,
            currency: task.currency,
            idempotencyKey: `refund-admin-cancel:${taskId}:${payment.id}`,
          },
          update: {},
        });
      } else if (!task.isInternal && payment && holdToRelease) {
        // Nothing was ever charged — release the hold instead of refunding.
        await tx.moneyIntent.upsert({
          where: { idempotencyKey: `cancel-admin-cancel:${taskId}:${payment.id}` },
          create: {
            taskId,
            kind: "cancel_authorization",
            amountCents: payment.amountCents,
            currency: task.currency,
            idempotencyKey: `cancel-admin-cancel:${taskId}:${payment.id}`,
          },
          update: {},
        });
      }
      // A standing task's cost was minutes, not a Payment row, so neither
      // branch above applies to it and nothing was giving the capacity back.
      // The client lost the work and the week's capacity for it.
      const restitution = await returnStandingMinutes(tx, taskId);
      const credited = restitutionMessage(restitution);
      await tx.notification.create({
        data: {
          userId: task.clientId,
          type: "task_cancelled",
          title:
            refundDue > 0
              ? "Task cancelled — refund queued"
              : holdToRelease
                ? "Task cancelled — card hold released"
                : credited && restitution.kind === "returned"
                  ? "Task cancelled — capacity credited"
                  : "Task cancelled",
          /**
           * THE MONEY FACT FIRST, THEN ONLY WHAT WAS WRITTEN FOR THE CLIENT.
           *
           * `reason` is gone from every branch. Two of them never carried it;
           * the other two did, and those are precisely the cancellations where
           * no money moved — the pricing-stage rejection, where an operator's
           * private note was the entire message the client received.
           *
           * What remains is true in all four cases and says the thing the
           * client needs: what happened to their money or their capacity.
           * Anything beyond that is opt-in, written knowingly in a field that
           * says so.
           */
          body: [
            refundDue > 0
              ? "The remaining received payment will be returned to its original method."
              : holdToRelease
                ? "Your card was never charged. The hold will be released."
                : credited
                  ? credited
                  : payment
                    // A payment exists but is neither refundable nor on hold:
                    // it was already refunded in full before the cancellation.
                    // Telling that client they were never charged is false.
                    ? "Any payment already made on this task has been returned."
                    : "You have not been charged for this task.",
            clientMessage,
          ]
            .filter(Boolean)
            .join("\n\n"),
          taskId,
        },
      });
    });
  } catch (e) {
    if (e instanceof IllegalTransitionError) {
      return { ok: false, error: "This task's state cannot be cancelled. Nothing was changed." };
    }
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task cannot be cancelled from its current state." };
    }
    throw e;
  }

  after(() => recomputeOperationalIntelligence(taskId, "admin_cancelled"));
  revalidatePath("/admin/pricing");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * LOT B — THE BUTTON THE PAUSE NOTIFICATION ALWAYS DESCRIBED.
 *
 * A paused run's task sits in ai_processing until the 6-hour stall sweep,
 * while the admin notification says "releasing it to the pool pays the worker
 * the full quoted amount" — an action that had no button. This is that
 * button's action: the SAME degraded exit the sweep takes
 * (releaseToPoolWithoutAutomation: frozen payout untouched, pool-payable
 * guard enforced, transition + audit event, pool notified), taken now, by a
 * person, on a run that is actually paused.
 *
 * Deliberately thin: no scheduler change, no run resurrection, no machine
 * simulation. Idempotent twice over — the state gate here, and the
 * ai_processing status guard inside the release itself, so a double click or
 * a race with the sweep is a no-op, never a double publication (and the pool
 * claim is atomic regardless).
 */
const releaseSchema = z.object({ taskId: z.string().min(1) });

export type ReleaseToPoolResult = { ok: true } | { ok: false; error: string };

export async function releasePausedRunToPool(input: unknown): Promise<ReleaseToPoolResult> {
  const admin = await requireRole("ADMIN");
  const parsed = releaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Task id required." };
  const { taskId } = parsed.data;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true, workflowRun: { select: { status: true } } },
  });
  if (!task) return { ok: false, error: "Task not found." };
  /**
   * The legal-state gate: only a PAUSED run may be released early. A running
   * run is still working (releasing it would race the runner); a finished
   * run already handed over; no run at all means the compile path owns the
   * exit. Everything else stays exactly on the existing rails.
   */
  if (task.status !== "ai_processing" || task.workflowRun?.status !== "paused") {
    return {
      ok: false,
      error: "Only a task whose automated run is paused can be released to the pool early.",
    };
  }

  await releaseToPoolWithoutAutomation(
    taskId,
    "released to the pool by an operator without waiting for the stall sweep",
    admin.id
  );

  // The release swallows an already-transitioned race as a no-op; read the
  // truth back rather than assert it.
  const afterState = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (afterState?.status !== "open") {
    return {
      ok: false,
      error:
        "The task did not reach the pool. If its payout or estimate is missing, resolve that first; see the admin notification.",
    };
  }

  revalidatePath(`/admin/tasks/${taskId}`);
  revalidatePath("/admin/tasks");
  return { ok: true };
}
