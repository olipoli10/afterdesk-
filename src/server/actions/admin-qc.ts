"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addHours } from "date-fns";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";

export type QcResult =
  | { ok: true; nextId: string | null }
  | { ok: false; error: string };

const approveSchema = z.object({
  submissionId: z.string(),
  rating: z.number().int().min(1).max(5),
});

/**
 * QC approval: the deliverable is released to the client and the worker's
 * rating is recorded. RULE 3 — this is the gate; nothing reaches the client
 * before it.
 *
 * The rolling score is recomputed from the last N ratings rather than
 * incremented, so it can never drift from the underlying Submission rows.
 */
export async function approveDeliverable(input: unknown): Promise<QcResult> {
  const admin = await requireRole("ADMIN");
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the work a rating from 1 to 5." };

  const settings = await getSettings();
  const submission = await prisma.submission.findUnique({
    where: { id: parsed.data.submissionId },
    select: {
      id: true,
      taskId: true,
      vaId: true,
      qcStatus: true,
      task: { select: { status: true, firstCompletedAt: true } },
    },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  if (submission.qcStatus !== "pending") {
    return { ok: false, error: "This delivery has already been reviewed." };
  }

  const now = new Date();
  const isFirstCompletion = submission.task.firstCompletedAt === null;

  try {
    await transitionTask({
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
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task already moved on." };
    }
    throw e;
  }

  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: submission.id },
      data: { qcStatus: "approved", rating: parsed.data.rating, reviewedAt: now },
    });

    // Recompute the rolling score from source rather than incrementing a cache.
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

    await tx.vaProfile.update({
      where: { userId: submission.vaId },
      data: {
        scoreCache: score,
        ratedCount: ratings.length,
        ...(isFirstCompletion ? { tasksCompleted: { increment: 1 } } : {}),
        // Falling below the floor suspends the worker from the pool and flags
        // them for review. Reversible by the admin.
        ...(score !== null && ratings.length >= settings.minRatedDeliveries && score < settings.suspensionFloor
          ? {
              status: "suspended" as const,
              suspendedAt: now,
              suspensionReason: `Rolling score ${score.toFixed(2)} fell below the ${settings.suspensionFloor.toFixed(1)} floor.`,
            }
          : {}),
      },
    });
  });

  revalidatePath("/admin/qc");
  revalidatePath("/admin");
  const nextId = await nextInQcQueue(submission.taskId);
  return { ok: true, nextId };
}

const rejectSchema = z.object({
  submissionId: z.string(),
  comment: z.string().trim().min(5).max(4000),
});

/**
 * QC rejection: back to the same worker with the comment. After maxQcRounds
 * the task escalates — the admin reassigns it, and under the agreed money
 * rules the original worker is not paid.
 */
export async function rejectDeliverable(input: unknown): Promise<QcResult> {
  const admin = await requireRole("ADMIN");
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Write what needs fixing — the worker only sees this comment." };
  }

  const settings = await getSettings();
  const submission = await prisma.submission.findUnique({
    where: { id: parsed.data.submissionId },
    select: {
      id: true,
      taskId: true,
      vaId: true,
      qcStatus: true,
      task: { select: { qcRounds: true } },
    },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  if (submission.qcStatus !== "pending") {
    return { ok: false, error: "This delivery has already been reviewed." };
  }

  const roundsAfter = submission.task.qcRounds + 1;
  const exhausted = roundsAfter >= settings.maxQcRounds;

  try {
    await transitionTask({
      taskId: submission.taskId,
      from: "submitted_for_qc",
      to: exhausted ? "open" : "qc_rejected",
      action: exhausted ? "admin_qc_rejected_exhausted" : "admin_qc_rejected",
      actorId: admin.id,
      reason: parsed.data.comment,
      data: {
        qcRounds: roundsAfter,
        // Exhausted: the task returns to the pool for someone else, so it
        // leaves this worker's hands and their file access ends with it.
        ...(exhausted ? { claimedById: null, claimedAt: null } : {}),
      },
      meta: { round: roundsAfter, exhausted },
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task already moved on." };
    }
    throw e;
  }

  await prisma.$transaction([
    prisma.submission.update({
      where: { id: submission.id },
      data: {
        qcStatus: "rejected",
        qcComment: parsed.data.comment,
        reviewedAt: new Date(),
      },
    }),
    prisma.vaProfile.update({
      where: { userId: submission.vaId },
      data: { qcRejections: { increment: 1 } },
    }),
  ]);

  revalidatePath("/admin/qc");
  revalidatePath("/admin");
  const nextId = await nextInQcQueue(submission.taskId);
  return { ok: true, nextId };
}

async function nextInQcQueue(excludeTaskId: string): Promise<string | null> {
  const rows = await prisma.task.findMany({
    where: { status: "submitted_for_qc", id: { not: excludeTaskId } },
    select: { id: true },
    orderBy: [{ clientDeadlineUtc: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 1,
  });
  return rows[0]?.id ?? null;
}
