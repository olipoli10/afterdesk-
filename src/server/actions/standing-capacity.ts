"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, requireApprovedVa } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";
import { insertLedgerEntry } from "@/lib/ledger";
import { logAdminEvent } from "@/lib/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Reads the currently-active assignment for an account, inside a transaction
 * or not — the one place that answers "who does this account's work right
 * now". `activeTo: null` is the whole definition of "current"; reassigning
 * elsewhere always closes the prior row in the same transaction as opening
 * the new one, so at most one row per account can ever match this.
 */
async function currentAssignee(
  db: typeof prisma,
  accountId: string
): Promise<{ workerId: string } | null> {
  return db.standingCapacityAssignment.findFirst({
    where: { accountId, activeTo: null },
    select: { workerId: true },
    orderBy: { activeFrom: "desc" },
  });
}

// ---------------------------------------------------------------- ADMIN ---

const createAccountSchema = z.object({
  clientId: z.string().min(1).max(100),
  tierHours: z.number().int().positive(),
});

/**
 * Opens a client's Standing Capacity account. Price is snapshotted from the
 * matching tier in Settings at this exact moment — see the type's own doc
 * comment on why it is never a live lookup afterward.
 */
export async function createStandingCapacityAccount(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a client and a tier." };

  const settings = await getSettings();
  const tier = settings.standingCapacityTiers.find((t) => t.hours === parsed.data.tierHours);
  if (!tier) return { ok: false, error: "That capacity tier no longer exists." };

  const client = await prisma.user.findUnique({
    where: { id: parsed.data.clientId },
    select: { id: true, role: true },
  });
  if (!client || client.role !== "CLIENT") return { ok: false, error: "Client not found." };

  const existing = await prisma.standingCapacityAccount.findUnique({
    where: { clientId: client.id },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "This client already has a standing capacity account." };

  const now = new Date();
  const account = await prisma.standingCapacityAccount.create({
    data: {
      clientId: client.id,
      tierHours: tier.hours,
      weeklyClientPriceCents: tier.weeklyClientPriceCents,
      weeklyVaPayoutCents: tier.weeklyVaPayoutCents,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + WEEK_MS),
    },
  });
  await logAdminEvent({
    actorId: admin.id,
    entity: "StandingCapacityAccount",
    entityId: account.id,
    action: "account_opened",
    after: { tierHours: tier.hours },
  });
  await prisma.notification.create({
    data: {
      userId: client.id,
      type: "standing_capacity_opened",
      title: "Your standing capacity is active",
      body: `Your ${tier.hours}h/week block is ready. Submit tasks from My standing capacity.`,
    },
  });

  revalidatePath("/admin/standing-capacity");
  return { ok: true };
}

const assignWorkerSchema = z.object({
  accountId: z.string().min(1).max(100),
  workerId: z.string().min(1).max(100),
});

/**
 * Reassignment, not just first assignment: closes whichever row currently
 * has activeTo: null (if any) and opens a new one, in the same transaction.
 * Any task still sitting in `submitted` on this account (no one was
 * assigned yet, or the prior assignee never got to it) routes to the new
 * worker immediately — see routePendingTasks below. A task already
 * `claimed` by the outgoing worker is left alone: they finish what they
 * have, only new work moves, so the client never sees a gap.
 */
export async function assignWorker(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = assignWorkerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose an account and a worker." };

  const [account, worker] = await Promise.all([
    prisma.standingCapacityAccount.findUnique({
      where: { id: parsed.data.accountId },
      select: { id: true, status: true },
    }),
    prisma.user.findUnique({
      where: { id: parsed.data.workerId },
      select: { id: true, role: true, vaProfile: { select: { status: true } } },
    }),
  ]);
  if (!account) return { ok: false, error: "Account not found." };
  if (account.status !== "active") return { ok: false, error: "This account is not active." };
  if (!worker || worker.role !== "VA" || worker.vaProfile?.status !== "approved") {
    return { ok: false, error: "Choose an approved worker." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.standingCapacityAssignment.updateMany({
      where: { accountId: account.id, activeTo: null },
      data: { activeTo: new Date() },
    });
    await tx.standingCapacityAssignment.create({
      data: { accountId: account.id, workerId: worker.id, assignedById: admin.id },
    });

    const pending = await tx.task.findMany({
      where: { standingCapacityAccountId: account.id, status: "submitted" },
      select: { id: true },
    });
    for (const task of pending) {
      await transitionTask({
        tx,
        taskId: task.id,
        from: "submitted",
        to: "claimed",
        action: "standing_capacity_routed",
        actorId: admin.id,
        data: { claimedById: worker.id, claimedAt: new Date() },
      });
    }
  });

  await logAdminEvent({
    actorId: admin.id,
    entity: "StandingCapacityAccount",
    entityId: account.id,
    action: "worker_assigned",
    after: { workerId: worker.id },
  });

  revalidatePath("/admin/standing-capacity");
  revalidatePath("/va");
  return { ok: true };
}

