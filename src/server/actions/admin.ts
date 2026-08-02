"use server";

import { revalidatePath } from "next/cache";
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
import { returnStandingMinutes, restitutionMessage } from "@/lib/standing-restitution";

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
  const { taskId, tier, filesVerified, categoryId, estimatedMinutes } = parsed.data;

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
    select: { clientDeadlineUtc: true, standingCapacityAccountId: true },
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
  const effectiveHourlyUsd = (vaPayoutCents / 100) / (estimatedMinutes / 60);
  if (effectiveHourlyUsd < settings.minWorkerHourlyUsd) {
    return {
      ok: false,
      error: `That payout is about $${effectiveHourlyUsd.toFixed(2)}/hour. Raise it to at least $${settings.minWorkerHourlyUsd.toFixed(2)}/hour for the estimate.`,
    };
  }
  const now = new Date();
  const quoteExpiresAt = addHours(now, settings.quoteValidityHours);
  const vaDeadlineUtc = task.clientDeadlineUtc
    ? computeVaDeadline(task.clientDeadlineUtc, settings)
    : null;

  try {
    await transitionTask({
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
      },
      // RULE 2: never persist raw prices in TaskEvent.meta — the authoritative
      // values live on the Task row behind the role-shaped selects, and meta
      // has no role-shaping of its own.
      meta: { tier, priced: true },
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
      await transitionTask({
        tx,
        taskId: parsed.data.taskId,
        from: ["claimed", "qc_rejected", "submitted_for_qc", "revision_requested"],
        to: "open",
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
  return { ok: true };
}

const cancelSchema = z.object({
  taskId: z.string(),
  reason: z.string().trim().min(3).max(2000),
  lostReasonCategory: z.enum([
    "deadline_at_risk",
    "worker_unavailable",
    "client_cancelled_no_reason",
    "qc_failed_repeatedly",
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
  const { taskId, reason, lostReasonCategory } = parsed.data;

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
          body:
            refundDue > 0
              ? "The remaining received payment will be returned to its original method."
              : holdToRelease
                ? "Your card was never charged. The hold will be released."
                : credited
                  ? `${reason}\n\n${credited}`
                  : reason,
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

  revalidatePath("/admin/pricing");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  return { ok: true };
}
