import Link from "next/link";
import { cookies } from "next/headers";
import { PublicShell } from "@/components/public-shell";
import { InstrumentFrame, Passage, StateChip, Kicker } from "@/components/instruments";
import { langAlternates } from "@/lib/i18n/langs";
import { INSIDE_I18N, insideLangOf } from "@/lib/i18n/inside";
import { pageConcierge } from "@/lib/i18n/public-shell";

/* ─────────────────────────────────────────────────────────────────────────
   /inside — the system cutaway, and the public truth registry.

   1.4C rebuilt the PRESENTATION only: the INSIDE_I18N dictionary stays the
   single source of truth, every claim of the old page is still rendered,
   and the long method prose is a keyboard-accessible disclosure instead of
   a wall. The six-passage operating model now runs beside a live-looking
   operation trace (data-proof="operation-cutaway") so the page SHOWS the
   system instead of only describing it.

   TRUTH BOUNDARY (ADR-022, Brain invariant 18) unchanged: AVAILABLE claims
   map to released behavior; recurring operations stay under VISION; the
   registry chips never speak by color alone (green underline carries
   AVAILABLE under the ledger law; amber #D98324 carries IN DEVELOPMENT;
   VISION stays muted; refusals carry the ✕ word-chip).
   ───────────────────────────────────────────────────────────────────────── */

async function resolveLang(sp: { lang?: string }) {
  const jar = await cookies();
  return insideLangOf(sp.lang ?? jar.get("ss-lang-client")?.value);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const t = INSIDE_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/inside", sp.lang),
  };
}

/* the cutaway's right pane: one operation, traced line by line. Labels are
   drawn from the SAME dictionary rows the model list uses, so no language
   can drift from its own claims. */
function OperationTrace({ items }: { items: [string, string][] }) {
  return (
    <InstrumentFrame tone="night" proof="operation-cutaway" className="p-5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#767C86]">
        operation · trace
      </p>
      <ol className="mt-4 grid gap-0 font-mono text-[12px] leading-[1.5]">
        {items.map(([label], i) => (
          <li
            key={label}
            className="grid grid-cols-[3.25rem_1fr] items-baseline gap-3 border-t border-white/8 py-2.5 first:border-t-0"
          >
            <span className="tabular-nums text-[#5B6069]">{String(i + 1).padStart(2, "0")} ▸</span>
            <span className="text-[#c7ccd4]">{label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-[#C9A76A]/40 pt-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#E2C486]">
        ✓ delivery + evidence
      </p>
    </InstrumentFrame>
  );
}

export default async function InsidePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = INSIDE_I18N[lang];

  return (
    <PublicShell variant="night" lang={lang} path="/inside" concierge={pageConcierge("inside", lang)}>
      <div className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-14 sm:pt-20">
        <Kicker>{t.kicker}</Kicker>
        <h1 className="mt-5 max-w-[22ch] text-[clamp(2rem,5.2vw,3.4rem)] font-semibold leading-[1.06] tracking-[-0.032em]">
          {t.h1}
        </h1>
        <p className="mt-6 max-w-[64ch] text-[17px] leading-[1.65] text-[#9AA1AB]">{t.lede}</p>

        {/* ── THE CUTAWAY: six passages beside the traced operation ────── */}
        <section className="mt-16">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#767C86]">
            {t.model.h2}
          </h2>
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:gap-14">
            <ol>
              {t.model.items.map(([label, body], i) => (
                <Passage
                  key={label}
                  index={String(i + 1).padStart(2, "0")}
                  title={label}
                  last={i === t.model.items.length - 1}
                >
                  {body}
                </Passage>
              ))}
            </ol>
            <div className="lg:sticky lg:top-24 lg:self-start">
              <OperationTrace items={t.model.items} />
            </div>
          </div>
        </section>

        {/* ── THE METHOD: full prose, one keyboard disclosure ──────────── */}
        <section className="mt-16 border-t border-white/10 pt-8">
          <details className="group">
            <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-[0.16em] text-[#767C86] transition-colors hover:text-[#E2C486] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C486]">
              <span aria-hidden className="mr-2 inline-block transition-transform group-open:rotate-90">▸</span>
              {t.method.h2}
            </summary>
            <p className="mt-4 max-w-[66ch] text-[15px] leading-[1.7] text-[#C9CDD3]">
              {t.method.body}
            </p>
          </details>
        </section>

        {/* ── THE TRUTH REGISTRY: three honest columns + refusals ──────── */}
        <section className="mt-16">
          <h2 className="text-[clamp(1.3rem,2.6vw,1.7rem)] font-semibold tracking-[-0.02em]">
            {t.registry.h2}
          </h2>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-[1.6] text-[#9AA1AB]">
            {t.registry.intro}
          </p>

          <div className="mt-9 grid gap-6 lg:grid-cols-3" data-proof="truth-registry">
            <InstrumentFrame tone="night" className="p-5">
              <StateChip kind="live" tone="night">
                <span className="border-b-2 border-[#1E7F5C] pb-px text-[#F7F6F3]">{t.registry.available.label}</span>
              </StateChip>
              <ul className="mt-5 grid gap-4">
                {t.registry.available.items.map(([claim, detail]) => (
                  <li key={claim}>
                    <p className="text-[13.5px] font-medium leading-[1.45] text-white">{claim}</p>
                    <p className="mt-0.5 text-[12.5px] leading-[1.55] text-[#9AA1AB]">{detail}</p>
                  </li>
                ))}
              </ul>
            </InstrumentFrame>

            <InstrumentFrame tone="night" className="p-5">
              <StateChip kind="building" tone="night">
                <span className="text-[#D98324]">{t.registry.building.label}</span>
              </StateChip>
              <ul className="mt-5 grid gap-4">
                {t.registry.building.items.map(([claim, detail]) => (
                  <li key={claim}>
                    <p className="text-[13.5px] font-medium leading-[1.45] text-white">{claim}</p>
                    <p className="mt-0.5 text-[12.5px] leading-[1.55] text-[#9AA1AB]">{detail}</p>
                  </li>
                ))}
              </ul>
            </InstrumentFrame>

            <div className="grid content-start gap-6">
              <InstrumentFrame tone="night" className="p-5">
                <StateChip kind="building" tone="night">
                  <span className="text-[#8A9099]">{t.registry.vision.label}</span>
                </StateChip>
                <ul className="mt-5 grid gap-4">
                  {t.registry.vision.items.map(([claim, detail]) => (
                    <li key={claim}>
                      <p className="text-[13.5px] font-medium leading-[1.45] text-[#c7ccd4]">{claim}</p>
                      <p className="mt-0.5 text-[12.5px] leading-[1.55] text-[#8A9099]">{detail}</p>
                    </li>
                  ))}
                </ul>
              </InstrumentFrame>

              <InstrumentFrame tone="night" className="p-5">
                <StateChip kind="refused" tone="night">{t.boundaries.h2}</StateChip>
                <p className="mt-4 text-[12.5px] leading-[1.6] text-[#9AA1AB]">{t.boundaries.body}</p>
              </InstrumentFrame>
            </div>
          </div>
        </section>

        {/* ── CTA ─────────────────────────────────────────────────────── */}
        <section className="mt-16 border-t border-white/10 pt-10">
          <p className="text-[19px] font-medium tracking-[-0.01em] text-white">{t.cta.line}</p>
          <Link
            href="/register"
            className="lift mt-6 inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {t.cta.button}
          </Link>
        </section>
      </div>
    </PublicShell>
  );
}
