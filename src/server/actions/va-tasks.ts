"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireApprovedVa } from "@/lib/authz";
import { after } from "next/server";
import { stopAllOpenSessions } from "@/server/work-sessions";
import { recomputeOperationalIntelligence } from "@/server/operational-actuals";
import { getSettings } from "@/lib/settings";
import { metricsSchemaFor } from "@/lib/delivery-metrics";
import { transitionTask, TransitionError, IllegalTransitionError } from "@/lib/state";
import {
  ACTIVE_CLAIM_STATUSES,
  activeClaimCapRefusal,
  categoryCertificationRefusal,
  highValueRefusal,
  priorRejectionRefusal,
  vaStatusRefusal,
} from "@/lib/worker-eligibility";

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
      /**
       * The eligibility predicates live in `@/lib/worker-eligibility` so the
       * human work unit can apply the IDENTICAL set at submission and at
       * residual publication without a second definition drifting from this
       * one. The reads stay here, inside the compare-and-swap: read them
       * outside and they are advisory, and moving the conditional ones would
       * change the order in which a worker meets a refusal.
       */
      const statusRefusal = vaStatusRefusal(profile?.status);
      if (statusRefusal !== null) throw new Refused(statusRefusal);
      // Unreachable: `vaStatusRefusal` returns null only for status
      // "approved", which an absent row cannot have. Restated so the type
      // checker keeps the narrowing the inline `profile?.status` check gave it.
      if (!profile) throw new Refused("Your account is not currently able to claim tasks.");

      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: {
          tier: true,
          isInternal: true,
          standingCapacityAccountId: true,
          category: { select: { slug: true, name: true } },
        },
      });
      if (!task) throw new Refused("This task is no longer available.");

      /**
       * THE SAME TWO EXCLUSIONS THE POOL QUERY APPLIES, RE-ASSERTED WHERE THE
       * CLAIM ACTUALLY HAPPENS.
       *
       * Filtering the list is a display decision; this is the one that binds.
       * The claim takes a task id from the request, so a task the board never
       * showed is still claimable by anyone who has its id — and both kinds
       * here would be claimed for no pay: an internal task has no worker
       * payout at all (which is exactly why the database payout guard exempts
       * it), and a standing task is paid through its client's weekly block to
       * an assigned specialist, not per task to whoever arrives first.
       *
       * Deliberately NOT extracted into `worker-eligibility.ts`: this is a
       * property of the TASK, not of the worker, and `test/price-wall.test.ts`
       * pins the expression to this file to prove the refusal happens inside
       * the transaction, before the compare-and-swap. The human work unit does
       * not need it — an admitted unit is commercial by construction, because
       * admission already requires a positive `vaPayoutCents`, which is exactly
       * what an internal task lacks.
       */
      if (task.isInternal || task.standingCapacityAccountId !== null) {
        throw new Refused("This task is no longer available.");
      }

      // The certification count stays CONDITIONAL: a worker who passes the exam
      // in another tab can claim immediately, and one who sees a task they
      // cannot take is told which exam opens it instead of watching it silently
      // disappear. Reading it unconditionally would add a query to every claim.
      if (settings.requireCategoryCertification && task.category) {
        const certified = await tx.certification.count({
          where: { userId: user.id, courseSlug: task.category.slug },
        });
        const certificationRefusal = categoryCertificationRefusal({
          requireCategoryCertification: settings.requireCategoryCertification,
          category: task.category,
          certifiedCount: certified,
        });
        if (certificationRefusal !== null) throw new Refused(certificationRefusal);
      }

      const previouslyFailed = await tx.submission.count({
        where: { taskId, vaId: user.id, qcStatus: "rejected" },
      });
      const rejectionRefusal = priorRejectionRefusal(previouslyFailed);
      if (rejectionRefusal !== null) throw new Refused(rejectionRefusal);

      const tierRefusal = highValueRefusal({
        tier: task.tier,
        scoreCache: profile.scoreCache,
        ratedCount: profile.ratedCount,
        highValueThreshold: settings.highValueThreshold,
        minRatedDeliveries: settings.minRatedDeliveries,
      });
      if (tierRefusal !== null) throw new Refused(tierRefusal);

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
          status: { in: [...ACTIVE_CLAIM_STATUSES] },
        },
      });
      const capRefusal = activeClaimCapRefusal({
        activeCount,
        maxActiveClaims: settings.maxActiveClaims,
      });
      if (capRefusal !== null) throw new Refused(capRefusal);

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
  /**
   * Shape-checked INSIDE the transaction against the task's own category, not
   * here: the payload cannot be trusted to name which schema should judge it.
   */
  metrics: z.unknown().optional(),
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
  const { taskId, note, fileIds, metrics } = parsed.data;

  if (fileIds.length === 0 && !note?.trim()) {
    return { ok: false, error: "Attach the finished work, or write your answer in the note." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, claimedById: user.id },
        select: {
          status: true,
          revisionInstructions: true,
          title: true,
          category: { select: { slug: true } },
        },
      });
      if (!task) throw new Refused("Task not found.");
      if (!["claimed", "qc_rejected", "revision_requested"].includes(task.status)) {
        throw new Refused("This task is not open for delivery right now.");
      }
      if (task.status === "revision_requested" && !task.revisionInstructions) {
        throw new Refused("The operator is still preparing the revision instructions.");
      }

      /**
       * R4 — HUMAN TIME INTEGRITY. A job this worker actually performed must
       * leave a durable time record: operational-actuals.ts computes
       * `workerActiveSeconds` from TaskWorkSession rows in phase
       * residual_work/manual_fallback, and treats zero such rows as UNKNOWN
       * (MISSING_WORKER_TIME), not zero — which silently drops human cost
       * out of bookedAndMeteredCostMicros and disqualifies the task from
       * cost/performance calibration.
       *
       * The check is EXISTENCE, not accumulated duration: a session's
       * accumulatedSeconds only updates on pause/resume/stop
       * (src/server/work-sessions.ts), so an active, never-paused session
       * legitimately still reads 0 here. stopAllOpenSessions below finalizes
       * it with the real elapsed seconds right after this transaction
       * commits — this gate only has to prove the worker started a timer at
       * least once; it does not (and must not) infer duration itself, which
       * is exactly the submittedAt-minus-claimedAt shortcut this lot exists
       * to refuse.
       */
      const timedAtLeastOnce = await tx.taskWorkSession.count({
        where: {
          taskId,
          userId: user.id,
          role: "worker",
          phase: { in: ["residual_work", "manual_fallback"] },
        },
      });
      if (timedAtLeastOnce === 0) {
        throw new Refused(
          "Start your timer before delivering — use Start above, do the work, then come back to submit. We need a real record of how long this took."
        );
      }

      /**
       * Delivery metrics, for the two categories that have a shape. Judged
       * against the TASK's category read above, never against whatever
       * category the submitted blob claims to be, so a worker cannot pick the
       * laxer of the two schemas by relabelling their payload.
       *
       * A category with no schema stores nothing, and rejects a payload that
       * tries anyway: silently dropping it would let a worker believe they had
       * reported numbers the client will never see.
       */
      const metricsSchema = metricsSchemaFor(task.category?.slug);
      let deliveryMetrics: Prisma.InputJsonValue | undefined;
      if (metricsSchema) {
        const checked = metricsSchema.safeParse(metrics);
        if (!checked.success) {
          throw new Refused(
            checked.error.issues[0]?.message ?? "Check the delivery numbers and try again."
          );
        }
        deliveryMetrics = checked.data;
      } else if (metrics !== undefined) {
        throw new Refused("This task does not take delivery numbers.");
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
          ...(deliveryMetrics ? { deliveryMetrics } : {}),
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

      // Found missing while auditing the full task lifecycle — the QC
      // queue grew with no push telling the admin it had. Same inline
      // notifyAdmins-shape pattern already used elsewhere in this codebase
      // (stripe.ts, sweeps.ts) rather than importing across modules for
      // four lines.
      const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: "submission_needs_qc",
            title: "Deliverable needs QC",
            body: task.title,
            taskId,
          })),
        });
      }
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

  /**
   * Phase 1C — submission closes the submitter's own open timer, AFTER the
   * transaction: the core uses the global client, and calling it from
   * inside the tx callback held one pool connection while waiting for a
   * second (adversarial finding: N concurrent submits ≥ pool size = mutual
   * stall). Post-commit ordering is also the honest one — a rolled-back
   * submission must not have closed anything.
   */
  await stopAllOpenSessions(taskId, user.id, new Date());
  after(() => recomputeOperationalIntelligence(taskId, "deliverable_submitted"));
  revalidatePath("/va");
  revalidatePath(`/va/tasks/${taskId}`);
  revalidatePath("/admin/qc");
  // The reviewer's own detail page now carries the delivery numbers, so a
  // re-delivery has to invalidate it too, not just the queue listing.
  revalidatePath(`/admin/qc/${taskId}`);
  return { ok: true };
}
