import "server-only";
import { Prisma, type PaymentStatus, type TaskStatus } from "@prisma-client";
import { prisma } from "@/lib/db";
import { formatMetricsForClient, type MetricRow } from "@/lib/delivery-metrics";
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
  // Not a price and not an identity: it only says which circuit paid for this
  // task, so the client screens can stop describing a standing task as one
  // waiting for a quote it will never receive.
  standingCapacityAccountId: true,
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
  //
  // Standing tasks are DELIBERATELY still readable here. Filtering them out
  // looked like the tidy fix for the "We're pricing your task" lie and was a
  // worse bug: this page is the only surface that renders delivery downloads,
  // the revision and dispute controls, and it is where the "your reviewed
  // delivery is ready" email points. Excluding them handed standing clients a
  // 404 in place of the work they paid for. The lie is fixed where it was
  // told — in the status mapping below — not by hiding the task.
  return prisma.task.findFirst({
    where: { id: taskId, clientId },
    select: clientTaskSelect,
  });
}

/**
 * The single field the "cancelled" panel needs to tell a client the truth
 * about their money. Deliberately a separate narrow query rather than an
 * addition to clientTaskSelect above: that select is the RULE 2 security
 * boundary and price-wall.test.ts pins its shape, so it is not the place to
 * grow an ad-hoc field for one panel. Ownership is enforced in the WHERE
 * clause, same pattern as taskForClient.
 */
