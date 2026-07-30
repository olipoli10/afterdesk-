import Link from "next/link";
import { cookies } from "next/headers";
import { Reveal } from "@/components/reveal";
import { getSettings } from "@/lib/settings";
import { TrustLinks } from "@/components/trust-links";
import { LangSwitch } from "@/components/lang-switch";
import { SITE_LANGS, langAlternates } from "@/lib/i18n/langs";
import { PROTOCOL_I18N, docLangOf } from "@/lib/i18n/docs";

/* ─────────────────────────────────────────────────────────────────────────
   THE PROTOCOL — the operating rules published as a drawing, not a table.

   This page used to be one white card holding six identical 14px rows,
   followed by two more sections of the same rows: thirteen in total, ~90%
   of the page's pixels set at one size in one colour in one grid. It read
   as flat, and it was.

   Two things fix that, and they are deliberately different in kind:

   1. A TYPE LADDER (from the "contract" direction). One opening statement
      at ~6x body size, four movement rules on the whole page instead of a
      hairline between every row, and every number pulled OUT of its
      sentence and set large in the margin. Zero graphics added by this
      half — the hierarchy alone does the work.

   2. ONE DRAWING (from the "instrument" direction). The six stages are
      positions on a single continuous path descending through three lanes —
      YOU · OPERATOR · NIGHT. The path goes paper-coloured inside the night
      because it IS inside the night there, and ends in a dashed tail
      because the record stops existing. "You never meet the worker" is
      drawn here rather than asserted: the ink line never reaches the night
      lane, and the paper line never leaves it.

   Everything below the plate is a DIFFERENT shape on purpose — a 1px-gap
   detail box, a hatched note, a revision table — so no two blocks on the
   page scan the same way.

   Paper surface. Palette is the site's: paper #F7F6F3 · ink #14161A ·
   night #0A0B0D · muted #5B6069. No green (nothing here is money), no
   amber (nothing here is returned work).
   ───────────────────────────────────────────────────────────────────────── */

/* The protocol numbers must track the live Setting table, never freeze at
   build time. */
export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const t = PROTOCOL_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/how-it-works", sp.lang),
  };
}

