"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole, requireApprovedVa } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";
import { insertLedgerEntry } from "@/lib/ledger";
import { logAdminEvent } from "@/lib/audit";
import { findPii } from "@/lib/pii-patterns";
import { lockStandingAccount, rollForwardPeriods, resolveTargetPeriod } from "@/lib/standing-period";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Thrown inside a transaction to abort it and surface a message, mirroring
 * the `Refused` pattern va-tasks.ts already uses. Needed here because the
 * capacity check moved INSIDE the transaction: it can no longer simply
 * `return` a refusal, or the work already done in the transaction would
 * commit alongside it.
 */
class Refused extends Error {}

/** Same idea, but carries the remaining minutes the UI shows the client. */
class OverCapacity extends Error {
  constructor(readonly remainingMinutes: number) {
    super("over-capacity");
  }
}

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
    // The status check is the second line, not the first. Suspension closes
    // these rows (closeStandingAssignmentsForWorker, lib/standing-assignments.ts)
    // so a suspended worker should have none left — but this resolver decides
    // who receives a client's work and who gets paid for a period, and it used
    // to route on activeTo alone. If a suspension path added later forgets to
    // close, routing refuses here rather than handing tasks to someone who
    // cannot open them.
    where: { accountId, activeTo: null, worker: { vaProfile: { status: "approved" } } },
    select: { workerId: true },
    orderBy: { activeFrom: "desc" },
  });
}

/**
 * Who held this account when the given week closed — the person a payout for
 * that week belongs to. For the current period this resolves to the same
 * worker currentAssignee returns; it only diverges for a backdated one.
 *
 * Paying a past week off currentAssignee would pay whoever holds the account
 * today for work someone else did, and the (accountId, vaId, periodStart)
 * unique key would then permanently block paying the person who actually did
 * it. The `approved` filter is deliberately absent here, unlike currentAssignee:
 * that one decides who receives new work, this one decides who already earned
 * money, and a worker suspended since is still owed the week they worked.
 *
 * A reassignment mid-week means two people worked it; this resolves the one
 * who finished it. The unique key is per worker, so an operator splitting a
 * week records the other worker as a second payout for the same period.
 */
async function assigneeAtPeriodEnd(
  accountId: string,
  periodEnd: Date
): Promise<{ workerId: string } | null> {
  return prisma.standingCapacityAssignment.findFirst({
    where: {
      accountId,
      activeFrom: { lt: periodEnd },
      OR: [{ activeTo: null }, { activeTo: { gte: periodEnd } }],
    },
    select: { workerId: true },
    orderBy: { activeFrom: "desc" },
  });
}

// ---------------------------------------------------------------- ADMIN ---

const createAccountSchema = z.object({
  clientId: z.string().min(1).max(100),
  tierHours: z.number().int().positive(),
  /**
   * Settable at creation and never after, deliberately — the same rule
   * Task.isInternal follows ("isInternal is frozen after pricing", the
   * integrity trigger). An account's nature must not flip once work and
   * money have flowed through it, because the ledger is append-only and its
   * past entries carry whichever value was true at the time.
   *
   * Without this the column was inert: it was added so the account's sale and
   * payout ledger entries could carry it, but nothing could ever set it to
   * true, so the protection did not exist in practice.
   */
  isInternal: z.boolean().default(false),
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
      isInternal: parsed.data.isInternal,
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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.standingCapacityAssignment.updateMany({
        where: { accountId: account.id, activeTo: null },
        data: { activeTo: new Date() },
      });
      // If this throws P2002 it is the partial unique index doing its job:
      // another assignment landed between our updateMany and this insert.
      // The close-then-open pair is only serialized by row locks when a row
      // was ALREADY active — on an account with none, updateMany matches
      // nothing, locks nothing, and two callers would both reach here.
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
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        error: "Someone else just assigned a worker to this account. Reload to see who.",
      };
    }
    throw e;
  }

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
  /** ISO timestamp of the target week's start; omitted means the current one. */
  periodStart: z.string().optional(),
});

