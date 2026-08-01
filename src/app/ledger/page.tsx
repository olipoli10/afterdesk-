import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { publicLedgerPage } from "@/lib/queries/public-ledger";

export const metadata = {
  title: "Public Ledger",
  description:
    "A running, append-only record of money processed through AfterDesk. No client or worker names — just the total and every entry behind it.",
};

const KIND_LABEL: Record<string, string> = {
  sale: "Payment processed",
  refund: "Refund",
  payout: "Worker payout",
  fee: "Platform fee",
  chargeback: "Chargeback",
  chargeback_reversal: "Chargeback reversed",
  correction: "Correction",
};

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/* This page exists to make "trust me" checkable. Every completed
   transaction writes a permanent entry (src/lib/ledger.ts) — enforced
   append-only in Postgres via a non-owner app role plus BEFORE
   UPDATE/DELETE/TRUNCATE triggers, seq/occurredAt/the hash chain assigned by
   a BEFORE INSERT trigger the application code cannot forge (see
   LedgerEntry's own comment in schema.prisma). This page only reads it.
   No client or worker identity is ever selected — the model has no such
   columns to begin with. Internal (operator practice) transactions are
   filtered out at the query layer (public-ledger.ts), never here. */
export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const { entries, nextCursor, totalCents } = await publicLedgerPage(cursor ?? null);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#F7F6F3]">
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#F7F6F3]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-6">
          <Link href="/" className="text-[12px]">
            <Wordmark tone="ink" />
          </Link>
          <Link
            href="/"
            className="text-[13px] font-medium text-[#5B6069] transition-colors hover:text-[#14161A]"
          >
            ← Back
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[720px] px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
          Public Ledger
        </p>
        <h1 className="mt-3 max-w-[22ch] text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-[#14161A]">
          Every dollar processed, append-only.
        </h1>
        <p className="mt-4 max-w-[56ch] text-[15px] leading-[1.6] text-[#5B6069]">
          No client names, no worker names — just amounts, categories, and timestamps, written the
          moment each transaction settles. Entries are never edited or deleted once written; a
          correction is its own new entry, not an overwrite.
        </p>

        <div className="mt-10 rounded-[8px] border border-black/8 bg-white p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
            Total processed to date
          </p>
          {totalCents > 0 ? (
            <p className="mt-1 font-mono text-[34px] font-medium tabular-nums text-[#14161A]">
              {dollars(totalCents)}
            </p>
          ) : (
            <p className="mt-2 text-[14px] text-[#5B6069]">
              $0 — this updates automatically the moment the first transaction settles. Nothing has
              yet.
            </p>
          )}
        </div>

        <div className="mt-10">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
            History
          </p>
          {entries.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[#14161A]/20 p-6 text-center text-[13px] text-[#5B6069]">
              No entries yet — this list updates automatically once the first task completes.
              <p className="mt-2 rounded border border-dashed border-[#14161A]/15 bg-[#F7F6F3] px-3 py-2 font-mono text-[11px] text-[#8A9099]">
                example — Aug 4 · Payment processed · Data entry · $68
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/6 rounded-[6px] border border-black/8 bg-white">
              {entries.map((e) => {
                const signed = DEBIT_LIKE.has(e.kind) ? -e.amountCents : e.amountCents;
                return (
                  <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-[#14161A]">{KIND_LABEL[e.kind] ?? e.kind}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#8A9099]">
                        {e.categoryName ?? "—"} ·{" "}
                        {e.occurredAt.toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "UTC",
                        })}{" "}
                        UTC
                      </p>
                    </div>
                    <p
                      className={`shrink-0 font-mono text-[13px] tabular-nums ${
                        signed < 0 ? "text-[#8C2F23]" : "text-[#14161A]"
                      }`}
                    >
                      {signed < 0 ? "−" : ""}
                      {dollars(Math.abs(e.amountCents))}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {nextCursor ? (
            <Link
              href={`/ledger?cursor=${nextCursor}`}
              className="mt-4 inline-flex text-[13px] font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-4 hover:decoration-[#14161A]"
            >
              Older entries →
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}

const DEBIT_LIKE = new Set(["refund", "chargeback"]);
