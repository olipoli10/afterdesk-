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

export type PublicLedgerEntry = {
  id: string;
  seq: string;
  kind: string;
  amountCents: number;
  currency: string;
  categoryName: string | null;
  occurredAt: Date;
};

export type PublicLedgerPage = {
  entries: PublicLedgerEntry[];
  nextCursor: string | null;
  totalCents: number;
};

// What counts toward the headline total: money that actually moved from a
// client, net of what went back. Worker payouts and platform fees are real
// entries (shown in the history below) but aren't "processed on behalf of
// clients," so they don't move this number either direction.
const CREDIT_KINDS = new Set(["sale", "chargeback_reversal"]);
const DEBIT_KINDS = new Set(["refund", "chargeback"]);

export const publicLedgerTotalCents = cache(async (): Promise<number> => {
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
    select: {
      id: true,
      seq: true,
      kind: true,
      amountCents: true,
      currency: true,
      categoryName: true,
      occurredAt: true,
    },
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
