import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/logo";
import { cookies } from "next/headers";
import { getSessionUser, roleHome } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { Reveal } from "@/components/reveal";
import { AudienceToggle } from "@/components/audience-toggle";
import { PublicCounters } from "@/components/public-counters";
import { LiveTaskWindow } from "@/components/live-task-window";
import { FloatingLinks } from "@/components/floating-links";
import { PointerGlow } from "@/components/pointer-glow";
import { LangSwitch } from "@/components/lang-switch";
import { PaperLedgerScan } from "@/components/paper-ledger-scan";
import { PaperInstrument } from "@/components/paper-instrument";
import { PaperReviewDesk } from "@/components/paper-review-desk";
import { TrustLinks } from "@/components/trust-links";
import { CLIENT_I18N, CLIENT_LANGS, clientLangOf } from "@/lib/i18n/client";
import { SITE_URL } from "@/lib/site";

/* ─────────────────────────────────────────────────────────────────────────
   The landing page is a picture, not an essay: a real file arriving broken at
   night and leaving clean in the morning. Everything else is caption.
   Palette: night #0A0B0D / surface #111317 / dusk #1B2740 / paper #F7F6F3 /
   ink #14161A. Amber appears ONLY on damaged cells; green ONLY on fixed rows.
   Motion: entrance rise on the hero, scroll-reveals below the fold, two
   ambient loops (hero glow, seam nudge) — all gated on prefers-reduced-motion.
   ───────────────────────────────────────────────────────────────────────── */

/* Every visible string lives in src/lib/i18n/client.ts (EN/FR/ES). The rule:
   the VOICE translates, the MACHINE (live artifacts, mono field labels,
   clock times, filenames) stays English. */

const NOISE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
};

export const metadata = {
  alternates: { canonical: "/" },
};

/**
 * The canonical Organization node. Every course page's Course.provider points
 * at this @id rather than restating the org, so there is exactly one place
 * that describes the company and no chance of two nodes disagreeing.
 *
 * Nothing here is aspirational: no aggregateRating (there are no ratings), no
 * sameAs (there are no profiles yet), no logo until a real one is exported to
 * public/. Structured data that claims more than the business has is worse
 * than none.
 */
