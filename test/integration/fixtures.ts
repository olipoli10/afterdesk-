import { prisma } from "@/lib/db";

/**
 * Minimal direct-write fixtures for the integration suite. These bypass the
 * server actions ON PURPOSE: the suite tests database-level invariants
 * (triggers, partial indexes, locks), and the actions' own behaviour is
 * covered by the source-level fast suite plus the e2e run.
 */

let seq = 0;
const uid = () => `it${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function createClient() {
  return prisma.user.create({
    data: { name: "Integration Client", email: `client-${uid()}@it.local`, role: "CLIENT" },
    select: { id: true },
  });
}

export async function createWorker() {
  const user = await prisma.user.create({
    data: { name: "Integration Worker", email: `worker-${uid()}@it.local`, role: "VA" },
    select: { id: true },
  });
  await prisma.vaProfile.create({ data: { userId: user.id, status: "approved" } });
  return user;
}

export async function createTask(input?: {
  clientId?: string;
  status?: string;
  clientPriceCents?: number;
  vaPayoutCents?: number;
  estimatedMinutes?: number | null;
  claimedById?: string | null;
}) {
  const clientId = input?.clientId ?? (await createClient()).id;
  return prisma.task.create({
    data: {
      clientId,
      title: "Integration task",
      description: "A task created directly for database-invariant tests.",
      status: (input?.status ?? "submitted") as never,
      clientPriceCents: input?.clientPriceCents ?? 10_000,
      vaPayoutCents: input?.vaPayoutCents ?? 2_000,
      /**
       * A commercial task in the pool must carry a positive effort estimate
       * (second_shift_pool_task_is_payable). The default belongs in the
       * fixture rather than in each test: a task with a payout and no minutes
       * is not a shape the product ever produces.
       */
      estimatedMinutes: input?.estimatedMinutes ?? 60,
      claimedById: input?.claimedById ?? null,
    },
    select: { id: true, clientId: true },
  });
}

/** A task with its accepted contract + baseline, the 1C anchor pair. */
export async function createAcceptedTask(input?: { clientPriceCents?: number }) {
  const task = await createTask({ status: "open", clientPriceCents: input?.clientPriceCents });
  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      clientPriceCents: input?.clientPriceCents ?? 10_000,
      currency: "USD",
      title: "Integration task",
      description: "contract copy",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
    },
    select: { id: true, createdAt: true },
  });
  const baseline = await prisma.taskOperationalBaseline.create({
    data: {
      taskId: task.id,
      snapshotId: snapshot.id,
      clientId: task.clientId,
      executionKeyVersion: 1,
      pricingPolicyVersion: "pricing_v1+cc1",
      qualityPolicyVersion: "qc_v1",
      costCatalogVersion: "cc1",
      clientPriceCents: input?.clientPriceCents ?? 10_000,
      modeledReviewerMinutesAtQuote: 20,
      modeledReworkReservePctBps: 1500,
      modeledStripeFeePctBps: 290,
      modeledStripeFeeFixedCents: 30,
      modeledTargetMarginBps: 6000,
      clientPriorCompletedTaskCount: 0,
      repeatWindowEndsAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
      estimatedWorkerPayoutCents: 2000,
      estimatedInternalCostLikelyCents: 3000,
    },
    select: { id: true },
  });
  return { task, snapshot, baseline };
}