/**
 * Admin-attested payment for one period — mirrors recordManualPayment in
 * admin-payments.ts exactly, applied to a block instead of a task. Real Stripe
 * checkout for whole blocks is future work; Stripe has no live keys configured
 * anywhere in this app yet.
 *
 * The period is chosen, not assumed. It used to be hard-coded to
 * currentPeriodStart, and periods roll automatically whether or not the week
 * was ever billed — so a week the operator did not get to before the rollover
 * became permanently unrecordable. The client's money had arrived and no row
 * could ever say so.
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
      createdAt: true,
    },
  });
  if (!account) return { ok: false, error: "Account not found." };
  if (account.status !== "active") return { ok: false, error: "This account is not active." };

  const period = resolveTargetPeriod(account, parsed.data.periodStart);
  if (!period) {
    return { ok: false, error: "That is not a period this account had. Pick one from the list." };
  }

  // The unique index added alongside this (migration 20260802160000) is the
  // real guarantee — a duplicate would insert a second `sale` into an
  // append-only ledger, which cannot be taken back. This check exists so the
  // operator reads a sentence rather than a constraint violation.
  const already = await prisma.standingCapacityPayment.findFirst({
    where: { accountId: account.id, periodStart: period.periodStart },
    select: { id: true },
  });
  if (already) return { ok: false, error: "This period is already recorded as paid." };

  await prisma.$transaction(async (tx) => {
    const payment = await tx.standingCapacityPayment.create({
      data: {
        accountId: account.id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
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
        body: `The week of ${period.periodStart.toISOString().slice(0, 10)} is paid.`,
      },
    });
  });

  revalidatePath("/admin/standing-capacity");
  return { ok: true };
}

const recordWorkerPayoutSchema = z.object({
  accountId: z.string().min(1).max(100),
  reference: z.string().trim().max(200).optional(),
  /** ISO timestamp of the target week's start; omitted means the current one. */
  periodStart: z.string().optional(),
});

/**
 * The worker-side mirror of recordPeriodPayment: one lump sum for one period,
 * paid to whoever held the account when that week closed. Deliberately
 * separate from admin-qc.ts's approveDeliverable — a period can hold several
 * approved tasks, and this pays for the period once, not once per task (see
 * the isStandingCapacityTask guard there for why no per-task Payout/MoneyIntent
 * is ever created for these tasks).
 *
 * Backdating matters more here than on the client side. The unique key is
 * (accountId, vaId, periodStart), so a missed week recorded against the
 * current period would both pay the wrong worker and burn the only slot the
 * right one had — the week became unpayable to the person who worked it.
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
      createdAt: true,
    },
  });
  if (!account) return { ok: false, error: "Account not found." };

  const period = resolveTargetPeriod(account, parsed.data.periodStart);
  if (!period) {
    return { ok: false, error: "That is not a period this account had. Pick one from the list." };
  }

  const assignee = await assigneeAtPeriodEnd(account.id, period.periodEnd);
  if (!assignee) {
    return { ok: false, error: "No worker held this account during that week, so there is nothing to pay." };
  }

  const existing = await prisma.standingCapacityPayout.findUnique({
    where: {
      accountId_vaId_periodStart: {
        accountId: account.id,
        vaId: assignee.workerId,
        periodStart: period.periodStart,
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
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
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
        body: `Your payout for the week of ${period.periodStart.toISOString().slice(0, 10)} has been recorded.`,
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

/**
 * The client's own words about their own working style — written directly,
 * no operator mediation. See AccountPreference's doc comment for why.
 *
 * "No operator mediation" is the whole point of the field, and it is also
 * why it needed a machine gate: these three strings are selected by
 * workerAccountSelect (queries/standing-capacity.ts) and rendered verbatim
 * to the assigned worker. A client typing "call me at 514-555-0199" or
 * "email jean@acme.ca" broke RULE 1 by the simplest path in the product,
 * and nothing checked. The one-off pipeline never had this hole because
 * every task passes an operator before a worker sees it; Standing Capacity
 * is the product where the client writes straight through.
 *
 * The check is the same one the worker's own free text has always faced on
 * the way out (assistant-scrub.ts) — now shared from pii-patterns.ts, so
 * both directions of the wall are held to one standard. It catches the
 * mechanical shapes only; a name in prose still relies on the operator, and
 * /security says so.
 */
