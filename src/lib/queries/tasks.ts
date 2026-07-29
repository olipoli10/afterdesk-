import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

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
  filesVerified: true,
  clientPaidAt: true,
  vaPaidAt: true,
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

export async function taskEvents(taskId: string) {
  return prisma.taskEvent.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}
