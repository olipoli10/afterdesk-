import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { VA_FILE_ACCESS_STATUSES } from "@/lib/status";

/**
 * RULE 2 enforcement lives here. Every read of Task data goes through the
 * role-shaped selects below — raw `prisma.task` reads outside src/lib and
 * src/server are forbidden by convention (grep-able rule).
 *
 *  - CLIENT selects NEVER include: vaPayoutCents, claimedById, claimedBy,
 *    vaDeadlineUtc, aiLowCents/aiHighCents/aiReasoning, submission VA identity.
 *  - VA selects NEVER include: clientPriceCents, clientId, client,
 *    clientDeadlineUtc, ai* fields.
 * The excluded field is absent from the SQL projection, so it can never reach
 * a payload regardless of any UI bug.
 */

// ---------- CLIENT ----------

export const clientTaskSelect = {
  id: true,
  title: true,
  description: true,
  quantity: true,
  status: true,
  currency: true,
  clientPriceCents: true,
  clientDeadlineUtc: true,
  quotedAt: true,
  quoteExpiresAt: true,
  acceptedAt: true,
  completedAt: true,
  revisionWindowEndsAt: true,
  revisionRounds: true,
  category: { select: { name: true, disputeCriteria: true } },
  declinedAt: true,
  declineReason: true,
  cancelledAt: true,
  expiredAt: true,
  createdAt: true,
  files: {
    where: { kind: "input" as const, purgedAt: null },
    select: { id: true, fileName: true, sizeBytes: true, mime: true, createdAt: true },
    orderBy: { createdAt: "asc" as const },
  },
  /**
   * Approved deliveries only — a rejected revision must stay invisible
   * forever, and its filename can carry the worker's identity. `note` is the
   * worker's message to the operator and is deliberately NOT selected.
   */
  submissions: {
    where: { qcStatus: "approved" as const },
    select: {
      id: true,
      reviewedAt: true,
      files: {
        where: { purgedAt: null },
        select: { id: true, fileName: true, sizeBytes: true },
        orderBy: { createdAt: "asc" as const },
      },
    },
    orderBy: { reviewedAt: "desc" as const },
  },
} satisfies Prisma.TaskSelect;

export type ClientTaskView = Prisma.TaskGetPayload<{ select: typeof clientTaskSelect }>;

