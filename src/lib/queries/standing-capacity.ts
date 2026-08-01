import "server-only";
import { prisma } from "@/lib/db";

/**
 * RULE 2 for Standing Capacity: the client view never selects a worker's
 * identity (assignments, workerId), and the worker view never selects the
 * client's identity or client_price — the exact same exclusion the one-off
 * flow's src/lib/queries/tasks.ts enforces, just at the account grain.
 */

// ---------- CLIENT ----------

export const clientAccountSelect = {
  id: true,
  status: true,
  tierHours: true,
  weeklyClientPriceCents: true,
  currency: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  minutesUsedThisPeriod: true,
  preference: {
    select: { communicationStyle: true, deliverableFormat: true, notes: true },
  },
  tasks: {
    select: {
      id: true,
      title: true,
      status: true,
      estimatedMinutes: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 50,
  },
} as const;

export async function standingCapacityForClient(clientId: string) {
  return prisma.standingCapacityAccount.findUnique({
    where: { clientId },
    select: clientAccountSelect,
  });
}

// ---------- WORKER ----------

export const workerAccountSelect = {
  id: true,
  tierHours: true,
  preference: {
    select: { communicationStyle: true, deliverableFormat: true, notes: true },
  },
  contextNotes: {
    where: { visible: true },
    select: { id: true, body: true, authorRole: true, publishedAt: true },
    orderBy: { publishedAt: "desc" as const },
    take: 30,
  },
} as const;

/** Only returns the account if `workerId` is its CURRENT assignee — a
 *  worker reassigned off an account loses this read the same instant an
 *  admin closes their assignment row. */
export async function standingCapacityForWorker(accountId: string, workerId: string) {
  const assignment = await prisma.standingCapacityAssignment.findFirst({
    where: { accountId, workerId, activeTo: null },
    select: { id: true },
  });
  if (!assignment) return null;
  return prisma.standingCapacityAccount.findUnique({
    where: { id: accountId },
    select: workerAccountSelect,
  });
}

/** Every account currently assigned to this worker — drives the "Standing
 *  accounts" list in their nav/dashboard. */
export async function standingCapacityAccountsForWorker(workerId: string) {
  const assignments = await prisma.standingCapacityAssignment.findMany({
    where: { workerId, activeTo: null },
    select: {
      account: {
        select: { id: true, tierHours: true, status: true },
      },
    },
  });
  return assignments.map((a) => a.account).filter((a) => a.status === "active");
}

/** Draft (unpublished) worker-authored notes waiting on an admin — read by
 *  the worker who wrote them, to see their own queue. */
export async function draftContextNotesForWorker(accountId: string, workerId: string) {
  return prisma.accountContextNote.findMany({
    where: { accountId, authorId: workerId, visible: false },
    select: { id: true, body: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

// ---------- ADMIN ----------

export const adminAccountListSelect = {
  id: true,
  status: true,
  tierHours: true,
  weeklyClientPriceCents: true,
  weeklyVaPayoutCents: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  minutesUsedThisPeriod: true,
  client: { select: { id: true, name: true, email: true } },
  assignments: {
    where: { activeTo: null },
    select: { worker: { select: { id: true, name: true } } },
    take: 1,
  },
  payments: {
    select: { id: true, periodStart: true, periodEnd: true, amountCents: true, reference: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} as const;

export async function standingCapacityAccountsForAdmin() {
  return prisma.standingCapacityAccount.findMany({
    select: adminAccountListSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function draftContextNotesForAdmin(accountId: string) {
  return prisma.accountContextNote.findMany({
    where: { accountId, visible: false },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function contextNotesForAdmin(accountId: string) {
  return prisma.accountContextNote.findMany({
    where: { accountId },
    select: {
      id: true,
      body: true,
      visible: true,
      authorRole: true,
      publishedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