export default async function HowItWorks({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const settings = await getSettings();
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = PROTOCOL_I18N[lang];
  const stages = t.stages(settings);

  return (
    /* lang on the subtree: the root <html> is en, and screen readers must
       switch voice for the translated copy. */
    <div lang={lang} className="min-h-screen overflow-x-clip bg-[#F7F6F3]">
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#F7F6F3]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[900px] items-center justify-between gap-3 px-6">
          <Link
            href="/"
            className="whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.22em] text-[#14161A]"
          >
            Second Shift
          </Link>
          <div className="flex items-center gap-3 text-[13px] font-medium sm:gap-5">
            <LangSwitch
              path="/how-it-works"
              current={lang}
              options={SITE_LANGS}
              tone="paper"
            />
            <Link
              href="/about"
              className="border-b border-[#14161A]/20 pb-0.5 text-[#14161A] transition-colors hover:border-[#14161A]"
            >
              {t.nav.about}
            </Link>
            <Link
              href="/"
              className="hidden text-[#5B6069] transition-colors hover:text-[#14161A] sm:block"
            >
              {t.nav.client}
            </Link>
            <Link
              href="/workers"
              className="hidden text-[#5B6069] transition-colors hover:text-[#14161A] sm:block"
            >
              {t.nav.workers}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-6 pb-24 pt-14 sm:pt-20">
        {/* ── THE DOCKET ────────────────────────────────────────────────── */}
        <p className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5B6069]">
          <span className="whitespace-nowrap">{t.docket} · v1</span>
          <i aria-hidden className="h-px flex-auto bg-[#14161A]/12" />
          <span className="whitespace-nowrap">2026-07-30</span>
        </p>

        {/* ── THE OPENING STATEMENT — the largest thing on the page ──────
            Same three sentences the page always opened with. The fix is
            that they are now set at roughly six times body size instead of
            competing with a 14px row for attention. */}
        <h1 className="mt-7 text-[clamp(2.5rem,8vw,4.5rem)] font-semibold leading-[0.96] tracking-[-0.038em] text-[#14161A]">
          {t.h1.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        {/* The audit's E-E-A-T finding stands (a payments product with no
            named human), but naming the operator is on hold for now — see
            the commit that removed the name for why. Restore a name here
            when that changes. */}
        <p className="mt-7 max-w-[34ch] text-[19px] leading-[1.5] text-[#5B6069]">
          {t.deck}
        </p>

        {/* ── MOVEMENT I — THE PLATE ────────────────────────────────────── */}
        <hr className="mt-16 border-0 border-t border-[#14161A]/12" />
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5B6069]">
          {t.movement1}
        </p>

        {/* The drawing is aria-hidden — a decorative path and six squares
            say nothing to a screen reader. The stage rows beside it are
            real text and carry the whole protocol on their own, so nothing
            is lost; this sentence just states the shape they are drawn in. */}
        <p className="sr-only">
          {t.movement1}: {t.lanes.join(" · ")}.
        </p>

        <Reveal className="mt-8">
          <figure className="plate px-4 py-6 sm:px-7 sm:py-7">
            {/* lane headers — the drawing's key, on wide screens */}
            <div className="mb-3 grid grid-cols-[40px_264px_minmax(0,1fr)] gap-x-[22px] max-[859px]:hidden">
              <span aria-hidden />
              <span className="grid grid-cols-3">
                {t.lanes.map((lane) => (
                  <span
                    key={lane}
                    className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-[#5B6069]"
                  >
                    {lane}
                  </span>
                ))}
              </span>
              <span className="pl-[22px] font-mono text-[10px] uppercase tracking-[0.14em] text-[#5B6069]">
                {t.axis}
              </span>
            </div>

            {/* the same key, as a legend, once the lanes are too narrow to
                label in place */}
            <div
              aria-hidden
              className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#5B6069] min-[860px]:hidden"
            >
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-[11px] w-[11px] border border-[#14161A]/25 bg-[#F7F6F3]" />
                {t.lanes[0]}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="hatch inline-block h-[11px] w-[11px] border border-[#14161A]/25" />
                {t.lanes[1]}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-[11px] w-[11px] bg-[#0A0B0D]" />
                {t.lanes[2]}
              </span>
            </div>

            <div className="pp-stages">
              {/* ── THE RAIL: three lanes, one path, six marks ─────────── */}
              <div className="pp-rail" aria-hidden>
                <div className="pp-band pp-band-you" />
                <div className="pp-band pp-band-op" />
                <div className="pp-band pp-band-night" />

                <svg viewBox="0 0 264 456" preserveAspectRatio="none" focusable="false">
                  {/* A · ink, from you down through the operator band */}
                  <path
                    d="M 44 6 V 76 H 132 V 152 H 176"
                    fill="none"
                    stroke="#14161A"
                    strokeWidth="2"
                    strokeLinecap="butt"
                    strokeLinejoin="miter"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* B · the SAME line inverted, because it is inside the night */}
                  <path
                    d="M 176 152 H 220 V 228 H 176"
                    fill="none"
                    stroke="#F7F6F3"
                    strokeWidth="2"
                    strokeLinecap="butt"
                    strokeLinejoin="miter"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* C · ink, back out through the operator band to you */}
                  <path
                    d="M 176 228 H 132 V 304 H 44 V 418"
                    fill="none"
                    stroke="#14161A"
                    strokeWidth="2"
                    strokeLinecap="butt"
                    strokeLinejoin="miter"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* C2 · dashed tail — the record no longer exists */}
                  <path
                    d="M 44 418 V 446"
                    fill="none"
                    stroke="#14161A"
                    strokeWidth="2"
                    strokeDasharray="3 5"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d="M 32 447 H 56"
                    fill="none"
                    stroke="#14161A"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                {/* marks sit at the centre of each sixth, on the lane the
                    stage happens in */}
                <i className="pp-mark" style={{ left: "16.67%", top: "8.33%" }} />
                <i className="pp-mark" style={{ left: "50%", top: "25%" }} />
                <i
                  className="pp-mark pp-mark-night"
                  style={{ left: "83.33%", top: "41.67%" }}
                />
                <i className="pp-mark" style={{ left: "50%", top: "58.33%" }} />
                <i className="pp-mark" style={{ left: "16.67%", top: "75%" }} />
                <i className="pp-mark" style={{ left: "16.67%", top: "91.67%" }} />

                {/* DETAIL A, ringed on stage 04 the way a drawing calls out
                    a blow-up. The box it points at is directly below. */}
                <i className="pp-ring" style={{ left: "50%", top: "58.33%" }} />
                <i
                  className="pp-leader"
                  style={{ left: "calc(50% + 15px)", top: "58.33%", width: "74px" }}
                />
                <span
                  className="pp-tag font-mono text-[10px] tracking-[0.12em] text-[#14161A]"
                  style={{ left: "calc(50% + 89px)", top: "58.33%" }}
                >
                  A
                </span>
              </div>

              {/* ── the six stages ─────────────────────────────────────── */}
              {stages.map((stage, i) => (
                <div key={stage.label} className="pp-row">
                  <span className="pp-clause font-mono text-[10px] tabular-nums text-[#5B6069]">
                    §{String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="pp-spacer" aria-hidden />
                  <div className="pp-body">
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#14161A]">
                      {stage.label}
                    </p>
                    <p className="pp-say mt-1 text-[15px] leading-[1.4] text-[#5B6069]">
                      {stage.say}
                    </p>
                  </div>
                  {stage.val ? (
                    <span className="pp-dim">
                      <span className="block font-mono text-[15px] tabular-nums leading-tight text-[#14161A]">
                        {stage.val}
                      </span>
                      <span className="pp-unit mt-[3px] block font-mono text-[9px] uppercase tracking-[0.14em] text-[#5B6069]">
                        {stage.unit}
                      </span>
                    </span>
                  ) : (
                    /* the fourth grid cell still has to exist on wide
                       screens or the body would fall into the rail's
                       column; on the compact layout it is removed */
                    <span aria-hidden className="max-[859px]:hidden" />
                  )}
                </div>
              ))}
            </div>

            {/* ── title block — a drawing sheet signs itself ──────────── */}
            <figcaption className="ml-auto mt-6 w-full border border-[#14161A]/16 bg-[#F7F6F3] sm:w-[360px]">
              {t.titleblock.map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-[92px_minmax(0,1fr)] border-b border-[#14161A]/12 font-mono text-[10px] uppercase tracking-[0.08em] last:border-b-0"
                >
                  <span className="border-r border-[#14161A]/12 px-2 py-1.5 text-[#5B6069]">
                    {k}
                  </span>
                  <span className="px-2 py-1.5 text-[#14161A]">{v}</span>
                </div>
              ))}
            </figcaption>
          </figure>
        </Reveal>

        {/* ── MOVEMENT II — THE CLAUSES ─────────────────────────────────── */}
        <hr className="mt-16 border-0 border-t border-[#14161A]/12" />
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5B6069]">
          {t.movement2}
        </p>

        {/* DETAIL A — a 1px-gap grid where the GAP paints the hairlines. A
            shape that appears nowhere else on the site. */}
        <Reveal className="mt-6">
          <section className="border border-[#14161A]/16">
            <h2 className="border-b border-[#14161A]/16 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#14161A]">
              {t.detail.head} <span className="text-[#5B6069]">· {t.detail.sub}</span>
            </h2>
            <div className="grid gap-px bg-[#14161A]/10 sm:grid-cols-2">
              {t.detail.criteria.map(([k, v]) => (
                <div key={k} className="bg-[#F7F6F3] px-4 py-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#14161A]">
                    {k}
                  </p>
                  <p className="mt-1 text-[14px] leading-[1.45] text-[#5B6069]">{v}</p>
                </div>
              ))}
            </div>
            <p className="border-t border-[#14161A]/16 px-4 py-3.5 text-[15px] leading-[1.5] text-[#14161A]">
              {t.detail.verdict}
            </p>
          </section>
        </Reveal>

        {/* NOT IN SCOPE — a hatched margin note, the third shape */}
        <Reveal className="mt-8">
          <section className="relative pl-5">
            <span aria-hidden className="pp-spine" />
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
              {t.scope.head}
            </h2>
            <ul className="mt-2.5">
              {t.scope.items.map((item) => (
                <li key={item} className="py-0.5 text-[14px] leading-[1.55] text-[#14161A]">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>

        {/* ── REVISIONS ─────────────────────────────────────────────────
            The old page closed on "Changes to this protocol are versioned
            and dated here" — a promise with nothing behind it. This is the
            table that promise described; it grows every time the protocol
            actually changes. */}
        <Reveal className="mt-16">
          <hr className="border-0 border-t border-[#14161A]/12" />
          <h2 className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5B6069]">
            {t.revisions.head}
          </h2>
          <table className="mt-3 w-full border-collapse font-mono text-[11px] tabular-nums">
            <thead>
              <tr>
                {t.revisions.cols.map((col, i) => (
                  <th
                    key={col}
                    scope="col"
                    className={`border-b border-[#14161A]/22 py-1.5 text-left font-normal uppercase tracking-[0.12em] text-[#5B6069] ${
                      i === 0 ? "w-[60px]" : i === 1 ? "w-[130px]" : ""
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.revisions.rows.map(([rev, date, change]) => (
                <tr key={rev}>
                  <td className="border-b border-[#14161A]/10 py-2.5 text-[#14161A]">{rev}</td>
                  <td className="border-b border-[#14161A]/10 py-2.5 text-[#14161A]">{date}</td>
                  <td className="border-b border-[#14161A]/10 py-2.5 text-[#14161A]">
                    {change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>

        {/* ── BOOKEND ───────────────────────────────────────────────────── */}
        <Reveal className="mt-14">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[#0A0B0D] px-6 py-8">
            <p className="text-[18px] font-semibold tracking-[-0.02em]">
              <span className="text-[#767C86]">{t.bookend.dim} </span>
              <span className="text-white">{t.bookend.lit}</span>
            </p>
            <Link
              href="/register"
              className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[14px] font-medium text-[#14161A] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {t.bookend.cta}
            </Link>
          </div>
        </Reveal>
      </main>

      <footer className="border-t border-black/8">
        <div className="mx-auto flex w-full max-w-[900px] flex-wrap items-center justify-between gap-4 px-6 py-6 text-[12px]">
          <span className="font-mono uppercase tracking-[0.16em] text-[#14161A]">
            Second Shift
          </span>
          <TrustLinks />
        </div>
      </footer>
    </div>
  );
}