const recordPeriodPaymentSchema = z.object({
  accountId: z.string().min(1).max(100),
  reference: z.string().trim().min(3).max(200),
});

/**
 * Admin-attested payment for the account's CURRENT period — mirrors
 * recordManualPayment in admin-payments.ts exactly, applied to a block
 * instead of a task. Real Stripe checkout for whole blocks is future work;
 * Stripe has no live keys configured anywhere in this app yet.
 */
export async function recordPeriodPayment(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = recordPeriodPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the bank or invoice reference." };

  const account = await prisma.standingCapacityAccount.findUnique({
    where: { id: parsed.data.accountId },
    select: {
      id: true,
      status: true,
      clientId: true,
      currency: true,
      isInternal: true,
      weeklyClientPriceCents: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  });
  if (!account) return { ok: false, error: "Account not found." };
  if (account.status !== "active") return { ok: false, error: "This account is not active." };

  await prisma.$transaction(async (tx) => {
    const payment = await tx.standingCapacityPayment.create({
      data: {
        accountId: account.id,
        periodStart: account.currentPeriodStart,
        periodEnd: account.currentPeriodEnd,
        amountCents: account.weeklyClientPriceCents,
        currency: account.currency,
        method: "wire",
        reference: parsed.data.reference,
        recordedById: admin.id,
      },
    });
    await insertLedgerEntry(tx, {
      kind: "sale",
      amountCents: account.weeklyClientPriceCents,
      currency: account.currency,
      sourceKind: "standing_capacity_payment",
      sourceId: payment.id,
      isInternal: account.isInternal,
    });
    await tx.notification.create({
      data: {
        userId: account.clientId,
        type: "payment_received",
        title: "Standing capacity payment received",
        body: "This period is paid.",
      },
    });
  });

  revalidatePath("/admin/standing-capacity");
  return { ok: true };
}

const recordWorkerPayoutSchema = z.object({
  accountId: z.string().min(1).max(100),
  reference: z.string().trim().max(200).optional(),
});

/**
 * The worker-side mirror of recordPeriodPayment: one lump sum for the
 * CURRENT period, paid to whoever is presently assigned. Deliberately
 * separate from admin-qc.ts's approveDeliverable — a period can hold
 * several approved tasks, and this pays for the period once, not once per
 * task (see the isStandingCapacityTask guard there for why no per-task
 * Payout/MoneyIntent is ever created for these tasks).
 */
export async function recordWorkerPeriodPayout(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = recordWorkerPayoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const account = await prisma.standingCapacityAccount.findUnique({
    where: { id: parsed.data.accountId },
    select: {
      id: true,
      currency: true,
      isInternal: true,
      weeklyVaPayoutCents: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  });
  if (!account) return { ok: false, error: "Account not found." };

  const assignee = await currentAssignee(prisma, account.id);
  if (!assignee) return { ok: false, error: "No worker is currently assigned to this account." };

  const existing = await prisma.standingCapacityPayout.findUnique({
    where: {
      accountId_vaId_periodStart: {
        accountId: account.id,
        vaId: assignee.workerId,
        periodStart: account.currentPeriodStart,
      },
    },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "This period has already been paid to this worker." };

  await prisma.$transaction(async (tx) => {
    const payout = await tx.standingCapacityPayout.create({
      data: {
        accountId: account.id,
        vaId: assignee.workerId,
        periodStart: account.currentPeriodStart,
        periodEnd: account.currentPeriodEnd,
        amountCents: account.weeklyVaPayoutCents,
        currency: account.currency,
        method: "wire",
        reference: parsed.data.reference,
        recordedById: admin.id,
      },
    });
    await insertLedgerEntry(tx, {
      kind: "payout",
      amountCents: account.weeklyVaPayoutCents,
      currency: account.currency,
      sourceKind: "standing_capacity_payout",
      sourceId: payout.id,
      isInternal: account.isInternal,
    });
    await tx.notification.create({
      data: {
        userId: assignee.workerId,
        type: "standing_capacity_payout_recorded",
        title: "Standing capacity payout recorded",
        body: "This period's payout has been recorded.",
      },
    });
  });

  revalidatePath("/admin/standing-capacity");
  return { ok: true };
}

const setStatusSchema = z.object({
  accountId: z.string().min(1).max(100),
  status: z.enum(["active", "paused", "cancelled"]),
});

/** Pause stops new task submission without losing the account's history or
 *  context; cancelled is meant to be final (a new account can be opened
 *  later if the client returns — it is never un-cancelled). */
export async function setStandingCapacityStatus(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const account = await prisma.standingCapacityAccount.update({
    where: { id: parsed.data.accountId },
    data: { status: parsed.data.status },
    select: { id: true },
  }).catch(() => null);
  if (!account) return { ok: false, error: "Account not found." };

  await logAdminEvent({
    actorId: admin.id,
    entity: "StandingCapacityAccount",
    entityId: account.id,
    action: "status_changed",
    after: { status: parsed.data.status },
  });

  revalidatePath("/admin/standing-capacity");
  return { ok: true };
}

const contextNoteSchema = z.object({
  accountId: z.string().min(1).max(100),
  body: z.string().trim().min(1).max(4000),
});

/**
 * Publishes a context note directly as ADMIN-authored (visible immediately)
 * — the admin IS the operator doing the identity-safety read as they write
 * it, same trust level as writing revisionInstructions.
 */
export async function publishContextNote(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = contextNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Write a note before publishing." };

  const account = await prisma.standingCapacityAccount.findUnique({
    where: { id: parsed.data.accountId },
    select: { id: true },
  });
  if (!account) return { ok: false, error: "Account not found." };

  await prisma.accountContextNote.create({
    data: {
      accountId: account.id,
      authorId: admin.id,
      authorRole: "ADMIN",
      body: parsed.data.body,
      visible: true,
      publishedById: admin.id,
      publishedAt: new Date(),
    },
  });

  revalidatePath("/admin/standing-capacity");
  revalidatePath("/va");
  return { ok: true };
}

const draftNoteIdSchema = z.object({ noteId: z.string().min(1).max(100) });

/** Publishes a worker's queued draft as-is. To rewrite it instead, use
 *  publishContextNote with the same accountId — the draft stays queued
 *  (still visible: false) so both can be reviewed side by side; reject it
 *  separately if the draft should never be published at all. */
export async function publishDraftContextNote(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = draftNoteIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const result = await prisma.accountContextNote.updateMany({
    where: { id: parsed.data.noteId, visible: false },
    data: { visible: true, publishedById: admin.id, publishedAt: new Date() },
  });
  if (result.count === 0) return { ok: false, error: "Note not found or already published." };

  revalidatePath("/admin/standing-capacity");
  revalidatePath("/va");
  return { ok: true };
}

export async function rejectDraftContextNote(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const parsed = draftNoteIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const result = await prisma.accountContextNote.deleteMany({
    where: { id: parsed.data.noteId, visible: false },
  });
  if (result.count === 0) return { ok: false, error: "Note not found or already published." };

  await logAdminEvent({
    actorId: admin.id,
    entity: "AccountContextNote",
    entityId: parsed.data.noteId,
    action: "draft_rejected",
  });

  revalidatePath("/admin/standing-capacity");
  return { ok: true };
}

// --------------------------------------------------------------- CLIENT ---

const preferenceSchema = z.object({
  communicationStyle: z.string().trim().max(500).optional(),
  deliverableFormat: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** The client's own words about their own working style — written directly,
 *  no operator mediation. See AccountPreference's doc comment for why. */
export async function writeAccountPreference(input: unknown): Promise<ActionResult> {
  const user = await requireRole("CLIENT");
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const account = await prisma.standingCapacityAccount.findUnique({
    where: { clientId: user.id },
    select: { id: true },
  });
  if (!account) return { ok: false, error: "No standing capacity account found." };

  await prisma.accountPreference.upsert({
    where: { accountId: account.id },
    create: { accountId: account.id, ...parsed.data },
    update: parsed.data,
  });

  revalidatePath("/client/standing-capacity");
  return { ok: true };
}

const submitStandingTaskSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(10).max(20000),
  fileIds: z.array(z.string()).max(50).default([]),
  /** The client's own estimate of how many minutes this should take, used
   *  only for the overflow warning shown before submit — never billed off
   *  of, since the block price is fixed regardless of how tasks split the
   *  hours inside it. */
  estimatedMinutes: z.number().int().positive().max(24 * 60),
});

export type SubmitStandingTaskResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string; overflow?: { remainingMinutes: number } };

/**
 * Submits a task into the client's active block. No pricing queue, no
 * quote, no payment gate — the price was already fixed at the block level.
 * Routes straight to the account's current assignee if one exists
 * (submitted -> claimed, skipping open entirely, so it never touches the
 * public pool); otherwise it waits in `submitted` until an admin assigns a
 * worker (see assignWorker's pending-task routing above).
 */
export async function submitStandingTask(input: unknown): Promise<SubmitStandingTaskResult> {
  const user = await requireRole("CLIENT");
  const parsed = submitStandingTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please provide a title (3+ chars) and a description (10+ chars)." };
  }
  const settings = await getSettings();
  if (parsed.data.fileIds.length > settings.maxFilesPerTask) {
    return { ok: false, error: `At most ${settings.maxFilesPerTask} files per task.` };
  }

  const account = await prisma.standingCapacityAccount.findUnique({
    where: { clientId: user.id },
    select: {
      id: true,
      status: true,
      tierHours: true,
      minutesUsedThisPeriod: true,
    },
  });
  if (!account) return { ok: false, error: "No standing capacity account found." };
  if (account.status !== "active") return { ok: false, error: "This account is not active." };

  const capacityMinutes = account.tierHours * 60;
  const remainingMinutes = capacityMinutes - account.minutesUsedThisPeriod;
  if (parsed.data.estimatedMinutes > remainingMinutes) {
    return {
      ok: false,
      error: "This task would exceed your remaining capacity for this week.",
      overflow: { remainingMinutes: Math.max(remainingMinutes, 0) },
    };
  }

  try {
    const task = await prisma.$transaction(async (tx) => {
      const assignee = await currentAssignee(tx as unknown as typeof prisma, account.id);

      const created = await tx.task.create({
        data: {
          clientId: user.id,
          title: parsed.data.title,
          description: parsed.data.description,
          status: "submitted",
          standingCapacityAccountId: account.id,
          estimatedMinutes: parsed.data.estimatedMinutes,
        },
      });

      if (parsed.data.fileIds.length > 0) {
        const claimed = await tx.file.updateMany({
          where: {
            id: { in: parsed.data.fileIds },
            uploaderId: user.id,
            taskId: null,
            kind: "input",
            scanStatus: "clean",
          },
          data: { taskId: created.id },
        });
        if (claimed.count !== parsed.data.fileIds.length) {
          throw new Error("file-claim-mismatch");
        }
      }

      await tx.taskEvent.create({
        data: {
          taskId: created.id,
          toStatus: "submitted",
          action: "client_submitted_standing_task",
          actorId: user.id,
          meta: { files: parsed.data.fileIds.length },
        },
      });

      if (assignee) {
        await transitionTask({
          tx,
          taskId: created.id,
          from: "submitted",
          to: "claimed",
          action: "standing_capacity_routed",
          data: { claimedById: assignee.workerId, claimedAt: new Date() },
        });
      }

      await tx.standingCapacityAccount.update({
        where: { id: account.id },
        data: { minutesUsedThisPeriod: { increment: parsed.data.estimatedMinutes } },
      });

      return created;
    });

    revalidatePath("/client/standing-capacity");
    revalidatePath("/va");
    return { ok: true, taskId: task.id };
  } catch (e) {
    if (e instanceof Error && e.message === "file-claim-mismatch") {
      return { ok: false, error: "One of the uploaded files could not be attached. Re-upload and try again." };
    }
    if (e instanceof TransitionError) throw e;
    throw e;
  }
}

// --------------------------------------------------------------- WORKER ---

/** A worker never writes directly into the visible context — this queues a
 *  draft (visible: false) for an admin to publish as-is or rewrite. Mirrors
 *  the trust model publishRevisionInstructions already uses for a single
 *  task's revision summary. */
export async function submitContextNoteDraft(input: unknown): Promise<ActionResult> {
  const user = await requireApprovedVa();
  const parsed = contextNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Write a note before submitting." };

  const account = await prisma.standingCapacityAccount.findUnique({
    where: { id: parsed.data.accountId },
    select: { id: true },
  });
  if (!account) return { ok: false, error: "Account not found." };

  const assignee = await currentAssignee(prisma, account.id);
  if (assignee?.workerId !== user.id) {
    return { ok: false, error: "You are not currently assigned to this account." };
  }

  await prisma.accountContextNote.create({
    data: {
      accountId: account.id,
      authorId: user.id,
      authorRole: "VA",
      body: parsed.data.body,
      visible: false,
    },
  });

  revalidatePath("/va");
  return { ok: true };
}
