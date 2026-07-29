import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * Public homepage counters. AGGREGATES ONLY — never a per-task figure, never a
 * client-side sum (total client revenue would let workers derive the margin
 * against the payout total, and vice versa).
 *
 * RULE 2 hardening — the money figure is doubly protected:
 *  - It is withheld entirely until MIN_MONEY_DELIVERIES tasks have been
 *    delivered, so a small ledger can never be read back to one payout.
 *  - It is floored to MONEY_BUCKET_CENTS ("$12,500+"), so a client bracketing
 *    their own task's delivery with two page loads cannot read the delta —
 *    a single delivery almost never moves the published figure, and when it
 *    does it reveals only that a bucket boundary was crossed.
 *
 * Honesty: "released" means released — summed from Payout rows in
 * released/paid status, never from quoted task fields (owed, voided and
 * failed payouts don't count). "Tasks delivered" excludes the operator's own
 * internal practice tasks; internal payouts still count in the money figure
 * (a real payout to a real worker always counts — see schema note).
 */
const MIN_MONEY_DELIVERIES = 25;
const MONEY_BUCKET_CENTS = 50_000; // $500

export type PublicStats = {
  tasksDelivered: number;
  approvedWorkers: number;
  /** Floored-to-bucket released total, or null while withheld. */
  releasedBucketCents: number | null;
};

export const publicStats = cache(async (): Promise<PublicStats> => {
  try {
    const [tasksDelivered, releasedAgg, approvedWorkers] = await Promise.all([
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
    ]);

    const releasedCents = releasedAgg._sum.amountCents ?? 0;
    const bucketed =
      Math.floor(releasedCents / MONEY_BUCKET_CENTS) * MONEY_BUCKET_CENTS;
    const releasedBucketCents =
      tasksDelivered >= MIN_MONEY_DELIVERIES && bucketed >= MONEY_BUCKET_CENTS
        ? bucketed
        : null;

    return { tasksDelivered, approvedWorkers, releasedBucketCents };
  } catch {
    // A DB hiccup must never 500 a public page — the strip simply doesn't
    // render (the component's zero guard handles the rest).
    return { tasksDelivered: 0, approvedWorkers: 0, releasedBucketCents: null };
  }
});
