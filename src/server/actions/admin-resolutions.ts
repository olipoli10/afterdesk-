"use server";

import { revalidatePath } from "next/cache";
import { addMilliseconds, addHours } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";

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
      select: { status: true, claimedById: true },
    });
    if (!task || task.status !== "revision_requested" || !task.claimedById) return false;
    await tx.task.update({
      where: { id: parsed.data.taskId },
      data: { revisionInstructions: parsed.data.summary },
    });
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
              revisionWindowEndsAt: true,
              windowPausedAt: true,
              payments: {
                where: { status: { in: ["received", "partially_refunded"] } },
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
        if (dispute.task.claimedById && dispute.task.vaPayoutCents) {
          await tx.payout.updateMany({
            where: { taskId, vaId: dispute.task.claimedById, status: { not: "paid" } },
            data: { status: "released", releasedAt: now, note: null },
          });
          await tx.moneyIntent.upsert({
            where: {
              idempotencyKey: `release-payout:${taskId}:${dispute.task.claimedById}`,
            },
            create: {
              taskId,
              kind: "release_payout",
              amountCents: dispute.task.vaPayoutCents,
              currency: dispute.task.currency,
              idempotencyKey: `release-payout:${taskId}:${dispute.task.claimedById}`,
            },
            update: { status: "queued", lastError: null, processedAt: null },
          });
        }
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
        await tx.payout.updateMany({
          where: { taskId, status: { not: "paid" } },
          data: { status: "void", note: "Client dispute upheld." },
        });
        await tx.moneyIntent.updateMany({
          where: { taskId, kind: "release_payout", status: { in: ["queued", "failed"] } },
          data: { status: "done", processedAt: now, lastError: null },
        });
        const payment = dispute.task.payments[0];
        const alreadyRefunded =
          payment?.refunds.reduce((sum, refund) => sum + refund.amountCents, 0) ?? 0;
        const refundDue = payment ? payment.amountCents - alreadyRefunded : 0;
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
                : "Dispute upheld — refund queued",
          body:
            parsed.data.outcome === "upheld"
              ? "The refund is returned to the original payment method."
              : "Open the task for the current status and next step.",
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

  revalidatePath(`/admin/tasks/${taskId}`);
  revalidatePath(`/client/tasks/${taskId}`);
  revalidatePath(`/va/tasks/${taskId}`);
  return { ok: true };
}
