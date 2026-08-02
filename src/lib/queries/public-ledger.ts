import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * The public ledger (/ledger). Never a client name, never a worker name —
 * LedgerEntry has no such columns to begin with (see the model comment in
 * schema.prisma), so there is nothing to redact here, only to filter.
 *
 * Two independent gates, both required: isInternal excludes the operator's
 * own practice transactions (section 7's rule — internal money never reaches
 * a public number), publiclyVisible is the per-entry override for anything
 * an admin needs to strike from the public view without touching the
 * append-only rows themselves (see LedgerEntry's own doc comment on the
 * model). insertLedgerEntry defaults publiclyVisible to true, so a caller
 * that forgets to pass isInternal for an internal transaction would leak it
 * here if this only checked one flag — both are filtered explicitly.
 */
const PAGE_SIZE = 50;

/**
 * RULE 2 — why no per-entry amount is published here.
 *
 * This page used to select amountCents per row and render it as an exact
 * dollar figure. That published both sides of the wall: a `sale` row carries
 * Payment.amountCents, which is task.clientPriceCents verbatim (stripe.ts),
 * and a `payout` row carries Payout.amountCents, which is task.vaPayoutCents
 * verbatim (admin-qc.ts). A worker who just delivered a task knows their own
 * payout, sees a timestamped sale beside it, and has the client's price and
 * the platform's margin. A client does the reverse.
 *
 * Bucketing does not fix it. The buckets that protect the marketing counters
 * ($500, public-stats.ts) would floor a $74 task to $0, and any bucket fine
 * enough to stay meaningful still hands over an approximate price to someone
 * who knows the other half of the pair. Coarsening the timestamp does not fix
 * it either, because at launch volume there is usually only one transaction
 * in a day. The only per-entry amount that cannot be correlated is one that
 * is never published.
 *
 * What survives is the part that carries the page's actual promise: the
 * running total, which is an aggregate over every transaction and only
 * published once there are enough of them to hide any single one, plus the
 * per-entry kind, category and date — enough to show the ledger is real,
 * append-only and moving, which is what "make 'trust me' checkable" meant.
 */
const MIN_PUBLIC_ENTRIES = 25;

/**
 * Exported so test/price-wall.test.ts can walk it the same way it walks the
 * role-shaped task selects: this is a RULE 2 surface, and the failure mode is
 * one word ("amountCents: true") added to the object literal while doing
 * something else. A comment would not have caught that; the test will.
 */
export const publicLedgerEntrySelect = {
  id: true,
  seq: true,
  kind: true,
  categoryName: true,
  occurredAt: true,
} as const;

export type PublicLedgerEntry = {
  id: string;
  seq: string;
  kind: string;
  categoryName: string | null;
  occurredAt: Date;
};

export type PublicLedgerPage = {
  entries: PublicLedgerEntry[];
  nextCursor: string | null;
  /** null until MIN_PUBLIC_ENTRIES is reached: a total over one or two
   *  transactions IS those transactions' amounts. */
  totalCents: number | null;
};

// What counts toward the headline total: money that actually moved from a
// client, net of what went back. Worker payouts and platform fees are real
// entries (shown in the history below) but aren't "processed on behalf of
// clients," so they don't move this number either direction.
const CREDIT_KINDS = new Set(["sale", "chargeback_reversal"]);
const DEBIT_KINDS = new Set(["refund", "chargeback"]);

export const publicLedgerTotalCents = cache(async (): Promise<number | null> => {
  const publishedEntries = await prisma.ledgerEntry.count({
    where: { isInternal: false, publiclyVisible: true },
  });
  if (publishedEntries < MIN_PUBLIC_ENTRIES) return null;

  const rows = await prisma.ledgerEntry.groupBy({
    by: ["kind"],
    where: { isInternal: false, publiclyVisible: true },
    _sum: { amountCents: true },
  });
  let total = 0;
  for (const row of rows) {
    const cents = row._sum.amountCents ?? 0;
    if (CREDIT_KINDS.has(row.kind)) total += cents;
    else if (DEBIT_KINDS.has(row.kind)) total -= cents;
  }
  return Math.max(0, total);
});

export async function publicLedgerPage(cursorSeq: string | null): Promise<PublicLedgerPage> {
  const rows = await prisma.ledgerEntry.findMany({
    where: { isInternal: false, publiclyVisible: true },
    orderBy: { seq: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursorSeq ? { cursor: { seq: BigInt(cursorSeq) }, skip: 1 } : {}),
    select: publicLedgerEntrySelect,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const totalCents = await publicLedgerTotalCents();

  return {
    entries: page.map((r) => ({ ...r, seq: r.seq.toString() })),
    nextCursor: hasMore ? page[page.length - 1].seq.toString() : null,
    totalCents,
  };
}
