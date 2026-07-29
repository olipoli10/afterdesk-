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
  claimedById: true,
  claimedAt: true,
  qcRounds: true,
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
      ...(eligibleForHighValue ? {} : { tier: "standard" }),
    },
    select: vaPoolSelect,
    orderBy: [{ vaDeadlineUtc: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 100,
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
  filesVerified: true,
  isInternal: true,
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
      createdAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.TaskSelect;

export type AdminTaskView = Prisma.TaskGetPayload<{ select: typeof adminTaskSelect }>;

export async function taskForAdmin(taskId: string): Promise<AdminTaskView | null> {
  return prisma.task.findUnique({ where: { id: taskId }, select: adminTaskSelect });
}

/** Pricing queue, most urgent first (closest client deadline, then oldest). */
export async function pricingQueue() {
  return prisma.task.findMany({
    where: { status: { in: ["submitted", "pricing_review"] } },
    select: {
      id: true,
      title: true,
      status: true,
      clientDeadlineUtc: true,
      createdAt: true,
      client: { select: { name: true, email: true } },
      _count: { select: { files: true } },
    },
    orderBy: [{ clientDeadlineUtc: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

export async function pricingQueueCount(): Promise<number> {
  return prisma.task.count({ where: { status: { in: ["submitted", "pricing_review"] } } });
}

/** Next task in the pricing queue after excluding one (approve-and-advance). */
export async function nextInPricingQueue(excludeId: string): Promise<string | null> {
  const rows = await prisma.task.findMany({
    where: { status: { in: ["submitted", "pricing_review"] }, id: { not: excludeId } },
    select: { id: true },
    orderBy: [{ clientDeadlineUtc: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
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
