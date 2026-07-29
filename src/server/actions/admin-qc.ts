"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addHours } from "date-fns";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError, IllegalTransitionError } from "@/lib/state";

export type QcResult =
  | { ok: true; nextId: string | null }
  | { ok: false; error: string };

function failed(e: unknown): QcResult | null {
  if (e instanceof IllegalTransitionError) {
    // A bug in our own transition map, not a race. Never tell the operator
    // "someone else got there first" — that sends them looking in the wrong place.
    console.error("illegal transition in QC", e);
    return { ok: false, error: "That action is not possible from this state. This is a bug — nothing was changed." };
  }
  if (e instanceof TransitionError) {
    return { ok: false, error: "This task already moved on." };
  }
  return null;
}

const approveSchema = z.object({
  submissionId: z.string(),
  rating: z.number().int().min(1).max(5),
});

/**
 * QC approval. RULE 3 — this is the gate; nothing reaches the client before it.
 *
 * Everything commits in ONE transaction: releasing the task, recording the QC
 * decision and the rating, and recomputing the worker's score. Split across
 * transactions, a failure in the middle leaves a task marked completed whose
 * submission is still pending — which the client-facing query filters out, so
 * the client would see a finished task with nothing to download.
 */
export async function approveDeliverable(input: unknown): Promise<QcResult> {
  const admin = await requireRole("ADMIN");
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the work a rating from 1 to 5." };

  const settings = await getSettings();
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction and claim the submission with a
      // conditional update, so a double-click cannot rate twice.
      const claimed = await tx.submission.updateMany({
        where: { id: parsed.data.submissionId, qcStatus: "pending" },
        data: { qcStatus: "approved", rating: parsed.data.rating, reviewedAt: now },
      });
      if (claimed.count === 0) throw new TransitionError("already-reviewed");

      const submission = await tx.submission.findUniqueOrThrow({
        where: { id: parsed.data.submissionId },
        select: {
          taskId: true,
          vaId: true,
          task: { select: { firstCompletedAt: true } },
        },
      });
      const isFirstCompletion = submission.task.firstCompletedAt === null;

      await transitionTask({
        tx,
        taskId: submission.taskId,
        from: "submitted_for_qc",
        to: "completed",
        action: "admin_qc_approved",
        actorId: admin.id,
        data: {
          completedAt: now,
          // Immutable: set once, so returning here from a revision cannot
          // re-arm the post-delivery clock.
          ...(isFirstCompletion ? { firstCompletedAt: now } : {}),
          revisionWindowEndsAt: addHours(now, settings.revisionWindowHours),
          windowPausedAt: null,
        },
      });

      // Recompute the rolling score from source rather than incrementing a
      // cache, so it can never drift from the underlying rows.
      const recent = await tx.submission.findMany({
        where: { vaId: submission.vaId, qcStatus: "approved", rating: { not: null } },
        select: { rating: true },
        orderBy: { reviewedAt: "desc" },
        take: settings.scoreWindow,
      });
      const ratings = recent.map((r) => r.rating as number);
      const score = ratings.length
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null;

      const dropsBelowFloor =
        score !== null &&
        ratings.length >= settings.minRatedDeliveries &&
        score < settings.suspensionFloor;

      await tx.vaProfile.update({
        where: { userId: submission.vaId },
        data: {
          scoreCache: score,
          ratedCount: ratings.length,
          ...(isFirstCompletion ? { tasksCompleted: { increment: 1 } } : {}),
          ...(dropsBelowFloor
            ? {
                status: "suspended" as const,
                suspendedAt: now,
                suspensionReason: `Rolling score ${score.toFixed(2)} fell below the ${settings.suspensionFloor.toFixed(1)} floor.`,
              }
            : {}),
        },
      });
    });
  } catch (e) {
    if (e instanceof TransitionError && e.message === "already-reviewed") {
      return { ok: false, error: "This delivery has already been reviewed." };
    }
    const handled = failed(e);
    if (handled) return handled;
    throw e;
  }

  revalidatePath("/admin/qc");
  revalidatePath("/admin");
  const nextId = await nextInQcQueue();
  return { ok: true, nextId };
}

const rejectSchema = z.object({
  submissionId: z.string(),
  comment: z.string().trim().min(5).max(4000),
});

/**
 * QC rejection: back to the same worker with the comment. After maxQcRounds the
 * task returns to the pool for someone else — and under the agreed money rules
 * the original worker is not paid.
 *
 * On reassignment, qcRounds resets to zero (the next worker starts with a full
 * allowance, not the previous worker's used-up one) and the failed worker is
 * blocked from re-claiming by their rejected submission on the task.
 */
export async function rejectDeliverable(input: unknown): Promise<QcResult> {
  const admin = await requireRole("ADMIN");
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Write what needs fixing — the worker only sees this comment." };
  }

  const settings = await getSettings();
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.submission.updateMany({
        where: { id: parsed.data.submissionId, qcStatus: "pending" },
        data: { qcStatus: "rejected", qcComment: parsed.data.comment, reviewedAt: now },
      });
      if (claimed.count === 0) throw new TransitionError("already-reviewed");

      const submission = await tx.submission.findUniqueOrThrow({
        where: { id: parsed.data.submissionId },
        select: { taskId: true, vaId: true, task: { select: { qcRounds: true } } },
      });

      const roundsAfter = submission.task.qcRounds + 1;
      const exhausted = roundsAfter >= settings.maxQcRounds;

      await transitionTask({
        tx,
        taskId: submission.taskId,
        from: "submitted_for_qc",
        to: exhausted ? "open" : "qc_rejected",
        action: exhausted ? "admin_qc_rejected_exhausted" : "admin_qc_rejected",
        actorId: admin.id,
        reason: parsed.data.comment,
        data: exhausted
          ? {
              // Back to the pool: the next worker gets a fresh allowance, and
              // this one loses file access with the claim.
              qcRounds: 0,
              claimedById: null,
              claimedAt: null,
            }
          : { qcRounds: roundsAfter },
        meta: { round: roundsAfter, exhausted },
      });

      await tx.vaProfile.update({
        where: { userId: submission.vaId },
        data: { qcRejections: { increment: 1 } },
      });
    });
  } catch (e) {
    if (e instanceof TransitionError && e.message === "already-reviewed") {
      return { ok: false, error: "This delivery has already been reviewed." };
    }
    const handled = failed(e);
    if (handled) return handled;
    throw e;
  }

  revalidatePath("/admin/qc");
  revalidatePath("/admin");
  const nextId = await nextInQcQueue();
  return { ok: true, nextId };
}

async function nextInQcQueue(): Promise<string | null> {
  const rows = await prisma.task.findMany({
    where: { status: "submitted_for_qc" },
    select: { id: true },
    orderBy: [{ clientDeadlineUtc: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 1,
  });
  return rows[0]?.id ?? null;
}
