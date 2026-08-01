"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireApprovedVa } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError, IllegalTransitionError } from "@/lib/state";

export type VaActionResult = { ok: true } | { ok: false; error: string };

/** Thrown inside a transaction to abort with a specific message. */
class Refused extends Error {}

function surfaced(e: unknown): VaActionResult | null {
  if (e instanceof Refused) return { ok: false, error: e.message };
  if (e instanceof IllegalTransitionError) {
    console.error("illegal transition in VA action", e);
    return { ok: false, error: "That action is not possible right now. Nothing was changed." };
  }
  return null;
}

/**
 * First come, first served.
 *
 * Every check runs INSIDE the transaction that performs the compare-and-swap.
 * Read them outside and they are advisory: N parallel requests all read
 * "2 active tasks", all pass the cap, and all claim — no crash, no timing luck
 * required, just a browser that fires the action more than once.
 */
export async function claimTask(taskId: string): Promise<VaActionResult> {
  const user = await requireApprovedVa();
  const settings = await getSettings();

  try {
    await prisma.$transaction(async (tx) => {
      const profile = await tx.vaProfile.findUnique({
        where: { userId: user.id },
        select: { status: true, scoreCache: true, ratedCount: true },
      });
      if (profile?.status !== "approved") {
        throw new Refused("Your account is not currently able to claim tasks.");
      }

      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: { tier: true },
      });
      if (!task) throw new Refused("This task is no longer available.");

      // A worker who already failed this task out of QC cannot pick it up
      // again — the reassignment exists to put fresh eyes on it.
      const previouslyFailed = await tx.submission.count({
        where: { taskId, vaId: user.id, qcStatus: "rejected" },
      });
      if (previouslyFailed > 0) {
        throw new Refused("This task was reassigned after your earlier delivery. It is open to other workers now.");
      }

      if (task.tier === "high_value") {
        const eligible =
          profile.scoreCache !== null &&
          profile.scoreCache >= settings.highValueThreshold &&
          profile.ratedCount >= settings.minRatedDeliveries;
        if (!eligible) {
          throw new Refused(
            `High-value tasks open up at a ${settings.highValueThreshold.toFixed(1)} score across ${settings.minRatedDeliveries} rated deliveries.`
          );
        }
      }

      // Work-in-progress cap: without it one fast worker can hoard the pool.
      // The advisory lock serializes this check per worker so two concurrent
      // claims on two different tasks can't both read the same count and both
      // pass it (mirrors the exam-attempt cap in academy.ts's submitExam).
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`claim-cap:${user.id}`}))
      `;
      const activeCount = await tx.task.count({
        where: {
          claimedById: user.id,
          status: { in: ["claimed", "submitted_for_qc", "qc_rejected", "revision_requested"] },
        },
      });
      if (activeCount >= settings.maxActiveClaims) {
        throw new Refused(
          `You already have ${activeCount} tasks in progress. Finish one before claiming another.`
        );
      }

      await transitionTask({
        tx,
        taskId,
        from: "open",
        to: "claimed",
        action: "va_claimed",
        actorId: user.id,
        guard: { claimedById: null },
        data: { claimedById: user.id, claimedAt: new Date() },
      });
    });
  } catch (e) {
    const handled = surfaced(e);
    if (handled) return handled;
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
 * the worker's record — no money moves (nothing was owed yet). Both writes
 * commit together so a double-click cannot double-count the abandonment.
 */
export async function releaseTask(taskId: string): Promise<VaActionResult> {
  const user = await requireApprovedVa();

  try {
    await prisma.$transaction(async (tx) => {
      await transitionTask({
        tx,
        taskId,
        from: "claimed",
        to: "open",
        action: "va_released",
        actorId: user.id,
        guard: { claimedById: user.id },
        data: { claimedById: null, claimedAt: null },
      });

      await tx.vaProfile.update({
        where: { userId: user.id },
        data: { tasksAbandoned: { increment: 1 } },
      });
    });
  } catch (e) {
    const handled = surfaced(e);
    if (handled) return handled;
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task can no longer be released." };
    }
    throw e;
  }

  revalidatePath("/va");
  revalidatePath("/va/pool");
  return { ok: true };
}

const askAdminQuestionSchema = z.object({
  taskId: z.string(),
  message: z.string().trim().min(5).max(1000),
});

/**
 * The worker-side "Ask a question" — did not exist before this (only the
 * client side, requestRevision/openDispute in client-tasks.ts, had a real
 * contact-admin channel). Same shape: a TaskEvent the admin's existing
 * audit-log render already displays with no new UI (src/app/admin/tasks/[id]/page.tsx
 * — it maps every TaskEvent generically), plus a Notification to every
 * admin. No state transition — asking a question does not move the task.
 *
 * This is also the real destination the new AI assistant (src/lib/assistant-ai.ts)
 * redirects to whenever it isn't confident, and the fallback message if the
 * Anthropic call fails — it has to be a real channel before either of those
 * can honestly point at it.
 */
export async function askAdminQuestion(input: unknown): Promise<VaActionResult> {
  const user = await requireApprovedVa();
  const parsed = askAdminQuestionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Write your question (5–1000 characters)." };
  }
  const { taskId, message } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, claimedById: user.id, status: { in: ["claimed", "qc_rejected", "revision_requested"] } },
        select: { id: true },
      });
      if (!task) throw new Refused("This task isn't currently yours to ask about.");

      await tx.taskEvent.create({
        data: {
          taskId,
          action: "va_asked_question",
          actorId: user.id,
          reason: message,
        },
      });

      const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: "va_question",
            title: "A worker asked a question",
            body: message,
            taskId,
          })),
        });
      }
    });
  } catch (e) {
    const handled = surfaced(e);
    if (handled) return handled;
    throw e;
  }

  revalidatePath(`/va/tasks/${taskId}`);
  return { ok: true };
}

const submitDeliverableSchema = z.object({
  taskId: z.string(),
  note: z.string().trim().max(4000).optional(),
  fileIds: z.array(z.string()).max(20).default([]),
});

/**
 * Delivery. Creates one Submission (the QC unit), attaches the uploaded files
 * to it, and moves the task — all in one transaction. Committing the
 * Submission first and transitioning after leaves an orphan pending submission
 * on a task that never entered the QC queue if anything fails between them.
 */
export async function submitDeliverable(input: unknown): Promise<VaActionResult> {
  const user = await requireApprovedVa();
  const parsed = submitDeliverableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid submission." };
  const { taskId, note, fileIds } = parsed.data;

  if (fileIds.length === 0 && !note?.trim()) {
    return { ok: false, error: "Attach the finished work, or write your answer in the note." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, claimedById: user.id },
        select: { status: true, revisionInstructions: true },
      });
      if (!task) throw new Refused("Task not found.");
      if (!["claimed", "qc_rejected", "revision_requested"].includes(task.status)) {
        throw new Refused("This task is not open for delivery right now.");
      }
      if (task.status === "revision_requested" && !task.revisionInstructions) {
        throw new Refused("The operator is still preparing the revision instructions.");
      }

      // Anything still pending is superseded by this delivery, so the QC queue
      // can never show two undecided submissions for one task.
      await tx.submission.updateMany({
        where: { taskId, qcStatus: "pending" },
        data: { qcStatus: "superseded" },
      });

      // attemptNo is a display counter; the unique constraint on
      // (taskId, attemptNo) is what actually prevents a duplicate, and the
      // whole transaction rolls back if two deliveries race to the same number.
      const previous = await tx.submission.count({ where: { taskId } });

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
            scanStatus: "clean",
          },
          data: { taskId, submissionId: submission.id },
        });
        if (claimed.count !== fileIds.length) {
          throw new Refused("One of the files could not be attached. Re-upload and try again.");
        }
      }

      await transitionTask({
        tx,
        taskId,
        from: ["claimed", "qc_rejected", "revision_requested"],
        to: "submitted_for_qc",
        action: "va_submitted_deliverable",
        actorId: user.id,
        guard: { claimedById: user.id },
        meta: { files: fileIds.length },
      });
    });
  } catch (e) {
    const handled = surfaced(e);
    if (handled) return handled;
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task is no longer open for delivery." };
    }
    // Two deliveries raced to the same attemptNo and lost the (taskId,
    // attemptNo) unique constraint — the whole transaction already rolled
    // back, so nothing was double-submitted, just retry.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "This task is no longer open for delivery. Try again." };
    }
    throw e;
  }

  revalidatePath("/va");
  revalidatePath(`/va/tasks/${taskId}`);
  revalidatePath("/admin/qc");
  return { ok: true };
}
