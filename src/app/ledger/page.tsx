import Link from "next/link";
import { cookies } from "next/headers";
import { Wordmark } from "@/components/logo";
import { LangSwitch } from "@/components/lang-switch";
import { SITE_LANGS, langAlternates } from "@/lib/i18n/langs";
import { docLangOf } from "@/lib/i18n/docs";
import { LEDGER_I18N } from "@/lib/i18n/legal";
import { publicLedgerPage } from "@/lib/queries/public-ledger";
import { reliabilityStats } from "@/lib/queries/reliability";

async function resolveLang(sp: { lang?: string }) {
  const jar = await cookies();
  return docLangOf(
    sp.lang,
    jar.get("ss-lang-doc")?.value,
    jar.get("ss-lang-client")?.value,
    jar.get("ss-lang-worker")?.value
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; lang?: string }>;
}) {
  const sp = await searchParams;
  const t = LEDGER_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/ledger", sp.lang),
  };
}

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
   filtered out at the query layer (public-ledger.ts), never here.

   Shares the ss-lang-doc cookie/fallback with /about, /how-it-works,
   /services and the other three trust pages — the same family, so a
   language chosen anywhere in that group carries here too. The per-entry
   timestamp itself stays formatted in English regardless of lang, the same
   "voice translates, the machine stays English" rule the rest of the site
   applies to clock times and filenames — the wording around it is what
   translates. */
export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = LEDGER_I18N[lang];
  const [{ entries, nextCursor, totalCents }, reliability] = await Promise.all([
    publicLedgerPage(sp.cursor ?? null),
    reliabilityStats(),
  ]);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const reliabilityCells = [
    { label: t.reliability.onTime, value: reliability.onTimeRate },
    { label: t.reliability.qcFirstTry, value: reliability.qcPassRate },
    { label: t.reliability.disputed, value: reliability.disputeRate },
  ].filter((c) => c.value !== null);

  return (
    <div lang={lang} className="min-h-screen overflow-x-clip bg-[#F7F6F3]">
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#F7F6F3]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-6">
          <Link href="/" className="text-[12px]">
            <Wordmark tone="ink" />
          </Link>
          <div className="flex items-center gap-4">
            <LangSwitch path="/ledger" current={lang} options={SITE_LANGS} tone="paper" />
            <Link
              href="/"
              className="text-[13px] font-medium text-[#5B6069] transition-colors hover:text-[#14161A]"
            >
              {t.back}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[720px] px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
          {t.eyebrow}
        </p>
        <h1 className="mt-3 max-w-[22ch] text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-[#14161A]">
          {t.h1}
        </h1>
        <p className="mt-4 max-w-[56ch] text-[15px] leading-[1.6] text-[#5B6069]">{t.lede}</p>

        <div className="mt-10 rounded-[8px] border border-black/8 bg-white p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
            {t.totalLabel}
          </p>
          {totalCents !== null ? (
            <p className="mt-1 font-mono text-[34px] font-medium tabular-nums text-[#14161A]">
              {dollars(totalCents)}
            </p>
          ) : (
            <p className="mt-2 text-[14px] text-[#5B6069]">{t.totalPending}</p>
          )}
        </div>

        {reliabilityCells.length > 0 ? (
          <div className="mt-6 grid gap-4 rounded-[8px] border border-black/8 bg-white p-6 sm:grid-cols-3">
            {reliabilityCells.map((c) => (
              <div key={c.label}>
                <p className="font-mono text-[24px] font-medium tabular-nums text-[#14161A]">
                  {pct(c.value!)}
                </p>
                <p className="mt-1 text-[12px] leading-[1.4] text-[#5B6069]">{c.label}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-10">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
            {t.historyLabel}
          </p>
          {entries.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[#14161A]/20 p-6 text-center text-[13px] text-[#5B6069]">
              {t.emptyState}
              <p className="mt-2 rounded border border-dashed border-[#14161A]/15 bg-[#F7F6F3] px-3 py-2 font-mono text-[11px] text-[#8A9099]">
                {t.emptyExample}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/6 rounded-[6px] border border-black/8 bg-white">
              {/* No per-entry amount: a `sale` row carries the client's exact
                  price and a `payout` row the worker's exact pay, so printing
                  both timestamped hands each side the other's number. See the
                  RULE 2 note in queries/public-ledger.ts — the amount is not
                  even selected, so it cannot be rendered here by accident. */}
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-[#14161A]">{t.kind[e.kind] ?? e.kind}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[#8A9099]">
                      {e.categoryName ?? "—"} ·{" "}
                      {e.occurredAt.toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      })}{" "}
                      UTC
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {nextCursor ? (
            <Link
              href={`/ledger?cursor=${nextCursor}${lang !== "en" ? `&lang=${lang}` : ""}`}
              className="mt-4 inline-flex text-[13px] font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-4 hover:decoration-[#14161A]"
            >
              {t.olderEntries}
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
