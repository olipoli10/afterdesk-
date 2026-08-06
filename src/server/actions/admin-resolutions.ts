"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { recomputeOperationalIntelligence } from "@/server/operational-actuals";
import { addMilliseconds, addHours } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";
import { releaseHeldFunds } from "@/lib/escrow";
import { upsertClosedJobLog } from "@/lib/closed-job-log";
import {
  returnStandingMinutes,
  restitutionMessage,
  type StandingRestitution,
} from "@/lib/standing-restitution";

export type ResolutionResult = { ok: true } | { ok: false; error: string };

const instructionsSchema = z.object({
  taskId: z.string().min(1).max(100),
  summary: z.string().trim().min(10).max(4000),
});

export async function publishRevisionInstructions(input: unknown): Promise<ResolutionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = instructionsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Write identity-safe instructions for the worker." };
  }

  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: parsed.data.taskId },
      select: { claimedById: true },
    });
    if (!task || !task.claimedById) return false;
    const updated = await tx.task.updateMany({
      where: {
        id: parsed.data.taskId,
        status: "revision_requested",
        claimedById: { not: null },
      },
      data: { revisionInstructions: parsed.data.summary },
    });
    if (updated.count === 0) return false;
    await tx.taskEvent.create({
      data: {
        taskId: parsed.data.taskId,
        action: "admin_published_revision_instructions",
        actorId: admin.id,
        meta: { identitySafeSummary: true },
      },
    });
    await tx.notification.create({
      data: {
        userId: task.claimedById,
        type: "revision_ready",
        title: "Revision instructions are ready",
        body: parsed.data.summary,
        taskId: parsed.data.taskId,
      },
    });
    return true;
  });
  if (!result) return { ok: false, error: "This task is not waiting for revision instructions." };
  revalidatePath(`/admin/tasks/${parsed.data.taskId}`);
  revalidatePath(`/va/tasks/${parsed.data.taskId}`);
  return { ok: true };
}

const disputeDecisionSchema = z.object({
  disputeId: z.string().min(1).max(100),
  outcome: z.enum(["rejected", "rework", "upheld"]),
  summary: z.string().trim().max(4000).default(""),
});