const ORG_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "AfterDesk",
  url: SITE_URL,
  description:
    "Describe any task in plain English — priced fixed, done overnight by a vetted specialist, reviewed before it reaches you.",
});

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect(roleHome(user.role));
  const settings = await getSettings();
  const sp = await searchParams;
  const cookieStore = await cookies();
  const lang = clientLangOf(sp.lang ?? cookieStore.get("ss-lang-client")?.value);
  const t = CLIENT_I18N[lang];
  /* Four chapters. Two were cut, for the same reason both times — they
     restated what a neighbour already showed. The old 06/06 was a GENERAL
     NOTES block summarising the chapters above it (its two genuinely new
     clauses, retention and refusals, now live on /how-it-works); the old
     01/05 was the overnight-diff artifact, which repeated the hero's own
     task window. */
  const ch = (n: string, label: string) => (
    <>
      {n}
      <span className="opacity-50">/04</span> · {label}
    </>
  );
  /* On the paper half the chapter number is a drawing number: it grows a
     leader line out to the plate edge, the way a plate is called out on a
     drawing set. Zero words, all structure. */
  const plateCh = (n: string, label: string) => (
    <p className="mb-3 flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
      <span className="whitespace-nowrap">{ch(n, label)}</span>
      <i aria-hidden className="chapter-leader" />
    </p>
  );
  /* The published range is COMPUTED from the rows that are actually shown —
     never typed by hand, so it can never drift from the evidence above it.
     The rows themselves are guarded against colliding with the worker page
     (see the note in src/lib/i18n/client.ts), which is what keeps the margin
     underivable across the two pages. */
  const amounts = t.ch03.rows
    .map(([, , price]) => Number(price.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const ledgerRange = amounts.length
    ? `$${Math.min(...amounts)}–$${Math.max(...amounts)}`
    : "";

  return (
    /* lang on the subtree: the root <html> is en, and screen readers must
       switch voice for the translated copy. */
    <div lang={lang} className="overflow-x-clip bg-[#0A0B0D]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ORG_JSONLD }}
      />
      {/* ── NAV — sticky, blurred ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0A0B0D]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-2 px-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-6">
          <Wordmark tone="paper" className="text-[11px] sm:text-[13px]" />
          <AudienceToggle side="client" tone="night" />
          <div className="flex items-center justify-end gap-2 sm:gap-5">
            <LangSwitch path="/" current={lang} options={CLIENT_LANGS} tone="night" />
            {/* Promoted out of the footer: this is the story page, and a story
                nobody can find is not a story. Hidden on mobile alongside Sign
                in — the header only has room for the toggle and the CTA there. */}
            <Link
              href="/about"
              className="hidden text-[12px] font-medium text-[#8A9099] transition-colors hover:text-white sm:block sm:text-[13px]"
            >
              {t.footer.about}
            </Link>
            <Link
              href="/login"
              className="hidden text-[12px] font-medium text-[#8A9099] transition-colors hover:text-white sm:block sm:text-[13px]"
            >
              {t.nav.signIn}
            </Link>
            <Link
              href="/register"
              className="lift hidden min-h-11 items-center rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[13px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_6px_24px_rgba(247,246,243,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:inline-flex"
            >
              {t.nav.send}
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* ambient glow + film grain */}
        <div aria-hidden className="night-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="hero-glow glow-dusk pointer-events-none absolute -top-48 left-[2%] h-[640px] w-[900px]"
        />
        <div
          aria-hidden
          className="glow-drift glow-dusk pointer-events-none absolute right-[0%] top-[20%] h-[480px] w-[640px]"
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04]" style={NOISE} />
        <PointerGlow />

        <div className="relative mx-auto grid w-full max-w-[1120px] gap-12 px-6 pb-4 pt-10 sm:pt-28 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            {/* Phone-only: the two links the header has no room for. */}
            <FloatingLinks
              tone="night"
              aboutLabel={t.footer.about}
              signInLabel={t.nav.signIn}
              className="anim-rise mb-9"
            />
            <h1 className="max-w-[17ch] text-[clamp(2.75rem,6.5vw,5rem)] font-semibold leading-[1.01] tracking-[-0.035em]">
              <span className="anim-rise block text-[#767C86]">{t.hero.line1}</span>
              <span className="anim-rise d-1 block text-white">{t.hero.line2}</span>
            </h1>
            <p className="anim-rise d-2 mt-6 max-w-[52ch] text-[17px] leading-[1.5] text-[#9AA1AB]">
              {t.hero.sub(settings.quoteTurnaroundHours)}
            </p>
            <div className="anim-rise d-3 mt-8">
              <Link
                href="/register"
                className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_10px_36px_rgba(247,246,243,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {t.hero.cta}
              </Link>
            </div>
          </div>

          {/* The product IS the hero image — and it's ALIVE: one task's whole
              life plays in the window, then loops. */}
          <p className="sr-only">
            Product preview: a task titled &ldquo;Clean a 1,800-row supplier price
            list&rdquo; is received at 6:41 PM, priced $74 by the operator 34 minutes
            later, approved, done overnight by a vetted specialist, and passes review
            by 7:07 AM.
          </p>
          {/* Phones don't get this. It and the quote slip in chapter 01 are
              both dark mono cards carrying a task name, a detail list and a
              price, and stacked vertically on a phone they scan as the same
              artifact shown twice rather than as two different points (a
              task's whole night here, the price object there). The slip is
              the one that survives: it is the one carrying NEW information,
              and it has captions under it that the window does not. */}
          <div aria-hidden className="anim-rise d-3 hidden sm:block">
            <LiveTaskWindow />
          </div>
        </div>

        {/* live counters — the proof, at the moment of the promise */}
        <PublicCounters tone="night" variant="strip" className="anim-rise d-4 mt-12" />
      </section>

      {/* ── THE RECEIPT ───────────────────────────────────────────────── */}
      {/* The overnight-diff artifact used to sit above this, as chapter 01.
          It was cut: the hero's own task window already plays a task's whole
          life, so a second looping before/after demo restated the promise a
          third time (headline, window, diff) and cost most of a phone screen
          to do it. The receipt below is the first thing that adds NEW
          information — the price — so it opens the set now. */}
      <section className="border-t border-white/8">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-24">
          <Reveal>
            <p className="mb-10 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
              {ch("01", t.ch02.label)}
            </p>
            <div className="mx-auto max-w-[420px]">
              <div className="lift rounded-xl border border-white/10 bg-[#111317] p-5 font-mono text-[12px] transition-colors hover:border-white/20 hover:bg-[#15171B]">
                <div className="flex items-center justify-between border-b border-white/8 pb-3 text-[#8A9099]">
                  <span>QUOTE #0412</span>
                  <span className="text-white">FIXED</span>
                </div>
                {[
                  ["TASK", "Dedupe 142-row lead export"],
                  ["SCOPE", "Merge on email, fix names, verify"],
                  ["RETURNS", "7:07 AM ET"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-white/6 py-2.5">
                    <span className="shrink-0 text-[#8A9099]">{k}</span>
                    <span className="text-right text-[#C9CDD3]">{v}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between pt-4">
                  <span className="text-[#8A9099]">TOTAL</span>
                  <span className="text-[32px] font-medium tabular-nums leading-none text-white">
                    $68
                  </span>
                </div>
                <p className="mt-2 text-right text-[11px] text-[#8A9099]">{t.ch02.noMeter}</p>
                <div className="mt-5 flex gap-2">
                  <span className="flex-1 rounded bg-[#F7F6F3] py-2 text-center text-[11px] text-[#14161A]">
                    APPROVE
                  </span>
                  <span className="flex-1 rounded border border-white/15 py-2 text-center text-[11px] text-[#8A9099]">
                    ASK A QUESTION
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-3 font-mono text-[12px] text-[#767C86] sm:grid-cols-3">
                {t.ch02.captions.map((c) => (
                  <p key={c} className="srow">
                    {c}
                  </p>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 03/06 THE INDEX PLATE (paper) ─────────────────────────────
             The flat table becomes a printed bill of materials that scans
             itself: nothing carries a price until the operator passes over
             it. The range under it is computed from the rows above it. */}
      <section className="relative overflow-hidden bg-[#F7F6F3]">
        <PointerGlow tone="paper" />
        <div className="relative mx-auto w-full max-w-[920px] px-4 py-16 sm:px-6 sm:py-24">
          <Reveal replay>
            <div className="plate px-5 py-10 sm:px-9 sm:py-12">
              {plateCh("02", t.ch03.label)}
              <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
                {t.ch03.h2}
              </h2>
              <PaperLedgerScan
                rows={t.ch03.rows}
                note={t.ch03.note}
                range={ledgerRange}
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 04/06 THE INSTRUMENT (paper) ──────────────────────────────
             The decorative sweep is retired. The band becomes a measured
             24-hour ruler with a needle at the real New York clock, and the
             four stations light only while the needle is inside them — with
             an explicit idle state, because a lit station would otherwise
             imply work is underway when it is not. */}
      <section className="relative overflow-hidden border-t border-black/8 bg-[#F7F6F3]">
        <PointerGlow tone="paper" />
        <div className="relative mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24">
          <Reveal replay>
            <div className="plate px-5 py-10 sm:px-9 sm:py-12">
              {plateCh("03", t.ch04.label)}
              <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
                {t.ch04.h2}
              </h2>
              <PaperInstrument
                laneYou={t.ch04.laneYou}
                laneThem={t.ch04.laneThem}
                note={t.ch04.note}
                steps={t.ch04.steps}
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 05/06 THE SECTION CUT (paper) ─────────────────────────────
             The artifact demonstrates the review; the wall states the rule.
             THERE and HERE are drawn as an architectural section with a 45°
             hatched OPERATOR band between them: facing statements arrive
             from their own side, decelerate, and stop dead at the hatch.
             Nothing crosses it — that used to be a sentence, and the
             sentence is now deleted because the picture says it. */}
      <section className="relative overflow-hidden border-t border-black/8 bg-[#F7F6F3]">
        <div className="relative mx-auto w-full max-w-[920px] px-4 py-16 sm:px-6 sm:py-24">
          <Reveal replay>
            <div className="plate px-5 py-10 sm:px-9 sm:py-12">
              {plateCh("04", t.ch05.label)}
              <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
                {t.ch05.h2}
              </h2>
              {/* The one sentence rescued from the deleted notes block. It is
                  the strangest fact about this product and the only one no
                  competitor can copy without rebuilding their company. */}
              <p className="mt-4 max-w-[44ch] text-[18px] leading-snug tracking-[-0.01em] text-[#14161A]">
                {t.ch05.never}
              </p>

              <PaperReviewDesk caption={t.ch05.desk} />

              <div className="mt-12">
                <div className="mb-2 hidden grid-cols-[1fr_2.75rem_1fr] md:grid">
                  <span className="pr-5 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-[#5B6069]">
                    {t.ch05.there}
                  </span>
                  <span aria-hidden />
                  <span className="pl-5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#5B6069]">
                    {t.ch05.here}
                  </span>
                </div>

                {/* mobile: the THERE/HERE labels above live inside a md:grid,
                    so on a phone the stacked pairs used to arrive with no
                    labels at all — four unattributed sentences either side of
                    a hatch. This states the order once, in the same
                    three-part grammar (muted · wall · ink) every row repeats,
                    and absorbs the wall band that used to sit here alone. */}
                <div className="mb-6 md:hidden">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A9099]">
                    {t.ch05.keyLabel}
                  </p>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#5B6069]">
                    {t.ch05.there}
                  </p>
                  <div
                    aria-hidden
                    className="hatch my-2 flex h-8 items-center justify-center"
                  >
                    <span className="bg-[#F7F6F3] px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#5B6069]">
                      {t.ch05.wall}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#14161A]">
                    {t.ch05.here}
                  </p>
                </div>

                <div className="relative">
                  {/* the wall itself — one hatched band, full height */}
                  <div
                    aria-hidden
                    className="hatch absolute inset-y-0 left-1/2 hidden w-[2.75rem] -translate-x-1/2 items-center justify-center md:flex"
                  >
                    <span className="hatch-label bg-[#F7F6F3] px-1 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#5B6069]">
                      {t.ch05.wall}
                    </span>
                  </div>

                  {t.ch05.pairs.map(([there, here]) => (
                    <div
                      key={there}
                      className="cut-row grid items-center border-b border-black/8 py-4 md:grid-cols-[1fr_2.75rem_1fr]"
                    >
                      <p className="arrive-l text-[14px] leading-relaxed text-[#5B6069] md:pr-5 md:text-right">
                        {there}
                      </p>
                      <span aria-hidden className="hatch my-3 block h-3 md:my-0 md:hidden" />
                      <span aria-hidden className="hidden md:block" />
                      <p className="arrive-r text-[14px] leading-relaxed text-[#14161A] md:pl-5">
                        {here}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CLOSING — the sheet is trimmed, the night resumes ──────────
             The paper half ends on a real trim edge with crop marks instead
             of just stopping, and the ink block inherits the same drafting
             frame inverted: paper-coloured corner ticks, a white hairline
             grid. Green stays money-only — it never touches this CTA.

             The GENERAL NOTES chapter that used to sit above this is gone.
             Four of its six clauses restated chapters 02–05 in smaller type;
             the two that carried new information (retention, refusals) are
             §06 and NOT IN SCOPE on the protocol page, so this is a pointer
             to the document rather than a sixth chapter repeating it. */}
      <section className="bg-[#F7F6F3] pb-16">
        <div className="mx-auto w-full max-w-[920px] px-4 sm:px-6">
          <p className="mb-8 text-right font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
            <Link
              href="/how-it-works"
              className="transition-colors hover:text-[#14161A]"
            >
              {t.close.protocol} <span aria-hidden>→</span>
            </Link>
          </p>
          <div aria-hidden className="trim-line mb-12 hidden sm:block" />
          <Reveal>
            <div className="plate plate--ink relative overflow-hidden bg-[#0A0B0D] px-6 py-16 text-center">
              <div
                aria-hidden
                className="hero-glow glow-dusk pointer-events-none absolute -top-24 left-1/2 h-[360px] w-[600px] -translate-x-1/2"
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04]" style={NOISE} />
              <div className="relative">
                <h2 className="text-[30px] font-semibold tracking-[-0.02em]">
                  <span className="block text-[#767C86]">{t.hero.line1}</span>
                  <span className="block text-white">{t.hero.line2}</span>
                </h2>
                <div className="mt-7">
                  <Link
                    href="/register"
                    className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_10px_36px_rgba(247,246,243,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {t.hero.cta}
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="border-t border-black/8 bg-[#F7F6F3]">
        <div className="mx-auto grid w-full max-w-[1120px] gap-4 px-6 py-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <Wordmark tone="ink" className="text-[12px]" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#5B6069] sm:justify-end">
            <Link href="/about" className="transition-colors hover:text-[#14161A]">
              {t.footer.about}
            </Link>
            <Link href="/how-it-works" className="transition-colors hover:text-[#14161A]">
              {t.footer.how}
            </Link>
            <Link href="/login" className="transition-colors hover:text-[#14161A]">
              {t.footer.signIn}
            </Link>
            <Link href="/workers" className="transition-colors hover:text-[#14161A]">
              {t.footer.work}
            </Link>
          </div>
          <div className="text-[12px] sm:col-span-2 sm:border-t sm:border-black/8 sm:pt-4">
            <TrustLinks />
          </div>
        </div>
      </footer>
    </div>
  );
}