export async function latestPaymentStatusForClient(
  taskId: string,
  clientId: string
): Promise<PaymentStatus | null> {
  const payment = await prisma.payment.findFirst({
    where: { taskId, task: { clientId } },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  return payment?.status ?? null;
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
      /**
       * AN INTERNAL TASK IS NOT PAID WORK AND MUST NOT REACH THE BOARD.
       *
       * The database already refuses to let a commercial task enter `open`
       * without a payout, and it EXEMPTS internal tasks from that check
       * precisely because nobody is paid for them. Which means the one row
       * shape the payout guard deliberately allows through is the one shape
       * the board must not show: an internal task carries no worker payout, so
       * a worker who claimed it would do the work for nothing.
       *
       * Belt to the database's braces, and they guard different things. The
       * trigger protects the amount; this protects who may see the task.
       */
      isInternal: false,
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
      // Same two exclusions as poolForVa, for the same reason twice over: a
      // worker must not reach an internal or a standing task by guessing its
      // URL any more than by browsing the board. Filtering only the list would
      // hide these tasks without making them unreachable.
      isInternal: false,
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

/**
 * The client-facing execution report — the role-shaped TaskEvent variant this
 * file's comment above has been reserving.
 *
 * WHY A WHITELIST AND NOT A FILTER. Every other role boundary in this file is
 * enforced by omitting columns from a select. That is not enough here: the
 * risk is not a column, it is a ROW. TaskEvent is the audit log for the whole
 * platform, worker questions and payout bookkeeping and file scans included,
 * and new action strings get added to it whenever a feature lands. A blocklist
 * would silently start showing the paying client every future internal event
 * the day someone adds one. So an action must be named in TIMELINE below to be
 * shown at all, and anything unrecognised is dropped. Adding an event to the
 * audit log can never, by itself, publish it.
 *
 * WHAT IS DELIBERATELY NOT SELECTED. `actorId` identifies the worker and is
 * the whole of RULE 1. `reason` is free text written by the operator to the
 * worker (QC comments) or by the worker to the operator (questions), and can
 * name either party. `meta` carries internal counters. None of the three is
 * projected, so no UI mistake downstream can surface them.
 */
export type TimelineTone = "normal" | "review" | "flag";

/**
 * Exported so test/client-timeline.test.ts can pin the exact key set. Adding a
 * key here is the dangerous act this feature has, and it must not be possible
 * to do it absent-mindedly while working on something else.
 */
export const CLIENT_TIMELINE_LABELS: Record<string, { label: string; tone: TimelineTone }> = {
  // Intake and price. entered_pricing_queue is omitted on purpose: it fires in
  // the same transaction as client_submitted and would render as a duplicate
  // row at an identical timestamp.
  client_submitted: { label: "You submitted the task", tone: "normal" },
  client_submitted_standing_task: { label: "You submitted the task", tone: "normal" },
  admin_quoted: { label: "We sent you a fixed price", tone: "normal" },
  client_accepted_quote: { label: "You approved the price", tone: "normal" },
  client_declined_quote: { label: "You declined the price", tone: "flag" },
  quote_expired: { label: "The price lapsed before it was answered", tone: "flag" },

  // Money. Wording matches the escrow reality: authorization is not a charge.
  client_payment_received: { label: "Your card was authorized, not charged", tone: "normal" },
  admin_recorded_payment: { label: "We recorded your payment", tone: "normal" },
  payment_window_expired: { label: "The payment window closed", tone: "flag" },
  // late_client_payment_recovered is deliberately absent: fulfillCheckout
  // writes it and client_payment_received back to back in ONE transaction
  // (stripe.ts, the task?.status === "expired" branch), so keying it would
  // print the same sentence twice at the same timestamp.

  // Execution. Never a name, never a count of who, and never an article that
  // implies the client could reach them.
  va_claimed: { label: "A trained specialist picked up the work", tone: "normal" },
  standing_capacity_routed: {
    label: "The work was routed to your assigned specialist",
    tone: "normal",
  },
  va_released: { label: "Reopened for a different specialist", tone: "flag" },
  // "Reopened", not "reassigned": reassignTask clears claimedById and sends
  // the task back to `open` (or to `submitted` for standing capacity). At the
  // instant this event is written nobody holds the work, and nobody is
  // guaranteed to pick it up, so naming a new specialist would be a claim the
  // product has not yet made good on.
  admin_reassigned: { label: "Reopened for a different specialist", tone: "flag" },
  va_submitted_deliverable: { label: "Delivered to our reviewer, not to you", tone: "review" },

  // Review. This is the part of the record the report exists for.
  admin_qc_rejected: { label: "Our reviewer sent it back for corrections", tone: "review" },
  admin_qc_rejected_exhausted: {
    label: "Our reviewer sent it back again and reopened it for a different specialist",
    tone: "review",
  },
  admin_qc_approved: { label: "Passed review and was released to you", tone: "review" },

  // After delivery.
  client_requested_revision: { label: "You asked for a revision", tone: "flag" },
  admin_published_revision_instructions: {
    label: "We issued the revision instructions",
    tone: "normal",
  },
  client_opened_dispute: { label: "You raised a dispute", tone: "flag" },
  // Not "met the written standard": TaskCategory.disputeCriteria is nullable,
  // and an unfiled task has no category at all, so this row would assert a
  // written standard that does not exist for that task.
  admin_rejected_dispute: {
    label: "We reviewed your dispute and let the delivery stand",
    tone: "review",
  },
  admin_ordered_dispute_rework: {
    label: "We reviewed your dispute and ordered rework",
    tone: "review",
  },
  admin_upheld_dispute: { label: "We upheld your dispute", tone: "review" },
  admin_cancelled: { label: "We cancelled the task", tone: "flag" },
  standing_minutes_returned: {
    label: "Your reserved minutes were credited back",
    tone: "normal",
  },
  retention_files_purged: {
    label: "Your files reached the end of the retention window and were deleted",
    tone: "normal",
  },
};

/**
 * Exported so a test can assert the projection itself, not just its output:
 * the leak this guards against is a column being added here, which no
 * fixture-driven test would catch.
 */
export const clientTimelineEventSelect = {
  action: true,
  createdAt: true,
} satisfies Prisma.TaskEventSelect;

/**
 * The whitelist itself, as a pure function so it can be tested without a
 * database. `Object.hasOwn` rather than a plain lookup on purpose: `action` is
 * an unconstrained String column, and a bare `TIMELINE[action]` returns a
 * truthy inherited member for "constructor", "toString" or "__proto__" — which
 * would push an entry with an undefined label straight onto a client's page.
 */
export function clientTimelineEntries(
  rows: { action: string; createdAt: Date }[]
): { at: Date; label: string; tone: TimelineTone }[] {
  return rows.flatMap((r) =>
    Object.hasOwn(CLIENT_TIMELINE_LABELS, r.action)
      ? [
          {
            at: r.createdAt,
            label: CLIENT_TIMELINE_LABELS[r.action].label,
            tone: CLIENT_TIMELINE_LABELS[r.action].tone,
          },
        ]
      : []
  );
}

export type ExecutionReport = {
  entries: { at: Date; label: string; tone: TimelineTone }[];
  /** Times our reviewer sent a delivery back BEFORE one first passed. */
  sentBack: number;
  /** True once a delivery has actually cleared review. */
  passed: boolean;
  /**
   * Pre-formatted label/value pairs from the approved delivery, or null. Never
   * raw stored data: formatMetricsForClient is an allowlist projection, so a
   * property added to the JSON later cannot surface here by default.
   */
  metrics: MetricRow[] | null;
  /**
   * True when the figures come from a delivery that passed AFTER a revision,
   * not from the one the headline describes. Without this the card can read
   * "Passed our review on the first delivery" directly above numbers from a
   * later, revised version, and both sentences are individually true while
   * the pairing misleads.
   */
  metricsFromRevision: boolean;
  /** The written standard the delivery was judged against, if the category has one. */
  standard: string | null;
  categoryName: string | null;
};

/**
 * Pinned as a named const so a test can assert the filter itself. Changing
 * "approved" to "pending" here would publish an unreviewed worker's claims to
 * the paying client, and no fixture-driven test would necessarily catch it.
 */
export function approvedSubmissionMetricsWhere(taskId: string) {
  return { taskId, qcStatus: "approved" as const };
}

/** Written only by rejectDeliverable, which is a real reviewer decision. */
const QC_SENT_BACK = new Set(["admin_qc_rejected", "admin_qc_rejected_exhausted"]);

/**
 * The arithmetic behind the headline, derived from the audit log rather than
 * from Submission rows. Pure and exported so it can be tested directly.
 *
 * COUNTING FROM EVENTS IS THE WHOLE POINT, and three wrong sources were tried
 * before this one:
 *
 *  - Submission.qcStatus === "rejected" OVERCOUNTS. reassignTask flips every
 *    pending submission to "rejected" when an unresponsive worker is taken off
 *    a task (admin.ts), with a qcComment that says in so many words "a
 *    reassignment, not a quality strike". Counting those tells the client a
 *    reviewer rejected work that no reviewer ever opened.
 *  - Task.qcRounds UNDERCOUNTS: it is reset to 0 on repool and on reassignment.
 *  - Submission.attemptNo OVERCOUNTS: it also counts the worker replacing
 *    their own upload before anyone reviewed it.
 *
 * Only rejectDeliverable writes the two QC_SENT_BACK actions, so an event
 * count is exactly the number of times a reviewer looked and said no.
 *
 * Rejections are counted only BEFORE the first approval. After a delivery has
 * passed, the client can request a revision, which can be sent back again;
 * folding those into the same number would make "before it passed our review"
 * literally false about events that happened after it passed.
 */
export function executionSummary(rows: { action: string }[]): {
  sentBack: number;
  passed: boolean;
  approvals: number;
} {
  const firstPass = rows.findIndex((r) => r.action === "admin_qc_approved");
  const beforeFirstPass = firstPass === -1 ? rows : rows.slice(0, firstPass);
  return {
    sentBack: beforeFirstPass.filter((r) => QC_SENT_BACK.has(r.action)).length,
    passed: firstPass !== -1,
    // More than one approval means the client asked for a revision after
    // delivery and the revised version passed too. The headline describes the
    // FIRST pass; the figures describe the version the client actually holds,
    // which is the latest. Both are true and they are about different
    // deliveries, so the card has to say which is which.
    approvals: rows.filter((r) => r.action === "admin_qc_approved").length,
  };
}

/**
 * Task states in which an approved delivery still stands.
 *
 * `passed` alone answers "was this ever approved", which is not the same
 * question as "does that approval still hold". decideDispute's upheld branch
 * (admin-resolutions.ts) cancels the task, voids the payout and refunds the
 * client, but never touches the Submission row or the audit event, so a
 * refunded task would otherwise keep showing "Passed our review" with the
 * delivery figures directly above "Your payment was refunded". Same for a
 * task sent back into rework: the operator has formally found the delivery
 * deficient, and its numbers must not stay on the client's page while it is
 * being redone.
 */
export const APPROVAL_STANDS: TaskStatus[] = ["completed"];

export async function executionReportForClient(
  taskId: string,
  clientId: string
): Promise<ExecutionReport | null> {
  // Ownership is part of the WHERE clause, same as taskForClient — no
  // cross-client read is possible even with a guessed task id.
  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId },
    select: {
      id: true,
      status: true,
      category: { select: { name: true, disputeCriteria: true } },
    },
  });
  if (!task) return null;

  // The counts come from here and nowhere else: see executionSummary for why
  // every number the Submission table could offer is wrong.
  const rows = await prisma.taskEvent.findMany({
    where: { taskId },
    select: clientTimelineEventSelect,
    orderBy: { createdAt: "asc" },
  });
  const summary = executionSummary(rows);

  /**
   * TWO INDEPENDENT GATES on the delivery numbers, and they are not redundant.
   *
   *  (1) summary.passed requires an admin_qc_approved event in the audit log.
   *      It is the same source the headline above the numbers reads, so the
   *      figures and the sentence can never disagree with each other.
   *  (2) The Submission row is filtered on qcStatus "approved" — the same
   *      filter clientTaskSelect.submissions already applies to the files.
   *
   *  (3) The task must still be in a state where that approval stands. See
   *      APPROVAL_STANDS: an upheld dispute cancels and refunds without ever
   *      revoking the submission, so gates (1) and (2) both keep passing on a
   *      task the operator has already ruled against.
   *
   * Any gate missing means no numbers at all. A pending, superseded or
   * rejected attempt's claim must never reach the client: an inflated count on
   * a delivery that got sent back is precisely what QC exists to catch, and
   * publishing it would turn the proof card into the vehicle for the lie.
   */
  let metrics: MetricRow[] | null = null;
  if (summary.passed && APPROVAL_STANDS.includes(task.status)) {
    const approved = await prisma.submission.findFirst({
      where: approvedSubmissionMetricsWhere(taskId),
      // The latest approval, because that is the version the client actually
      // holds. When it is not the first, the card says so.
      orderBy: { reviewedAt: "desc" },
      select: { deliveryMetrics: true },
    });
    metrics = formatMetricsForClient(approved?.deliveryMetrics ?? null);
  }

  return {
    entries: clientTimelineEntries(rows),
    sentBack: summary.sentBack,
    passed: summary.passed,
    metrics,
    metricsFromRevision: metrics !== null && summary.approvals > 1,
    standard: task.category?.disputeCriteria ?? null,
    categoryName: task.category?.name ?? null,
  };
}