export async function tasksForClient(clientId: string): Promise<ClientTaskView[]> {
  return prisma.task.findMany({
    where: { clientId },
    select: clientTaskSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function taskForClient(
  taskId: string,
  clientId: string
): Promise<ClientTaskView | null> {
  // Ownership is part of the WHERE clause — no cross-client IDOR possible.
  return prisma.task.findFirst({
    where: { id: taskId, clientId },
    select: clientTaskSelect,
  });
}

// ---------- VA ----------

/**
 * RULE 2 / RULE 1: this select is the security boundary for the worker side.
 * It must NEVER list clientPriceCents, clientId, client, clientDeadlineUtc,
 * ai* fields, or Payment/Payout amounts belonging to anyone else. The worker
 * sees their own payout and their own deadline, nothing about who is paying.
 */
export const vaTaskSelect = {
  id: true,
  title: true,
  description: true,
  quantity: true,
  tier: true,
  status: true,
  currency: true,
  vaPayoutCents: true,
  vaDeadlineUtc: true,
  estimatedMinutes: true,
  claimedById: true,
  claimedAt: true,
  qcRounds: true,
  revisionInstructions: true,
  createdAt: true,
  category: { select: { name: true, slug: true, disputeCriteria: true } },
  files: {
    where: { kind: "input" as const, purgedAt: null },
    select: { id: true, fileName: true, sizeBytes: true, mime: true },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.TaskSelect;

export type VaTaskView = Prisma.TaskGetPayload<{ select: typeof vaTaskSelect }>;

/**
 * Pool listing. Deliberately narrower than vaTaskSelect: file *names* stay out
 * of the pool entirely, because a client's filename can identify them and the
 * pool is visible to every approved worker. Counts only.
 */
export const vaPoolSelect = {
  id: true,
  title: true,
  description: true,
  quantity: true,
  tier: true,
  currency: true,
  vaPayoutCents: true,
  vaDeadlineUtc: true,
  estimatedMinutes: true,
  category: { select: { name: true, slug: true } },
  _count: { select: { files: { where: { kind: "input", purgedAt: null } } } },
} satisfies Prisma.TaskSelect;

export type VaPoolView = Prisma.TaskGetPayload<{ select: typeof vaPoolSelect }>;

/**
 * The pool a specific worker is allowed to see. High-value tasks are gated on
 * the rolling score and a minimum number of rated deliveries; both thresholds
 * are admin-editable settings.
 */
export async function poolForVa(opts: {
  score: number | null;
  ratedCount: number;
  highValueThreshold: number;
  minRatedDeliveries: number;
}): Promise<VaPoolView[]> {
  const eligibleForHighValue =
    opts.score !== null &&
    opts.score >= opts.highValueThreshold &&
    opts.ratedCount >= opts.minRatedDeliveries;

  return prisma.task.findMany({
    where: {
      status: "open",
      claimedById: null,
      // A standing task belongs to one client's private block and one
      // assigned specialist. It must never be claimable by the pool at
      // large: whoever claimed it would have no account context, and the
      // per-period payout model means they would never be paid for it.
      standingCapacityAccountId: null,
      ...(eligibleForHighValue ? {} : { tier: "standard" }),
    },
    select: vaPoolSelect,
    orderBy: [{ vaDeadlineUtc: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 100,
  });
}

/**
 * One pool task, read BEFORE claiming — the "Details" page behind every board
 * tile, so a worker never has to commit on a truncated brief (a claim release
 * is recorded on their record).
 *
 * RULE 2: same boundary as vaPoolSelect — no client identity, no client
 * price, no client deadline, and NO FILENAMES (a count only): the task is
 * still unclaimed, so this page is visible to every approved worker.
 * disputeCriteria is included on purpose: it is the standard the work will be
 * judged against, authored for the worker to read before claiming.
 *
 * The same high-value gate as poolForVa applies — a gated worker must not be
 * able to open a high-value task by guessing its URL.
 */
export const vaPoolDetailSelect = {
  ...vaPoolSelect,
  category: { select: { name: true, slug: true, disputeCriteria: true } },
} satisfies Prisma.TaskSelect;

export type VaPoolDetailView = Prisma.TaskGetPayload<{ select: typeof vaPoolDetailSelect }>;

export async function poolTaskForVa(
  taskId: string,
  opts: {
    score: number | null;
    ratedCount: number;
    highValueThreshold: number;
    minRatedDeliveries: number;
  }
): Promise<VaPoolDetailView | null> {
  const eligibleForHighValue =
    opts.score !== null &&
    opts.score >= opts.highValueThreshold &&
    opts.ratedCount >= opts.minRatedDeliveries;

  return prisma.task.findFirst({
    where: {
      id: taskId,
      status: "open",
      claimedById: null,
      // Same exclusion as poolForVa: a gated worker must not reach a standing
      // task by guessing its URL any more than by browsing the board.
      standingCapacityAccountId: null,
      ...(eligibleForHighValue ? {} : { tier: "standard" }),
    },
    select: vaPoolDetailSelect,
  });
}

/** Tasks currently in this worker's hands. */
export async function tasksForVa(vaId: string): Promise<VaTaskView[]> {
  return prisma.task.findMany({
    where: { claimedById: vaId, status: { in: VA_FILE_ACCESS_STATUSES } },
    select: vaTaskSelect,
    orderBy: { vaDeadlineUtc: { sort: "asc", nulls: "last" } },
  });
}

/**
 * One task, scoped to the worker who holds it. The status filter matters as
 * much as the ownership one: claimedById survives a task moving to completed
 * or cancelled, so without it the worker's page — and the client's filenames
 * on it — would outlive their access to the work.
 */
export async function taskForVa(taskId: string, vaId: string): Promise<VaTaskView | null> {
  return prisma.task.findFirst({
    where: { id: taskId, claimedById: vaId, status: { in: VA_FILE_ACCESS_STATUSES } },
    select: vaTaskSelect,
  });
}

/** This worker's finished history — payout amounts are theirs to see. */
export async function completedTasksForVa(vaId: string) {
  return prisma.task.findMany({
    where: { claimedById: vaId, status: { in: ["completed", "cancelled", "expired"] } },
    select: {
      id: true,
      title: true,
      status: true,
      currency: true,
      vaPayoutCents: true,
      completedAt: true,
      category: { select: { name: true } },
    },
    orderBy: { completedAt: { sort: "desc", nulls: "last" } },
    take: 50,
  });
}

/**
 * Deliveries that were rejected on the final QC round and left this worker's
 * hands — the task went back to the pool (or on to someone else), so it no
 * longer appears in tasksForVa/completedTasksForVa. Without this, the task
 * simply vanishes from the worker's app with no record and no explanation.
 *
 * RULE 2: the select names only worker-safe fields — the operator's QC
 * comment (written for the worker) and the task title they already worked
 * under. Never clientPriceCents, clientId, client, or clientDeadlineUtc.
 */
export async function returnedSubmissionsForVa(vaId: string) {
  return prisma.submission.findMany({
    where: {
      vaId,
      qcStatus: "rejected",
      // The task is no longer in this worker's hands. Prisma's `not` filter
      // excludes NULL rows, so re-pooled (claimedById = null) tasks need
      // their own branch.
      OR: [
        { task: { claimedById: null } },
        { task: { NOT: { claimedById: vaId } } },
      ],
    },
    select: {
      id: true,
      taskId: true,
      reviewedAt: true,
      qcComment: true,
      task: { select: { id: true, title: true } },
    },
    orderBy: { reviewedAt: "desc" },
    distinct: ["taskId"],
    take: 25,
  });
}

// ---------- ADMIN ----------

export const adminTaskSelect = {
  id: true,
  title: true,
  description: true,
  quantity: true,
  tier: true,
  status: true,
  currency: true,
  clientPriceCents: true,
  vaPayoutCents: true,
  aiLowCents: true,
  aiHighCents: true,
  aiReasoning: true,
  aiSuggestedPriceCents: true,
  aiSuggestedVaPayoutCents: true,
  aiConfidence: true,
  aiEstimatedMinutes: true,
  aiSuggestedCategorySlug: true,
  aiComputedAt: true,
  clientDeadlineUtc: true,
  vaDeadlineUtc: true,
  quotedAt: true,
  quoteExpiresAt: true,
  acceptedAt: true,
  claimedAt: true,
  completedAt: true,
  revisionWindowEndsAt: true,
  declinedAt: true,
  declineReason: true,
  cancelledAt: true,
  cancelReason: true,
  expiredAt: true,
  qcRounds: true,
  revisionRounds: true,
  revisionInstructions: true,
  filesVerified: true,
  isInternal: true,
  standingCapacityAccountId: true,
  estimatedMinutes: true,
  firstCompletedAt: true,
  paymentDueAt: true,
  category: { select: { id: true, name: true, slug: true } },
  createdAt: true,
  client: { select: { id: true, name: true, email: true } },
  claimedBy: { select: { id: true, name: true, email: true } },
  files: {
    where: { purgedAt: null },
    select: {
      id: true,
      kind: true,
      fileName: true,
      sizeBytes: true,
      mime: true,
      scanStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
  payments: {
    select: {
      id: true,
      amountCents: true,
      method: true,
      provider: true,
      providerRef: true,
      status: true,
      receivedAt: true,
      createdAt: true,
      refunds: {
        select: {
          id: true,
          amountCents: true,
          provider: true,
          providerRef: true,
          reason: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" as const },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
  payouts: {
    select: {
      id: true,
      vaId: true,
      amountCents: true,
      currency: true,
      status: true,
      releasedAt: true,
      paidAt: true,
      method: true,
      reference: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
  moneyIntents: {
    select: {
      id: true,
      kind: true,
      amountCents: true,
      currency: true,
      status: true,
      attempts: true,
      lastError: true,
      processedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
  disputes: {
    select: {
      id: true,
      reasonCode: true,
      reasonDetail: true,
      adminSummaryForWorker: true,
      outcome: true,
      decidedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.TaskSelect;

export type AdminTaskView = Prisma.TaskGetPayload<{ select: typeof adminTaskSelect }>;

export async function taskForAdmin(taskId: string): Promise<AdminTaskView | null> {
  return prisma.task.findUnique({ where: { id: taskId }, select: adminTaskSelect });
}

/**
 * Only one-off tasks are priced here, hence the standingCapacityAccountId
 * filter every query in this trio shares. A standing task sits in `submitted`
 * whenever its account has no assignee, and the queue used to select on
 * status alone — so it appeared here looking like any other unpriced task,
 * and pricing it started the one-off billing circuit for work the client's
 * block already covers and whose minutes were already deducted. It belongs on
 * the standing capacity page as work awaiting routing, not here.
 */
const oneOffAwaitingPricing = {
  status: { in: ["submitted", "pricing_review"] as const },
  standingCapacityAccountId: null,
} satisfies Prisma.TaskWhereInput;

/**
 * Pricing queue, lowest AI confidence first — those are the ones that
 * genuinely need the admin's judgment; "not yet computed" (AI pricing
 * disabled, or this one call failed) sorts with them for the same reason.
 * High-confidence tasks sort last, so they cluster at the bottom for
 * Approve & next to burn through quickly. Deadline urgency is the
 * secondary sort within each confidence tier — this is a priority queue,
 * not just an urgency queue.
 */
export async function pricingQueue() {
  return prisma.task.findMany({
    where: oneOffAwaitingPricing,
    select: {
      id: true,
      title: true,
      status: true,
      clientDeadlineUtc: true,
      createdAt: true,
      aiConfidence: true,
      aiSuggestedPriceCents: true,
      aiComputedAt: true,
      client: { select: { name: true, email: true } },
      _count: { select: { files: true } },
    },
    orderBy: [
      { aiConfidence: { sort: "asc", nulls: "first" } },
      { clientDeadlineUtc: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  });
}

export async function pricingQueueCount(): Promise<number> {
  return prisma.task.count({ where: oneOffAwaitingPricing });
}

/**
 * Standing tasks whose account has no assignee, so they never got routed and
 * are sitting in `submitted` with nobody working them. Excluded from the
 * pricing queue above, they would otherwise be visible nowhere at all — the
 * client's minutes are already spent and the brief is going nowhere. Grouped
 * by account because the fix is always the same: assign a worker, and
 * assignWorker routes everything pending at once.
 */
export async function unroutedStandingTaskCounts(): Promise<Map<string, number>> {
  const rows = await prisma.task.groupBy({
    by: ["standingCapacityAccountId"],
    where: { status: "submitted", standingCapacityAccountId: { not: null } },
    _count: { _all: true },
  });
  return new Map(
    rows.flatMap((r) => (r.standingCapacityAccountId ? [[r.standingCapacityAccountId, r._count._all] as const] : []))
  );
}

/** Next task in the pricing queue after excluding one (approve-and-advance).
 *  Same ordering as pricingQueue() — approve-and-advance must always land
 *  on whatever the queue currently shows as row one, or the two would
 *  silently disagree about what "next" means. */
export async function nextInPricingQueue(excludeId: string): Promise<string | null> {
  const rows = await prisma.task.findMany({
    where: { ...oneOffAwaitingPricing, id: { not: excludeId } },
    select: { id: true },
    orderBy: [
      { aiConfidence: { sort: "asc", nulls: "first" } },
      { clientDeadlineUtc: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
    take: 1,
  });
  return rows[0]?.id ?? null;
}

export async function allTasksForAdmin(statusFilter?: string) {
  const where =
    statusFilter && statusFilter !== "all"
      ? { status: statusFilter as Prisma.EnumTaskStatusFilter["equals"] }
      : {};
  return prisma.task.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      tier: true,
      currency: true,
      clientPriceCents: true,
      vaPayoutCents: true,
      clientDeadlineUtc: true,
      createdAt: true,
      client: { select: { name: true } },
      claimedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/**
 * ADMIN ONLY — returns full audit rows including `meta` and `actorId`.
 * TaskEvent sits outside the Task role-shaping above, so it gets the same
 * treatment by naming: never call this from a client- or VA-facing page.
 * Role-shaped variants (status changes only, no meta, no actor) belong here
 * when client/VA timelines are built.
 */
export async function taskEventsForAdmin(taskId: string) {
  return prisma.taskEvent.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}
