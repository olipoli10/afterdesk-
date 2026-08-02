import "server-only";
import type { Prisma } from "@prisma/client";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Everything that reads a Standing Capacity account's period and then writes
 * it back goes through this lock.
 *
 * submitStandingTask used to read minutesUsedThisPeriod OUTSIDE any
 * transaction, decide in JavaScript whether the task fit, and only then open
 * a transaction to `{ increment }` — with no predicate. Two submissions read
 * the same counter and both passed: replayed on real Postgres, an account
 * with 120 of 300 minutes left accepted four 120-minute tasks and landed at
 * 660/300, six hours of work outside the block the client paid for.
 *
 * The repo already had the answer twice — claimTask (va-tasks.ts) and
 * submitExam (academy.ts) both take an advisory lock for exactly this
 * read-then-write shape, and claimTask's comment describes the bug in as many
 * words. Those were the only two locks in the whole codebase. This is the
 * third, on the third place that needed it.
 *
 * The rollover sweep takes the SAME lock: without it, advanceStandingCapacityPeriods
 * could reset the counter between a submission's check and its write, so
 * minutes validated against one week were billed to another — or erased
 * outright, handing the client a free block.
 */
export async function lockStandingAccount(
  tx: Prisma.TransactionClient,
  accountId: string
): Promise<void> {
  // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void and
  // $queryRaw would try to deserialize it. Same reasoning as academy.ts:51-55.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${`standing-capacity:${accountId}`}))
  `;
}

export type StandingPeriod = {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  minutesUsedThisPeriod: number;
};

/**
 * Brings an account's window forward until it contains `now`, resetting the
 * counter once per week crossed. Returns the period as it stands afterwards.
 *
 * Callers MUST already hold lockStandingAccount for this account.
 *
 * Two reasons this is a loop rather than a single step. The sweep advanced by
 * exactly one week per pass, which is fine at an hourly cadence and useless
 * after an outage — and this codebase has already had a cron that never ran
 * once. An account three weeks behind would have needed three passes. Second,
 * submitStandingTask never looked at currentPeriodEnd at all, so between a
 * period ending and the sweep noticing it (up to an hour) a client's capacity
 * was checked against a week that was already over. Rolling forward here, at
 * the moment of use, closes that window and demotes the sweep to a backstop.
 *
 * Boundaries advance from the old boundary, never from "now", so a late roll
 * never shortens the week the client paid for.
 */
export async function rollForwardPeriods(
  tx: Prisma.TransactionClient,
  accountId: string,
  period: StandingPeriod,
  now: Date
): Promise<StandingPeriod> {
  if (period.currentPeriodEnd > now) return period;

  let start = period.currentPeriodStart;
  let end = period.currentPeriodEnd;
  while (end <= now) {
    start = end;
    end = new Date(start.getTime() + WEEK_MS);
  }

  await tx.standingCapacityAccount.update({
    where: { id: accountId },
    data: { currentPeriodStart: start, currentPeriodEnd: end, minutesUsedThisPeriod: 0 },
  });

  return { currentPeriodStart: start, currentPeriodEnd: end, minutesUsedThisPeriod: 0 };
}
