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
  if (!parsed.success) return { ok: false, error: "Invalid form data." };
  const { taskId, tier, filesVerified } = parsed.data;

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
    select: {
      clientDeadlineUtc: true,
      _count: { select: { files: { where: { kind: "input", purgedAt: null } } } },
    },
  });
  if (!task) return { ok: false, error: "Task not found." };

  // B3 decision: the admin pricing step doubles as the content gate on client
  // files — verification is mandatory before anything becomes VA-visible.
  if (task._count.files > 0 && !filesVerified) {
    return {
      ok: false,
      error: "Confirm you opened the client files and checked them (contact info, unexpected content) before quoting.",
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
        filesVerified: true,
        quotedAt: now,
        quoteExpiresAt,
        vaDeadlineUtc,
      },
      meta: { clientPriceCents, vaPayoutCents, tier },
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