export async function decideDispute(input: unknown): Promise<ResolutionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = disputeDecisionSchema.safeParse(input);
  if (!parsed.success || (parsed.data.outcome === "rework" && parsed.data.summary.length < 10)) {
    return { ok: false, error: "Rework decisions need identity-safe worker instructions." };
  }
  const settings = await getSettings();
  const now = new Date();

  let taskId = "";
  // Only the "upheld" branch sets this; the other two outcomes leave the task
  // alive, so nothing is given back and the default is what the client reads.
  let restitution: StandingRestitution = { kind: "not_standing" };
  try {
    await prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({
        where: { id: parsed.data.disputeId },
        select: {
          id: true,
          taskId: true,
          outcome: true,
          task: {
            select: {
              status: true,
              clientId: true,
              claimedById: true,
              clientPriceCents: true,
              vaPayoutCents: true,
              currency: true,
              isInternal: true,
              revisionWindowEndsAt: true,
              windowPausedAt: true,
              payments: {
                // Almost always "received" by the time a dispute exists
                // (disputes only open on "completed" tasks, and QC approval
                // already enqueues the capture) — "authorized" only shows up
                // in the narrow window before that capture money intent has
                // actually run. See the branch below.
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
          },
        },
      });
      if (!dispute || dispute.outcome !== "pending" || dispute.task.status !== "disputed") {
        throw new TransitionError("not-open");
      }
      taskId = dispute.taskId;

      await tx.dispute.update({
        where: { id: dispute.id },
        data: {
          outcome: parsed.data.outcome,
          adminSummaryForWorker: parsed.data.summary || null,
          decidedAt: now,
          decidedById: admin.id,
        },
      });

      if (parsed.data.outcome === "rejected") {
        const pausedMs = dispute.task.windowPausedAt
          ? now.getTime() - dispute.task.windowPausedAt.getTime()
          : 0;
        const resumed = dispute.task.revisionWindowEndsAt
          ? addMilliseconds(dispute.task.revisionWindowEndsAt, pausedMs)
          : addHours(now, settings.revisionMinRemainingHours);
        const windowEnd =
          resumed > addHours(now, settings.revisionMinRemainingHours)
            ? resumed
            : addHours(now, settings.revisionMinRemainingHours);
        await transitionTask({
          tx,
          taskId,
          from: "disputed",
          to: "completed",
          action: "admin_rejected_dispute",
          actorId: admin.id,
          data: {
            windowPausedAt: null,
            revisionWindowEndsAt: windowEnd,
            revisionInstructions: null,
          },
        });
        // The client's complaint didn't hold up, so this delivery is final
        // right now — same "release everything" call the dispute-window
        // sweep makes when nothing gets disputed at all (releaseHeldFunds,
        // src/lib/escrow.ts). Captures the (still-authorized) payment
        // immediately rather than waiting out whatever's left of the window.
        await releaseHeldFunds(tx, taskId);
      } else if (parsed.data.outcome === "rework") {
        await transitionTask({
          tx,
          taskId,
          from: "disputed",
          to: "revision_requested",
          action: "admin_ordered_dispute_rework",
          actorId: admin.id,
          data: {
            revisionInstructions: parsed.data.summary,
            windowPausedAt: now,
          },
        });
        if (dispute.task.claimedById) {
          await tx.notification.create({
            data: {
              userId: dispute.task.claimedById,
              type: "dispute_rework",
              title: "Rework required",
              body: parsed.data.summary,
              taskId,
            },
          });
        }
      } else {
        await transitionTask({
          tx,
          taskId,
          from: "disputed",
          to: "cancelled",
          action: "admin_upheld_dispute",
          actorId: admin.id,
          data: {
            cancelledAt: now,
            cancelReason: "Client dispute upheld against the written delivery standard.",
          },
        });

        // Gap found and fixed while auditing the full task-lifecycle path:
        // cancelTask (admin.ts) already logs a "lost" outcome on cancel, but
        // this is a SEPARATE cancellation path (dispute upheld, after a
        // "won" row may already exist from the original QC approval in
        // admin-qc.ts). Without this, a successfully disputed delivery
        // would stay logged as "won" forever. No LostReasonCategory value
        // fits "delivered, then a client complaint was upheld" precisely —
        // "other" + a clear detail is more honest than forcing a mismatched
        // category (e.g. qc_failed_repeatedly, which means something
        // different: QC rounds exhausted during production, not a
        // post-delivery dispute).
        if (!dispute.task.isInternal) {
          await upsertClosedJobLog(tx, taskId, {
            outcome: "lost",
            lostReasonCategory: "other",
            lostReasonDetail: "Client dispute upheld after delivery.",
          });
        }

        await tx.payout.updateMany({
          where: { taskId, status: { not: "paid" } },
          data: { status: "void", note: "Client dispute upheld." },
        });
        await tx.moneyIntent.updateMany({
          where: {
            taskId,
            kind: { in: ["release_payout", "capture_client_payment"] },
            status: { in: ["queued", "failed"] },
          },
          data: { status: "done", processedAt: now, lastError: null },
        });
        const payment = dispute.task.payments[0];
        const alreadyRefunded =
          payment?.refunds.reduce((sum, refund) => sum + refund.amountCents, 0) ?? 0;
        // Almost always "received" (see the query comment above) — the
        // "authorized" branch only fires in the rare window where a dispute
        // was upheld before the capture money intent QC approval enqueued
        // ever got processed.
        const refundDue =
          payment && payment.status !== "authorized" ? payment.amountCents - alreadyRefunded : 0;
        if (payment && refundDue > 0) {
          await tx.moneyIntent.upsert({
            where: { idempotencyKey: `refund-upheld-dispute:${dispute.id}` },
            create: {
              taskId,
              kind: "refund_client",
              amountCents: refundDue,
              currency: dispute.task.currency,
              idempotencyKey: `refund-upheld-dispute:${dispute.id}`,
            },
            update: {},
          });
          restitution = { kind: "not_standing" };
        } else if (payment && payment.status === "authorized") {
          await tx.moneyIntent.upsert({
            where: { idempotencyKey: `cancel-upheld-dispute:${dispute.id}` },
            create: {
              taskId,
              kind: "cancel_authorization",
              amountCents: payment.amountCents,
              currency: dispute.task.currency,
              idempotencyKey: `cancel-upheld-dispute:${dispute.id}`,
            },
            update: {},
          });
          restitution = { kind: "not_standing" };
        } else {
          // No Payment row at all. Either an internal task, or — the case this
          // branch exists for — a standing task, whose client pays at the block
          // level and has nothing here to refund. The minutes go back instead;
          // upholding the dispute means the delivery failed the written
          // standard, and a standing client must not end up worse off than a
          // one-off client who gets refunded for the same failure.
          restitution = await returnStandingMinutes(tx, taskId);
        }
      }

      await tx.notification.create({
        data: {
          userId: dispute.task.clientId,
          type: "dispute_decided",
          title:
            parsed.data.outcome === "rejected"
              ? "Dispute reviewed — delivery stands"
              : parsed.data.outcome === "rework"
                ? "Dispute reviewed — rework ordered"
                : restitution.kind === "not_standing"
                  ? "Dispute upheld — refund queued"
                  : "Dispute upheld — capacity credited",
          // A standing client has no payment of their own to refund: the block
          // is paid separately and this task's cost was minutes, not money.
          // The refund line used to be printed for every upheld dispute, so
          // they were promised a repayment that nothing in the system would
          // ever produce.
          body:
            parsed.data.outcome !== "upheld"
              ? "Open the task for the current status and next step."
              : (restitutionMessage(restitution) ??
                "The refund is returned to the original payment method."),
          taskId,
        },
      });
    });
  } catch (error) {
    if (error instanceof TransitionError) {
      return { ok: false, error: "This dispute has already been decided or the task moved on." };
    }
    throw error;
  }

  after(() => recomputeOperationalIntelligence(taskId, "dispute_decided"));
  revalidatePath(`/admin/tasks/${taskId}`);
  revalidatePath(`/client/tasks/${taskId}`);
  revalidatePath(`/va/tasks/${taskId}`);
  return { ok: true };
}
