"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { addHours } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole, consumeRateLimit } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";
import { expireStaleQuotes } from "@/server/sweeps";
import { computeAiPricingSuggestion } from "@/lib/pricing-ai";
import { createOperationalBaseline } from "@/server/operational-baseline";
import {
  recomputeOpenRepeatWindowsForClient,
  recomputeOperationalIntelligence,
} from "@/server/operational-actuals";
import { buildAcceptanceSnapshot } from "@/lib/ai-work-engine/client-scope";
import { upsertClosedJobLog } from "@/lib/closed-job-log";

const submitTaskSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(10).max(20000),
  quantity: z.string().trim().max(500).optional(),
  // Local wall-clock from <input type="datetime-local"> + the browser's IANA tz.
  deadlineLocal: z.string().optional(),
  timezone: z.string().max(64).optional(),
  fileIds: z.array(z.string()).max(50).default([]),
});

export type SubmitTaskResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string };

// Per user per hour — each submission unconditionally triggers a real
// Anthropic + Voyage pricing call (computeAiPricingSuggestion below), so an
// unbounded loop here is an unbounded API bill, not just noise.
const SUBMIT_TASK_RATE = { window: 3600, max: 20 };

export async function submitTask(input: unknown): Promise<SubmitTaskResult> {
  const user = await requireRole("CLIENT");
  const allowed = await consumeRateLimit(`task:submit:${user.id}`, SUBMIT_TASK_RATE);
  if (!allowed) {
    return { ok: false, error: "Too many tasks submitted recently. Try again in a while." };
  }
  const parsed = submitTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please provide a title (3+ chars) and a description (10+ chars)." };
  }
  const { title, description, quantity, deadlineLocal, timezone, fileIds } = parsed.data;
  const settings = await getSettings();

  if (fileIds.length > settings.maxFilesPerTask) {
    return { ok: false, error: `At most ${settings.maxFilesPerTask} files per task.` };
  }

  let clientDeadlineUtc: Date | null = null;
  if (deadlineLocal && deadlineLocal.length > 0) {
    if (!timezone) return { ok: false, error: "Missing timezone for the deadline." };
    try {
      clientDeadlineUtc = fromZonedTime(deadlineLocal, timezone);
    } catch {
      return { ok: false, error: "Invalid deadline." };
    }
    if (!(clientDeadlineUtc instanceof Date) || isNaN(clientDeadlineUtc.getTime())) {
      return { ok: false, error: "Invalid deadline." };
    }
    if (clientDeadlineUtc.getTime() <= Date.now()) {
      return { ok: false, error: "The deadline must be in the future." };
    }
  }

  try {
    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          clientId: user.id,
          title,
          description,
          quantity: quantity || null,
          status: "submitted",
          clientDeadlineUtc,
        },
      });

      if (fileIds.length > 0) {
        // Claim uploaded files: must belong to this uploader and be unattached.
        const claimed = await tx.file.updateMany({
          where: {
            id: { in: fileIds },
            uploaderId: user.id,
            taskId: null,
            kind: "input",
            scanStatus: "clean",
          },
          data: { taskId: created.id },
        });
        if (claimed.count !== fileIds.length) {
          throw new Error("file-claim-mismatch");
        }
      }

      await tx.taskEvent.create({
        data: {
          taskId: created.id,
          toStatus: "submitted",
          action: "client_submitted",
          actorId: user.id,
          meta: { files: fileIds.length },
        },
      });

      // Every task lands in the manual pricing queue regardless of what the
      // AI computes — see computeAiPricingSuggestion's RULE 3 note. This
      // transition happens NOW, synchronously, so a task is never stuck in
      // `submitted` waiting on an external API call that might be slow, or
      // that might fail outright (embeddingsEnabled/aiEnabled false, or a
      // transient Anthropic/Voyage error).
      await tx.task.update({ where: { id: created.id }, data: { status: "pricing_review" } });
      await tx.taskEvent.create({
        data: {
          taskId: created.id,
          fromStatus: "submitted",
          toStatus: "pricing_review",
          action: "entered_pricing_queue",
        },
      });

      return created;
    });

    // Runs AFTER the response is sent (Next's after()), not inside the
    // transaction above: an Anthropic + Voyage round trip is seconds, and
    // holding a DB transaction open for that long risks lock contention
    // for no reason — the suggestion is an enhancement to an already-queued
    // task, not a precondition for queuing it. A client who submits and
    // immediately opens the admin's own view (unlikely, but not
    // impossible) sees "not computed yet" for a few seconds, never a
    // blocked or failed submission.
    after(() => computeAiPricingSuggestion(task.id));

    revalidatePath("/client");
    revalidatePath("/admin/pricing");
    return { ok: true, taskId: task.id };
  } catch (e) {
    if (e instanceof Error && e.message === "file-claim-mismatch") {
      return { ok: false, error: "One of the uploaded files could not be attached. Re-upload and try again." };
    }
    throw e;
  }
}

