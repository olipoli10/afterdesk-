"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addHours } from "date-fns";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { parseMoneyToCents } from "@/lib/money";
import { computeVaDeadline } from "@/lib/schedule";
import { NON_TERMINAL_STATUSES } from "@/lib/status";
import { transitionTask, TransitionError } from "@/lib/state";
import { nextInPricingQueue } from "@/lib/queries/tasks";

const approveSchema = z.object({
  taskId: z.string(),
  clientPrice: z.string().trim().min(1),
  vaPayout: z.string().trim().min(1),
  tier: z.enum(["standard", "high_value"]),
  filesVerified: z.boolean(),
  // Required before a quote goes out: the category drives the dispute criteria
  // the worker is judged against and the per-category medians; the estimate
  // is what makes "is this payout fair" answerable.
  categoryId: z.string().min(1),
  estimatedMinutes: z.coerce.number().int().min(1).max(100000),
});

export type ApproveResult =
  | { ok: true; nextId: string | null }
  | { ok: false; error: string };

/**
 * Admin sets the two independent numbers (RULE 2) and releases the quote
 * (RULE 3 — nothing reaches the client before this).
 */
export async function approvePricing(input: unknown): Promise<ApproveResult> {
  const admin = await requireRole("ADMIN");
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    const missingCategory = parsed.error.issues.some((i) => i.path[0] === "categoryId");
    return {
      ok: false,
      error: missingCategory
        ? "Pick a category and an estimate — both are needed before a quote goes out."
        : "Invalid form data.",
    };
  }
  const { taskId, tier, filesVerified, categoryId, estimatedMinutes } = parsed.data;

  let clientPriceCents: number;
  let vaPayoutCents: number;
  try {
    clientPriceCents = parseMoneyToCents(parsed.data.clientPrice);
    vaPayoutCents = parseMoneyToCents(parsed.data.vaPayout);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount." };
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { clientDeadlineUtc: true },
  });
  if (!task) return { ok: false, error: "Task not found." };

  // The admin pricing step is the content gate on everything the client wrote
  // (description and quantity are VA-visible verbatim) and everything they
  // uploaded. The attestation is unconditional — a task with no files still
  // carries a free-text description that can name the client.
  if (!filesVerified) {
    return {
      ok: false,
      error:
        "Confirm you reviewed the description, quantity and any files for contact info or identifying details before quoting.",
    };
  }

  const settings = await getSettings();
  const now = new Date();
  const quoteExpiresAt = addHours(now, settings.quoteValidityHours);
  const vaDeadlineUtc = task.clientDeadlineUtc
    ? computeVaDeadline(task.clientDeadlineUtc, settings)
    : null;

  try {
    await transitionTask({
      taskId,
      from: ["submitted", "pricing_review"],
      to: "quoted",
      action: "admin_quoted",
      actorId: admin.id,
      data: {
        clientPriceCents,
        vaPayoutCents,
        tier,
        categoryId,
        estimatedMinutes,
        filesVerified: true,
        quotedAt: now,
        quoteExpiresAt,
        vaDeadlineUtc,
      },
      // RULE 2: never persist raw prices in TaskEvent.meta — the authoritative
      // values live on the Task row behind the role-shaped selects, and meta
      // has no role-shaping of its own.
      meta: { tier, priced: true },
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task already left the pricing queue." };
    }
    throw e;
  }

  revalidatePath("/admin/pricing");
  revalidatePath("/admin");
  const nextId = await nextInPricingQueue(taskId);
  return { ok: true, nextId };
}

const reassignSchema = z.object({
  taskId: z.string(),
  reason: z.string().trim().min(3).max(2000),
});

/**
 * Pulls a task out of a worker's hands and back into the pool. Without this,
 * a suspended or unresponsive worker's in-flight tasks are frozen: they cannot
 * deliver (the pool gate blocks them) and nobody else can pick it up.
 *
 * QC rounds reset, because the next worker starts fresh.
 */
export async function reassignTask(input: unknown): Promise<CancelResult> {
  const admin = await requireRole("ADMIN");
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A reason is required to reassign." };

  try {
    await transitionTask({
      taskId: parsed.data.taskId,
      from: ["claimed", "qc_rejected", "submitted_for_qc", "revision_requested"],
      to: "open",
      action: "admin_reassigned",
      actorId: admin.id,
      reason: parsed.data.reason,
      data: { claimedById: null, claimedAt: null, qcRounds: 0 },
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task is not currently assigned to anyone." };
    }
    throw e;
  }

  revalidatePath("/admin/tasks");
  revalidatePath("/admin/workers");
  return { ok: true };
}

const cancelSchema = z.object({
  taskId: z.string(),
  reason: z.string().trim().min(3).max(2000),
});

export type CancelResult = { ok: true } | { ok: false; error: string };

/** Admin override — allowed from any non-terminal state, reason mandatory. */
export async function cancelTask(input: unknown): Promise<CancelResult> {
  const admin = await requireRole("ADMIN");
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A cancellation reason is required." };
  const { taskId, reason } = parsed.data;

  try {
    await transitionTask({
      taskId,
      from: NON_TERMINAL_STATUSES,
      to: "cancelled",
      action: "admin_cancelled",
      actorId: admin.id,
      reason,
      data: { cancelledAt: new Date(), cancelReason: reason },
    });
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, error: "This task is already in a terminal state." };
    }
    throw e;
  }

  revalidatePath("/admin/pricing");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  return { ok: true };
}