export async function writeAccountPreference(input: unknown): Promise<ActionResult> {
  const user = await requireRole("CLIENT");
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  for (const field of [
    parsed.data.communicationStyle,
    parsed.data.deliverableFormat,
    parsed.data.notes,
  ]) {
    if (!field) continue;
    const found = findPii(field);
    if (found === "contact") {
      return {
        ok: false,
        error:
          "Remove the email address or phone number. The specialist doing your work reads these notes, and the platform keeps that channel closed on purpose — anything you need to pass along goes through your operator.",
      };
    }
    if (found === "price") {
      return {
        ok: false,
        error:
          "Remove the dollar figure. The specialist reads these notes and never sees what you pay.",
      };
    }
  }

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

  /**
   * A one-off task cannot reach a worker without passing approvePricing,
   * where the operator attests to having read it for identifying details
   * (admin.ts). A Standing Capacity task has no such stop: when a worker is
   * assigned, this action transitions submitted → claimed in the same
   * transaction that creates it, and vaTaskSelect projects `description`
   * straight to them. So the brief a client types here reaches a named human
   * with nothing in between — the same wall the one-off flow guards with an
   * operator, guarded here by the machine check instead.
   */
  for (const field of [parsed.data.title, parsed.data.description]) {
    const found = findPii(field);
    if (found === "contact") {
      return {
        ok: false,
        error:
          "Remove the email address or phone number from your task. A specialist reads this directly, and the platform keeps that channel closed — send anything they need to reach you through your operator.",
      };
    }
    if (found === "price") {
      return {
        ok: false,
        error:
          "Remove the dollar figure from your task. The specialist doing the work never sees what you pay.",
      };
    }
  }

  // Identity only. Everything that can change under us — the period window,
  // the counter, the status — is re-read inside the lock below. An account's
  // id never moves, so resolving it here costs nothing and lets the lock key
  // be the account rather than the client.
  const accountRef = await prisma.standingCapacityAccount.findUnique({
    where: { clientId: user.id },
    select: { id: true },
  });
  if (!accountRef) return { ok: false, error: "No standing capacity account found." };

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // The check and the write now live in ONE transaction, serialized per
      // account. Previously the read was a separate round-trip before the
      // transaction even opened, so two submissions read the same counter and
      // both passed their capacity check — proven to land 660 minutes of work
      // in a 300-minute block. Same treatment claimTask and submitExam
      // already give their own read-then-write.
      await lockStandingAccount(tx, accountRef.id);

      const account = await tx.standingCapacityAccount.findUniqueOrThrow({
        where: { id: accountRef.id },
        select: {
          id: true,
          status: true,
          tierHours: true,
          isInternal: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          minutesUsedThisPeriod: true,
        },
      });
      if (account.status !== "active") throw new Refused("This account is not active.");

      // The period had never been consulted here at all: capacity was checked
      // against whatever week the row still named, which after a period ended
      // was a week already over — for up to an hour, until the sweep noticed.
      // Rolling forward at the moment of use closes that window.
      const period = await rollForwardPeriods(tx, account.id, account, new Date());

      const capacityMinutes = account.tierHours * 60;
      const remainingMinutes = capacityMinutes - period.minutesUsedThisPeriod;
      if (parsed.data.estimatedMinutes > remainingMinutes) {
        throw new OverCapacity(Math.max(remainingMinutes, 0));
      }

      const assignee = await currentAssignee(tx as unknown as typeof prisma, account.id);

      const created = await tx.task.create({
        data: {
          clientId: user.id,
          title: parsed.data.title,
          description: parsed.data.description,
          status: "submitted",
          standingCapacityAccountId: account.id,
          estimatedMinutes: parsed.data.estimatedMinutes,
          // Inherited at creation, and it has to be here: a standing task goes
          // submitted -> claimed inside this very transaction, and the
          // integrity trigger freezes isInternal once status leaves
          // submitted/pricing_review. There is no later moment to correct it.
          // Left to its default, an operator's own practice work counted
          // permanently in tasksDelivered, TIME SAVED and all three published
          // reliability rates.
          isInternal: account.isInternal,
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

      // Safe as a bare increment ONLY because the lock above serializes every
      // reader of this counter, and rollForwardPeriods ran inside the same
      // transaction — so the value being incremented is the one the capacity
      // check was made against, for the period it was made against.
      await tx.standingCapacityAccount.update({
        where: { id: account.id },
        data: { minutesUsedThisPeriod: { increment: parsed.data.estimatedMinutes } },
      });

      return created;
    });

    revalidatePath("/client/standing-capacity");
    revalidatePath("/va");
    return { ok: true, taskId: outcome.id };
  } catch (e) {
    if (e instanceof OverCapacity) {
      return {
        ok: false,
        error: "This task would exceed your remaining capacity for this week.",
        overflow: { remainingMinutes: e.remainingMinutes },
      };
    }
    if (e instanceof Refused) return { ok: false, error: e.message };
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
