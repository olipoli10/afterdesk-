"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApprovedVa } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";

export type VaActionResult = { ok: true } | { ok: false; error: string };

/**
 * First come, first served. The compare-and-swap in transitionTask does the
 * work: `from: "open"` plus a guard on claimedById being null means exactly one
 * of two simultaneous claims can match. The loser gets a plain message, not an
 * error page.
 *
 * Eligibility is re-checked inside the same transaction — a worker suspended
 * between page load and click must not be able to claim.
 */
export async function claimTask(taskId: string): Promise<VaActionResult> {
  const user = await requireApprovedVa();
  const settings = await getSettings();

  const [profile, task, activeCount] = await Promise.all([
    prisma.vaProfile.findUnique({
      where: { userId: user.id },
      select: { status: true, scoreCache: true, ratedCount: true },
    }),
    prisma.task.findUnique({ where: { id: taskId }, select: { tier: true, status: true } }),
    prisma.task.count({
      where: {
        claimedById: user.id,
        status: { in: ["claimed", "submitted_for_qc", "qc_rejected", "revision_requested"] },
      },
    }),
  ]);

  if (profile?.status !== "approved") {
    return { ok: false, error: "Your account is not currently able to claim tasks." };
  }
  if (!task) return { ok: false, error: "This task is no longer available." };

  // Tier gate — the same rule the pool query applies, re-checked at write time
  // so a stale page cannot be used to claim a high-value task.
  if (task.tier === "high_value") {
    const eligible =
      profile.scoreCache !== null &&
      profile.scoreCache >= settings.highValueThreshold &&
      profile.ratedCount >= settings.minRatedDeliveries;
    if (!eligible) {
      return {
        ok: false,
        error: `High-value tasks open up at a ${settings.highValueThreshold.toFixed(1)} score across ${settings.minRatedDeliveries} rated deliveries.`,
      };
    }
  }

  // Work-in-progress cap: without it one fast worker can hoard the pool.
  if (activeCount >= settings.maxActiveClaims) {
    return {
      ok: false,
      error: `You already have ${activeCount} tasks in progress. Finish one before claiming another.`,
    };
  }

  try {
    await transitionTask({
      taskId,
      from: "open",
      to: "claimed",
      action: "va_claimed",
      actorId: user.id,
      guard: { claimedById: null },
      data: { claimedById: user.id, claimedAt: new Date() },
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task was just taken by someone else." };
    }
    throw e;
  }

  revalidatePath("/va");
  revalidatePath("/va/pool");
  return { ok: true };
}

/**
 * Voluntary release. Returns the task to the pool and marks an abandonment on
 * the worker's record — no money moves (nothing was owed yet).
 */
export async function releaseTask(taskId: string): Promise<VaActionResult> {
  const user = await requireApprovedVa();

  const owned = await prisma.task.findFirst({
    where: { id: taskId, claimedById: user.id },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "Task not found." };

  try {
    await transitionTask({
      taskId,
      from: "claimed",
      to: "open",
      action: "va_released",
      actorId: user.id,
      guard: { claimedById: user.id },
      data: { claimedById: null, claimedAt: null },
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task can no longer be released." };
    }
    throw e;
  }

  await prisma.vaProfile.update({
    where: { userId: user.id },
    data: { tasksAbandoned: { increment: 1 } },
  });

  revalidatePath("/va");
  revalidatePath("/va/pool");
  return { ok: true };
}

const submitDeliverableSchema = z.object({
  taskId: z.string(),
  note: z.string().trim().max(4000).optional(),
  fileIds: z.array(z.string()).max(20).default([]),
});

/**
 * Delivery. Creates one Submission (the QC unit) and attaches the uploaded
 * files to it. Several files can belong to one delivery; the admin makes one
 * decision on the whole submission, never file by file.
 */
export async function submitDeliverable(input: unknown): Promise<VaActionResult> {
  const user = await requireApprovedVa();
  const parsed = submitDeliverableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid submission." };
  const { taskId, note, fileIds } = parsed.data;

  if (fileIds.length === 0 && !note?.trim()) {
    return { ok: false, error: "Attach the finished work, or write your answer in the note." };
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, claimedById: user.id },
    select: { id: true, status: true },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (!["claimed", "qc_rejected", "revision_requested"].includes(task.status)) {
    return { ok: false, error: "This task is not open for delivery right now." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const previous = await tx.submission.count({ where: { taskId } });

      // Anything still pending is superseded by this delivery, so the QC queue
      // can never show two undecided submissions for one task.
      await tx.submission.updateMany({
        where: { taskId, qcStatus: "pending" },
        data: { qcStatus: "superseded" },
      });

      const submission = await tx.submission.create({
        data: {
          taskId,
          vaId: user.id,
          attemptNo: previous + 1,
          note: note?.trim() || null,
        },
      });

      if (fileIds.length > 0) {
        const claimed = await tx.file.updateMany({
          where: {
            id: { in: fileIds },
            uploaderId: user.id,
            taskId: null,
            kind: "deliverable",
          },
          data: { taskId, submissionId: submission.id },
        });
        if (claimed.count !== fileIds.length) throw new Error("file-claim-mismatch");
      }
    });

    await transitionTask({
      taskId,
      from: ["claimed", "qc_rejected", "revision_requested"],
      to: "submitted_for_qc",
      action: "va_submitted_deliverable",
      actorId: user.id,
      guard: { claimedById: user.id },
      meta: { files: fileIds.length },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "file-claim-mismatch") {
      return { ok: false, error: "One of the files could not be attached. Re-upload and try again." };
    }
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task is no longer open for delivery." };
    }
    throw e;
  }

  revalidatePath("/va");
  revalidatePath(`/va/tasks/${taskId}`);
  revalidatePath("/admin/qc");
  return { ok: true };
}