export type QuoteActionResult = { ok: true } | { ok: false; error: string };

export async function acceptQuote(taskId: string): Promise<QuoteActionResult> {
  const user = await requireRole("CLIENT");
  const owned = await prisma.task.findFirst({
    where: { id: taskId, clientId: user.id },
    select: { id: true, isInternal: true },
  });
  if (!owned) return { ok: false, error: "Task not found." };

  await expireStaleQuotes(taskId);

  try {
    const now = new Date();
    const settings = await getSettings();
    /**
     * One transaction for the acceptance AND its contract record. The
     * TaskAcceptanceSnapshot is the immutable copy of everything the client
     * saw at this exact moment — price, scope, quantity, deliverable,
     * assumptions, exclusions, the dispute standard, and the correction
     * windows IN FORCE RIGHT NOW (the admin can change settings later; the
     * client's contract must not move with them). Splitting these writes
     * would allow an accepted task with no contract on record, which is the
     * one state this feature exists to make impossible. The row itself is
     * UPDATE/DELETE-protected by a Postgres trigger, same mechanism as the
     * ledger.
     */
    await prisma.$transaction(async (tx) => {
      await transitionTask({
        tx,
        taskId,
        from: "quoted",
        to: owned.isInternal ? "open" : "awaiting_payment",
        action: "client_accepted_quote",
        actorId: user.id,
        // Time bound inside the compare-and-swap: a quote that expires between
        // the sweep and this write cannot be accepted by a racing request.
        guard: { OR: [{ quoteExpiresAt: null }, { quoteExpiresAt: { gt: new Date() } }] },
        data: {
          acceptedAt: now,
          paymentDueAt: owned.isInternal ? null : addHours(now, settings.paymentWindowHours),
        },
        meta: { paymentRequired: !owned.isInternal },
      });

      const accepted = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        select: {
          title: true,
          description: true,
          quantity: true,
          clientPriceCents: true,
          currency: true,
          clientDeadlineUtc: true,
          quotedPlanVersionId: true,
          category: { select: { disputeCriteria: true } },
          quotedPlanVersion: {
            select: {
              deliverableDescription: true,
              assumptions: true,
              exclusions: true,
              // Frozen economics, copied onto the contract verbatim.
              expectedAutomationCostMicros: true,
              conservativeAutomationCostMicros: true,
              automationSpendCeilingMicros: true,
              automationCostPolicyVersion: true,
              // 1E-alpha: the execution data class, frozen with the rest.
              dataClass: true,
            },
          },
        },
      });
      // Defensive: quoted -> accepted implies a price exists; if it somehow
      // does not, refuse the acceptance rather than record a priceless
      // contract. The transaction rolls the transition back too.
      if (accepted.clientPriceCents === null) {
        throw new TransitionError("accepted a task with no price");
      }

      const snapshot = await tx.taskAcceptanceSnapshot.create({
        data: buildAcceptanceSnapshot({
          taskId,
          acceptedByUserId: user.id,
          task: { ...accepted, clientPriceCents: accepted.clientPriceCents },
          quotedPlanVersion: accepted.quotedPlanVersion,
          settings: {
            revisionWindowHours: settings.revisionWindowHours,
            maxRevisionRounds: settings.maxRevisionRounds,
            disputeWindowHours: settings.disputeWindowHours,
          },
        }),
        select: { id: true },
      });

      /**
       * 1E-alpha: FREEZE THE BYTES, IN THIS TRANSACTION.
       *
       * An ingestion step reads a client attachment. Without this, a
       * re-upload between acceptance and execution would run the mandate on
       * content nobody quoted, and a replay after a crash (steps are re-run in
       * full under a lease) could produce a different answer than the first
       * attempt. Both are unacceptable, so the identity AND the content hash
       * are pinned at the same instant as the price.
       *
       * Only files that have PASSED the scanner and have a computed hash are
       * eligible. A file that is still pending, that was rejected, or whose
       * sha256 was never computed is simply not frozen — and a capability that
       * cannot find its file in the frozen set hands the mandate to a person.
       * That is the intended outcome: an unverified attachment must not become
       * an input the machine reads on the client's behalf.
       */
      const eligibleFiles = await tx.file.findMany({
        where: {
          taskId,
          kind: "input",
          scanStatus: "clean",
          sha256: { not: null },
          purgedAt: null,
        },
        select: { id: true, sha256: true, fileName: true, sizeBytes: true },
        orderBy: { createdAt: "asc" },
      });
      if (eligibleFiles.length > 0) {
        await tx.taskAcceptanceSnapshotFile.createMany({
          data: eligibleFiles.map((f) => ({
            snapshotId: snapshot.id,
            fileId: f.id,
            // Non-null by the query above; asserted rather than defaulted,
            // because a hash of "" would be a hash that always mismatches.
            sha256: f.sha256 as string,
            fileName: f.fileName,
            sizeBytes: f.sizeBytes,
          })),
        });
      }

      /**
       * Phase 1C: the internal baseline, in the SAME transaction as the
       * contract. Acceptance is the last instant Task.estimatedMinutes and
       * vaPayoutCents still carry the QUOTED values (finishRun overwrites
       * both at handover), and a contract without its baseline would make
       * every future estimated-vs-actual comparison unreconstructable.
       */
      await createOperationalBaseline(tx, { taskId, acceptedAt: now });
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This quote is no longer available — it may have expired." };
    }
    throw e;
  }

  // Phase 1C — this acceptance may flip an earlier task's open repeat
  // window to true, and this task's own actual can now exist (its baseline
  // just did). Both run off the request path.
  after(() => recomputeOpenRepeatWindowsForClient(user.id));
  after(() => recomputeOperationalIntelligence(taskId, "quote_accepted"));

  revalidatePath(`/client/tasks/${taskId}`);
  revalidatePath("/client");
  return { ok: true };
}

