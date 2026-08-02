"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addHours } from "date-fns";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError, IllegalTransitionError } from "@/lib/state";
import { upsertClosedJobLog } from "@/lib/closed-job-log";

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
  /**
   * RULE 1's last gate. The pricing side has carried an unconditional
   * attestation from the start (`filesVerified` in approvePricing, admin.ts)
   * — that is the client→worker direction. This is the worker→client
   * direction, and it had none: the schema accepted only a submissionId and a
   * rating, so a deliverable could be approved from the keyboard alone (1-5
   * then Ctrl+Enter) without a single file being opened.
   *
   * That asymmetry mattered more than the pricing one, because the worker has
   * a direct economic motive to break the wall: a .docx signed "contact me
   * directly, 40% cheaper" reaches the client the moment it is approved.
   * Metadata scrubbing (file-security.ts) cannot catch it — it strips
   * document properties, never the visible content of the delivery.
   */
  identityVerified: z.boolean(),
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

  // Unconditional, exactly like approvePricing's: a delivery with no files
  // still carries a free-text note that reaches the client verbatim.
  if (!parsed.data.identityVerified) {
    return {
      ok: false,
      error:
        "Confirm you opened the delivery and checked it for the worker's name, contacts or any invitation to work directly before releasing it.",
    };
  }

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
          task: {
            select: {
              firstCompletedAt: true,
              clientId: true,
              vaPayoutCents: true,
              currency: true,
              standingCapacityAccountId: true,
            },
          },
        },
      });
      const isFirstCompletion = submission.task.firstCompletedAt === null;
      // A Standing Capacity task was never priced per task — the block's
      // weekly price already covers it, and the worker is paid once per
      // period (recordWorkerPeriodPayout), not once per task. Everything
      // below this guard is the one-off flow's own money obligation and
      // must not run for a task that was never billed that way.
      const isStandingCapacityTask = submission.task.standingCapacityAccountId !== null;
      if (
        !isStandingCapacityTask &&
        (submission.task.vaPayoutCents == null || submission.task.vaPayoutCents <= 0)
      ) {
        throw new Error("Approved task has no worker payout.");
      }

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
          // Escrow: nothing is captured or released yet — see the payout
          // block below, which now only records what's owed. The sweep
          // (releaseDisputeWindowFunds, sweeps.ts) does the actual release
          // once this closes with no dispute.
          disputeWindowEndsAt: addHours(now, settings.disputeWindowHours),
          windowPausedAt: null,
        },
      });

      // Closed Job Log — advisory-only foundation, see the doc comment on
      // ClosedJobLog in schema.prisma. Skipped for Standing Capacity: those
      // tasks are never priced individually (clientPriceCents/vaPayoutCents
      // are null), so "won this job for this margin" doesn't apply the same
      // way to a task drawn down from a recurring block.
      if (!isStandingCapacityTask) {
        await upsertClosedJobLog(tx, submission.taskId, { outcome: "won" });
      }

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

      // A completed task can never exist without a payout row — but the
      // money doesn't move yet. QC approval used to be the moment both the
      // worker's payout released and the client's card got captured; it is
      // now only the moment the amount owed is recorded. The actual release
      // (release_payout + capture_client_payment, via releaseHeldFunds in
      // src/lib/escrow.ts) waits for disputeWindowEndsAt to close with no
      // dispute — see releaseDisputeWindowFunds in sweeps.ts — or for
      // decideDispute's "rejected" outcome if the client did dispute and lost.
      // A Standing Capacity task skips this whole block — see
      // isStandingCapacityTask's own comment above — the worker is paid once
      // per period instead (recordWorkerPeriodPayout).
      if (!isStandingCapacityTask) {
        const existingPayout = await tx.payout.findUnique({
          where: {
            taskId_vaId: { taskId: submission.taskId, vaId: submission.vaId },
          },
          select: { id: true, status: true },
        });
        if (!existingPayout) {
          await tx.payout.create({
            data: {
              taskId: submission.taskId,
              vaId: submission.vaId,
              amountCents: submission.task.vaPayoutCents!,
              currency: submission.task.currency,
              status: "owed",
            },
          });
        } else if (existingPayout.status !== "paid") {
          await tx.payout.update({
            where: { id: existingPayout.id },
            data: {
              amountCents: submission.task.vaPayoutCents!,
              currency: submission.task.currency,
              status: "owed",
              releasedAt: null,
            },
          });
        }
      }
      await tx.notification.createMany({
        data: [
          {
            userId: submission.task.clientId,
            type: "delivery_approved",
            title: "Your reviewed delivery is ready",
            body: "Download it from the task page. Your review window starts now.",
            taskId: submission.taskId,
          },
          {
            userId: submission.vaId,
            type: "delivery_approved",
            title: "Delivery approved",
            body: isStandingCapacityTask
              ? "This delivery passed review."
              : `Your payout will release in ${settings.disputeWindowHours}h if the client raises no dispute.`,
            taskId: submission.taskId,
          },
        ],
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

      /**
       * The floor for workers the rolling score cannot describe.
       *
       * suspensionFloor (approveDeliverable, above) only ever fires when
       * scoreCache is non-null, and scoreCache is computed exclusively from
       * APPROVED submissions. A worker whose work is never approved keeps a
       * null score forever, so that check could not reach them — and this
       * branch only incremented a counter nobody acted on. The result was
       * that the single worst pattern on the platform went unpoliced: claim
       * up to maxActiveClaims, deliver nothing usable, get rejected, watch
       * the task repool, claim again. Repeatable indefinitely, and every
       * cycle spends a real client's deadline.
       *
       * Counted CONSECUTIVELY — rejections since the worker's last approved
       * submission, not lifetime — so a strong worker with one bad week is
       * not carried toward suspension by history they have already made up
       * for. lifetime qcRejections stays as the operator's own signal.
       */
      const lastApproval = await tx.submission.findFirst({
        where: { vaId: submission.vaId, qcStatus: "approved" },
        orderBy: { reviewedAt: "desc" },
        select: { reviewedAt: true },
      });
      const consecutiveRejections = await tx.submission.count({
        where: {
          vaId: submission.vaId,
          qcStatus: "rejected",
          ...(lastApproval?.reviewedAt ? { reviewedAt: { gt: lastApproval.reviewedAt } } : {}),
        },
      });
      const tooManyRejections = consecutiveRejections >= settings.maxConsecutiveQcRejections;

      await tx.vaProfile.update({
        where: { userId: submission.vaId },
        data: {
          qcRejections: { increment: 1 },
          ...(tooManyRejections
            ? {
                status: "suspended" as const,
                suspendedAt: new Date(),
                suspensionReason: `${consecutiveRejections} deliveries rejected in a row with none approved in between.`,
              }
            : {}),
        },
      });

      if (tooManyRejections) {
        // Manual suspension revokes sessions and tells the worker
        // (suspendVa, admin-va.ts). An automatic one that did neither would
        // strand someone outside the pool with no idea why — and leave them
        // holding a live session against a suspended account.
        await tx.session.deleteMany({ where: { userId: submission.vaId } });
        await tx.notification.create({
          data: {
            userId: submission.vaId,
            type: "account_suspended",
            title: "Your account is on hold",
            body: `${consecutiveRejections} deliveries were sent back without one being approved. Reply to support to talk it through and get back in the pool.`,
          },
        });
      }
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
