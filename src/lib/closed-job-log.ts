import "server-only";
import type { Prisma, ClosedJobOutcome, LostReasonCategory } from "@prisma-client";
import { prisma } from "@/lib/db";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Called from every place a task actually reaches a final outcome —
 * approveDeliverable (admin-qc.ts), cancelTask (admin.ts), declineQuote
 * (client-tasks.ts), expireStaleQuotes/expireStalePayments (sweeps.ts).
 * Upserted rather than created: `completed` isn't strictly terminal (a
 * revision or dispute can reopen it), so a task that closes, reopens, and
 * closes again updates its one row instead of erroring on the unique
 * taskId constraint. See the doc comment on ClosedJobLog in schema.prisma
 * for what does and doesn't live in this table.
 */
export async function upsertClosedJobLog(
  db: Db,
  taskId: string,
  args: {
    outcome: ClosedJobOutcome;
    lostReasonCategory?: LostReasonCategory;
    lostReasonDetail?: string | null;
  }
): Promise<void> {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { clientPriceCents: true, vaPayoutCents: true, revisionRounds: true, qcRounds: true },
  });

  const finalSubmission =
    args.outcome === "won"
      ? await db.submission.findFirst({
          where: { taskId, qcStatus: "approved" },
          orderBy: { reviewedAt: "desc" },
          select: { rating: true },
        })
      : null;

  const marginCents =
    task.clientPriceCents != null && task.vaPayoutCents != null
      ? task.clientPriceCents - task.vaPayoutCents
      : null;

  const now = new Date();
  await db.closedJobLog.upsert({
    where: { taskId },
    create: {
      taskId,
      outcome: args.outcome,
      marginCents,
      lostReasonCategory: args.lostReasonCategory,
      lostReasonDetail: args.lostReasonDetail || null,
      revisionRequestedBeforeClose: task.revisionRounds > 0,
      qcRoundsAtClose: task.qcRounds,
      finalRating: finalSubmission?.rating ?? null,
      closedAt: now,
    },
    update: {
      outcome: args.outcome,
      marginCents,
      lostReasonCategory: args.lostReasonCategory,
      lostReasonDetail: args.lostReasonDetail || null,
      revisionRequestedBeforeClose: task.revisionRounds > 0,
      qcRoundsAtClose: task.qcRounds,
      finalRating: finalSubmission?.rating ?? null,
      closedAt: now,
    },
  });
}