const declineReasonSchema = z.string().trim().max(4000).optional();

export async function declineQuote(taskId: string, reason?: string): Promise<QuoteActionResult> {
  const user = await requireRole("CLIENT");
  const parsedReason = declineReasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    return { ok: false, error: "That reason is too long — keep it under 4,000 characters." };
  }
  const cleanReason = parsedReason.data || undefined;
  const owned = await prisma.task.findFirst({
    where: { id: taskId, clientId: user.id },
    select: { id: true, isInternal: true },
  });
  if (!owned) return { ok: false, error: "Task not found." };

  await expireStaleQuotes(taskId);

  try {
    await transitionTask({
      taskId,
      from: "quoted",
      to: "declined",
      action: "client_declined_quote",
      actorId: user.id,
      reason: cleanReason,
      data: { declinedAt: new Date(), declineReason: cleanReason || null },
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This quote is no longer available — it may have expired." };
    }
    throw e;
  }

  if (!owned.isInternal) {
    await upsertClosedJobLog(prisma, taskId, {
      outcome: "lost",
      lostReasonCategory: "price_declined",
      lostReasonDetail: cleanReason || null,
    });
  }

  revalidatePath(`/client/tasks/${taskId}`);
  revalidatePath("/client");
  return { ok: true };
}

const revisionSchema = z.object({
  taskId: z.string().min(1).max(100),
  detail: z.string().trim().min(10).max(4000),
});

async function pauseUnpaidPayout(
  tx: Prisma.TransactionClient,
  taskId: string,
  reason: string
) {
  await tx.payout.updateMany({
    where: { taskId, status: "released" },
    data: { status: "owed", releasedAt: null, note: reason },
  });
  await tx.moneyIntent.updateMany({
    where: { taskId, kind: "release_payout", status: { in: ["queued", "processing"] } },
    data: { status: "failed", lastError: reason },
  });
}

