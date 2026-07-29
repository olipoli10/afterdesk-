"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";
import { expireStaleQuotes } from "@/server/sweeps";

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

export async function submitTask(input: unknown): Promise<SubmitTaskResult> {
  const user = await requireRole("CLIENT");
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

      // AI pricing arrives at build step 4 — until then tasks go straight to
      // the manual pricing queue so nothing is ever stuck in `submitted`.
      // (submitted → pricing_review is in ALLOWED_TRANSITIONS.)
      await tx.task.update({ where: { id: created.id }, data: { status: "pricing_review" } });
      await tx.taskEvent.create({
        data: {
          taskId: created.id,
          fromStatus: "submitted",
          toStatus: "pricing_review",
          action: "ai_pricing_skipped",
        },
      });

      return created;
    });

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
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "Task not found." };

  await expireStaleQuotes(taskId);

  try {
    await transitionTask({
      taskId,
      from: "quoted",
      to: "open",
      action: "client_accepted_quote",
      actorId: user.id,
      // Time bound inside the compare-and-swap: a quote that expires between
      // the sweep and this write cannot be accepted by a racing request.
      guard: { OR: [{ quoteExpiresAt: null }, { quoteExpiresAt: { gt: new Date() } }] },
      data: { acceptedAt: new Date() },
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This quote is no longer available — it may have expired." };
    }
    throw e;
  }

  revalidatePath(`/client/tasks/${taskId}`);
  revalidatePath("/client");
  return { ok: true };
}

export async function declineQuote(taskId: string, reason?: string): Promise<QuoteActionResult> {
  const user = await requireRole("CLIENT");
  const owned = await prisma.task.findFirst({
    where: { id: taskId, clientId: user.id },
    select: { id: true },
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
      reason: reason?.trim() || undefined,
      data: { declinedAt: new Date(), declineReason: reason?.trim() || null },
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This quote is no longer available — it may have expired." };
    }
    throw e;
  }

  revalidatePath(`/client/tasks/${taskId}`);
  revalidatePath("/client");
  return { ok: true };
}
