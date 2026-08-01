import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * Public homepage counters. AGGREGATES ONLY — never a per-task figure, never a
 * client-side sum (total client revenue would let workers derive the margin
 * against the payout total, and vice versa).
 *
 * RULE 2 hardening — every money/time figure is doubly protected:
 *  - Withheld entirely until MIN_MONEY_DELIVERIES tasks have been delivered,
 *    so a small ledger can never be read back to one payout or one quote.
 *  - Floored to a bucket ("$12,500+", "480h+"), so bracketing a single task's
 *    delivery with two page loads cannot read the delta — one delivery
 *    almost never moves the published figure, and when it does it reveals
 *    only that a bucket boundary was crossed.
 *
 * Honesty: "released" means released — summed from Payout rows in
 * released/paid status, never from quoted task fields (owed, voided and
 * failed payouts don't count). "Tasks delivered" excludes the operator's own
 * internal practice tasks; internal payouts still count in the money figure
 * (a real payout to a real worker always counts — see schema note).
 *
 * MONEY SAVED = sum, per completed non-internal task whose category has an
 * admin-set referenceHourlyRateCents, of
 *   max(0, referenceHourlyRateCents * hours - clientPriceCents)
 * A category with no reference rate set is excluded from the sum entirely —
 * never treated as a zero rate, which would silently undercount as "no
 * savings" for a category nobody has priced the market on yet. Floored at 0
 * per task so one unusually expensive/rush task can't drag the public total
 * down. TIME SAVED is the simpler figure: sum of estimatedMinutes across
 * every completed non-internal task, no reference rate needed.
 */
const MIN_MONEY_DELIVERIES = 25;
const MONEY_BUCKET_CENTS = 50_000; // $500
const TIME_BUCKET_MINUTES = 600; // 10h

export type PublicStats = {
  tasksDelivered: number;
  approvedWorkers: number;
  /** Floored-to-bucket worker payouts released, or null while withheld. */
  releasedBucketCents: number | null;
  /** Floored-to-bucket hours saved (client side), or null while withheld. */
  timeSavedBucketMinutes: number | null;
  /** Floored-to-bucket dollars saved (client side), or null while withheld. */
  moneySavedBucketCents: number | null;
};

export const publicStats = cache(async (): Promise<PublicStats> => {
  try {
    const [tasksDelivered, releasedAgg, approvedWorkers, savingsRows] = await Promise.all([
      // firstCompletedAt survives later disputes/revisions — "delivered" means
      // it reached the client at least once, which is what the counter claims.
      prisma.task.count({
        where: { firstCompletedAt: { not: null }, isInternal: false },
      }),
      prisma.payout.aggregate({
        _sum: { amountCents: true },
        where: { status: { in: ["released", "paid"] } },
      }),
      prisma.vaProfile.count({ where: { status: "approved" } }),
      prisma.task.findMany({
        where: { firstCompletedAt: { not: null }, isInternal: false, estimatedMinutes: { not: null } },
        select: {
          estimatedMinutes: true,
          clientPriceCents: true,
          category: { select: { referenceHourlyRateCents: true } },
        },
      }),
    ]);

    const releasedCents = releasedAgg._sum.amountCents ?? 0;
    const releasedBucketed =
      Math.floor(releasedCents / MONEY_BUCKET_CENTS) * MONEY_BUCKET_CENTS;
    const releasedBucketCents =
      tasksDelivered >= MIN_MONEY_DELIVERIES && releasedBucketed >= MONEY_BUCKET_CENTS
        ? releasedBucketed
        : null;

    let timeSavedMinutes = 0;
    let moneySavedCents = 0;
    for (const row of savingsRows) {
      const minutes = row.estimatedMinutes ?? 0;
      timeSavedMinutes += minutes;
      const rate = row.category?.referenceHourlyRateCents;
      if (rate == null || row.clientPriceCents == null) continue;
      const marketCostCents = Math.round((rate * minutes) / 60);
      moneySavedCents += Math.max(0, marketCostCents - row.clientPriceCents);
    }

    const timeSavedBucketed = Math.floor(timeSavedMinutes / TIME_BUCKET_MINUTES) * TIME_BUCKET_MINUTES;
    const timeSavedBucketMinutes =
      tasksDelivered >= MIN_MONEY_DELIVERIES && timeSavedBucketed >= TIME_BUCKET_MINUTES
        ? timeSavedBucketed
        : null;

    const moneySavedBucketed = Math.floor(moneySavedCents / MONEY_BUCKET_CENTS) * MONEY_BUCKET_CENTS;
    const moneySavedBucketCents =
      tasksDelivered >= MIN_MONEY_DELIVERIES && moneySavedBucketed >= MONEY_BUCKET_CENTS
        ? moneySavedBucketed
        : null;

    return {
      tasksDelivered,
      approvedWorkers,
      releasedBucketCents,
      timeSavedBucketMinutes,
      moneySavedBucketCents,
    };
  } catch {
    // A DB hiccup must never 500 a public page — the strip simply doesn't
    // render (the component's zero guard handles the rest).
    return {
      tasksDelivered: 0,
      approvedWorkers: 0,
      releasedBucketCents: null,
      timeSavedBucketMinutes: null,
      moneySavedBucketCents: null,
    };
  }
});