export async function requestRevision(input: unknown): Promise<QuoteActionResult> {
  const user = await requireRole("CLIENT");
  const parsed = revisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Describe the exact change needed (10–4,000 characters)." };
  }
  const settings = await getSettings();
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: parsed.data.taskId, clientId: user.id },
        select: {
          id: true,
          status: true,
          revisionRounds: true,
          revisionWindowEndsAt: true,
        },
      });
      if (
        !task ||
        task.status !== "completed" ||
        !task.revisionWindowEndsAt ||
        task.revisionWindowEndsAt <= now
      ) {
        throw new TransitionError("revision-window-closed");
      }
      if (task.revisionRounds >= settings.maxRevisionRounds) {
        throw new TransitionError("revision-limit");
      }

      await transitionTask({
        tx,
        taskId: task.id,
        from: "completed",
        to: "revision_requested",
        action: "client_requested_revision",
        actorId: user.id,
        reason: parsed.data.detail,
        guard: { revisionWindowEndsAt: { gt: now } },
        data: {
          revisionRounds: { increment: 1 },
          windowPausedAt: now,
          revisionInstructions: null,
        },
        meta: { round: task.revisionRounds + 1, pendingOperatorSummary: true },
      });
      await pauseUnpaidPayout(tx, task.id, "Paused while a client revision is reviewed.");
      const admins = await tx.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: "revision_requested",
            title: "Client revision needs an identity-safe summary",
            body: "Review the client's note before releasing instructions to the worker.",
            taskId: task.id,
          })),
        });
      }
    });
  } catch (error) {
    if (error instanceof TransitionError) {
      return {
        ok: false,
        error:
          error.message === "revision-limit"
            ? "The included revision rounds have been used. Open a dispute if the written delivery standard was missed."
            : "The review window has closed or this task has already moved on.",
      };
    }
    throw error;
  }

  after(() => recomputeOperationalIntelligence(parsed.data.taskId, "client_revision_requested"));
  revalidatePath(`/client/tasks/${parsed.data.taskId}`);
  revalidatePath("/client");
  revalidatePath("/admin");
  return { ok: true };
}

const disputeSchema = z.object({
  taskId: z.string().min(1).max(100),
  reasonCode: z.enum([
    "missing_work",
    "incorrect_output",
    "format_not_followed",
    "fabricated_or_unverifiable",
  ]),
  detail: z.string().trim().min(20).max(4000),
});

export async function openDispute(input: unknown): Promise<QuoteActionResult> {
  const user = await requireRole("CLIENT");
  const parsed = disputeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Choose a standard and describe the problem in detail." };
  }
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: parsed.data.taskId, clientId: user.id },
        select: { id: true, status: true, revisionWindowEndsAt: true },
      });
      if (
        !task ||
        task.status !== "completed" ||
        !task.revisionWindowEndsAt ||
        task.revisionWindowEndsAt <= now
      ) {
        throw new TransitionError("dispute-window-closed");
      }
      await tx.dispute.create({
        data: {
          taskId: task.id,
          reasonCode: parsed.data.reasonCode,
          reasonDetail: parsed.data.detail,
        },
      });
      await transitionTask({
        tx,
        taskId: task.id,
        from: "completed",
        to: "disputed",
        action: "client_opened_dispute",
        actorId: user.id,
        guard: { revisionWindowEndsAt: { gt: now } },
        data: { windowPausedAt: now, revisionInstructions: null },
        meta: { reasonCode: parsed.data.reasonCode },
      });
      await pauseUnpaidPayout(tx, task.id, "Paused while a client dispute is decided.");
      const admins = await tx.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: "dispute_opened",
            title: "Client dispute requires a decision",
            body: "Judge it against the task category's written delivery standard.",
            taskId: task.id,
          })),
        });
      }
    });
  } catch (error) {
    if (error instanceof TransitionError) {
      return { ok: false, error: "The review window has closed or this task has moved on." };
    }
    if (error instanceof Error && error.message.toLowerCase().includes("unique constraint")) {
      return { ok: false, error: "A dispute is already open for this task." };
    }
    throw error;
  }

  after(() => recomputeOperationalIntelligence(parsed.data.taskId, "dispute_opened"));
  revalidatePath(`/client/tasks/${parsed.data.taskId}`);
  revalidatePath("/client");
  revalidatePath("/admin");
  return { ok: true };
}
