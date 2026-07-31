import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/logo";
import { cookies, headers } from "next/headers";
import { getSessionUser, roleHome } from "@/lib/authz";
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
    "Describe any task in plain language: priced fixed, done overnight by a vetted specialist, reviewed before it reaches you.",
});

/**
 * True when this request was started from one of our own pages instead of by
 * arriving at the bare root. Someone opening the root cold — bookmark, typed
 * address, a link from elsewhere — is opening the product; someone who clicked
 * their way here from inside AfterDesk is ASKING for the marketing site, and
 * that is the difference the bounce below has to respect.
 *
 * The referrer is the signal, and site-wide Referrer-Policy: same-origin
 * (next.config.ts) is what makes it a trustworthy one: a referrer naming our
 * own host can only have come from our own page. A next/link click carries it
 * too — the router fetches the RSC payload with a plain fetch() from the page
 * you are leaving. Do not "improve" this with the RSC or Next-URL header:
 * neither reaches a Server Component. Flight headers are stripped before
 * headers() (server/async-storage/request-store.js) and Next-URL is deleted
 * for any path that cannot be intercepted (server/base-server.js), which "/"
 * cannot. Both were measured null here, not assumed.
 */
async function arrivedFromInsideTheApp(): Promise<boolean> {
  const h = await headers();
  const host = h.get("host");
  const referer = h.get("referer");
  if (!host || !referer) return false;
  // Prefix match rather than new URL(): a malformed Referer is
  // attacker-controlled and must never be able to throw on the homepage.
  return referer.startsWith(`https://${host}/`) || referer.startsWith(`http://${host}/`);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const user = await getSessionUser();
  /* This used to bounce EVERY signed-in visitor to their portal, which sealed
     the last exit an unverified account has. Its portal is a closed door —
     requireUser() (src/lib/authz.ts) sends any unverified session straight to
     /verify-email — so "/" handing it to that portal turned every "← Back to
     site" in AuthShell into a loading flash that landed on the page it was
     clicked from. Two narrowings and the loop cannot form. An unverified
     session is never bounced: behind the gate there is nothing for it to see,
     so this page is its way out. A verified one is bounced only on a cold
     arrival at the bare root — anyone who clicked through from inside the app
     asked for the marketing site and gets it, which is the door back to
     /about, /how-it-works and the public Academy once you are signed in. */
  if (user?.emailVerified && !(await arrivedFromInsideTheApp())) {
    redirect(roleHome(user.role));
  }
  /* The door back into the app, or nothing at all for a stranger. An
     unverified session is pointed at the verification page rather than at
     roleHome(): that is a door which does not open for it, and requireUser()
     would only send it here anyway, one loading flash later. */
  const portal = user ? (user.emailVerified ? roleHome(user.role) : "/verify-email") : undefined;
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
          <AudienceToggle
            side="client"
            tone="night"
            clientLabel={t.nav.client}
            workersLabel={t.nav.workers}
          />
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
            {/* Signed in, this page is now reachable, so the two doors that
                only make sense to a stranger (sign in, sign up) become the one
                that makes sense to a customer: back to their own portal. */}
            {portal ? (
              <Link
                href={portal}
                className="lift hidden min-h-11 items-center rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[13px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_6px_24px_rgba(247,246,243,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:inline-flex"
              >
                {t.nav.portal}
              </Link>
            ) : (
              <>
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
              </>
            )}
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

        {/* Below lg this is ONE column, and the column order is the whole
            point. A phone used to scroll 2.5 screens of uninterrupted prose
            before it met anything that was not a sentence, so here the order
            is headline → the product itself → the door → the explanation.
            The two text blocks are grouped in a wrapper that is `contents` on
            a phone (so the window can be ordered between them) and a real box
            from lg up (so it is the left column of the two-column grid, in
            plain DOM order, exactly as before). One copy of every string. */}
        <div className="relative mx-auto flex w-full max-w-[1120px] flex-col px-6 pb-4 pt-10 sm:pt-28 lg:grid lg:grid-cols-[1fr_420px] lg:gap-12 lg:items-center">
          <div className="contents lg:block">
            <div className="order-1">
              {/* Phone-only: the two links the header has no room for. */}
              <FloatingLinks
                tone="night"
                aboutLabel={t.footer.about}
                signInLabel={portal ? t.nav.portal : t.nav.signIn}
                signInHref={portal}
                className="anim-rise mb-9"
              />
              <h1 className="max-w-[17ch] text-[clamp(2.75rem,6.5vw,5rem)] font-semibold leading-[1.01] tracking-[-0.035em]">
                <span className="anim-rise block text-[#767C86]">{t.hero.line1}</span>
                <span className="anim-rise d-1 block text-white">{t.hero.line2}</span>
              </h1>
            </div>

            <div className="anim-rise d-2 order-3 mt-8">
              <Link
                href="/register"
                className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_10px_36px_rgba(247,246,243,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {t.hero.cta}
              </Link>
              {/* Same micro-copy slot the Academy hero uses under its own
                  CTA ("You can start the first course tonight."): the literal
                  answer to "what actually happens if I click this," landed
                  in one breath, right where someone is deciding to click. The
                  shield is the one glyph on the page that means "protected,"
                  reused nowhere else, so it never has to compete for what it
                  points at. */}
              <p className="mt-3 flex items-start gap-1.5 font-mono text-[12px] text-[#767C86]">
                <svg viewBox="0 0 16 16" fill="none" className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[#5B6069]" aria-hidden>
                  <path
                    d="M8 1.5 13.5 3.5V7.5C13.5 11 11.2 13.3 8 14.5C4.8 13.3 2.5 11 2.5 7.5V3.5L8 1.5Z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                </svg>
                {t.hero.guarantee}
              </p>
            </div>
          </div>

          {/* The product IS the hero image — and it's ALIVE: one task's whole
              life plays in the window, then loops.

              Phones used to be denied it: stacked vertically, it and the quote
              slip in chapter 01 are both dark mono cards with a task name, a
              field list and two buttons, so they scanned as one artifact shown
              twice. That was the right observation and the wrong cut — the
              phone kept the sentences and lost every picture. The window is
              now the picture on every screen, and the duplication is settled
              at the other end: below lg the slip drops the field rows and the
              buttons that made it look like this card and keeps only what is
              new there, the total. */}
          <p className="sr-only">{t.hero.srPreview(t.liveWindow.taskTitle)}</p>
          <div aria-hidden className="anim-rise d-3 order-2 mt-10 lg:mt-0">
            <LiveTaskWindow copy={t.liveWindow} />
          </div>
        </div>

        {/* live counters — the proof, at the moment of the promise */}
        <PublicCounters tone="night" variant="strip" copy={t.counters} className="anim-rise d-4 mt-12" />
      </section>

      {/* ── WHAT THIS IS ──────────────────────────────────────────────────
             The very next thing after the hero, on purpose: what AfterDesk
             actually IS, who does the work, and the one rule (you don't pay
             for work that isn't right) that makes it safe to send a task to
             a stranger. Not a numbered chapter like 01-04 below — it has no
             number because it isn't part of that set, it's the answer to
             "wait, what is this" that has to land before anyone reads far
             enough to reach chapter 01. */}
      <section className="border-t border-white/8 bg-[#0D0E11]">
        {/* Three reveals, not one. This block is eleven text runs deep and on
            a phone it is the longest unbroken column on the page; wrapped in a
            single Reveal it arrived as one wall the moment its top edge
            crossed the threshold, which is the same as not animating at all.
            Split at its own seams — the statement, the process, the standing
            promises — each waits for its own turn, and the .srow rule staggers
            the rows inside it. Reveal itself is the reduced-motion gate: it
            only arms when motion is wanted, so this stays a plain column for
            anyone who asked for one. */}
        <div className="mx-auto w-full max-w-[1120px] px-6 py-16 sm:py-20">
          <Reveal>
            <p className="srow font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
              {t.whatWeAre.label}
            </p>
            {/* AfterDesk set in the wordmark's own treatment (mono,
                uppercase, tracked — src/components/logo.tsx) so the brand
                reads as a mark planted mid-sentence, not just another word.
                The sentence around it drops to a paler, lighter weight in
                the same motion, so the name is what actually pops instead
                of everything competing at the same weight. */}
            <h2 className="srow mt-3 max-w-[28ch] text-[clamp(1.3rem,2.9vw,1.85rem)] font-medium leading-[1.25] tracking-[-0.015em] text-[#9AA1AB]">
              {t.whatWeAre.h2[0]}
              <span className="font-mono text-[1.05em] font-bold uppercase tracking-[0.12em] text-white">
                AfterDesk
              </span>
              {t.whatWeAre.h2[1]}
            </h2>
            <p className="srow mt-4 max-w-[62ch] text-[15px] leading-[1.65] text-[#9AA1AB] sm:text-[16px]">
              {t.whatWeAre.intro}
            </p>
          </Reveal>
          <Reveal className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {t.whatWeAre.steps.map(([label, body], i) => (
              <div key={label} className="srow">
                <p className="font-mono text-[13px] tabular-nums tracking-[-0.01em] text-[#5B6069]">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-1.5 text-[16px] font-medium text-white">{label}</p>
                <p className="mt-1.5 text-[14px] leading-[1.55] text-[#9AA1AB]">{body}</p>
              </div>
            ))}
          </Reveal>
        </div>
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
                  {/* "QUOTE #0412" is a machine ID and stays literal. */}
                  <span>QUOTE #0412</span>
                  <span className="text-white">{t.ch02.fixed}</span>
                </div>
                {/* Below lg the SCOPE and RETURNS rows are dropped, and so are
                    the two buttons under the total. Both are the hero window's
                    own furniture, and on one narrow column this slip sits
                    directly beneath that window in the scroll — with them it
                    is the same card a second time, without them it is what it
                    was always for: the price, alone, with its captions. */}
                {[
                  [t.ch02.fieldTask, t.ch02.taskValue, ""],
                  [t.ch02.fieldScope, t.ch02.scopeValue, "hidden lg:flex"],
                  // The RETURNS value is a literal clock time + timezone, not a word.
                  [t.ch02.fieldReturns, "7:07 AM ET", "hidden lg:flex"],
                ].map(([k, v, hide]) => (
                  <div
                    key={k}
                    className={`justify-between gap-4 border-b border-white/6 py-2.5 ${hide || "flex"}`}
                  >
                    <span className="shrink-0 text-[#8A9099]">{k}</span>
                    <span className="text-right text-[#C9CDD3]">{v}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between pt-4">
                  <span className="text-[#8A9099]">{t.ch02.fieldTotal}</span>
                  <span className="text-[32px] font-medium tabular-nums leading-none text-white">
                    $68
                  </span>
                </div>
                <p className="mt-2 text-right text-[#8A9099]">{t.ch02.noMeter}</p>
                <div className="mt-5 hidden gap-2 lg:flex">
                  <span className="flex-1 rounded bg-[#F7F6F3] py-2 text-center text-[11px] text-[#14161A]">
                    {t.ch02.approve}
                  </span>
                  <span className="flex-1 rounded border border-white/15 py-2 text-center text-[11px] text-[#8A9099]">
                    {t.ch02.askQuestion}
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
          {/* The standing guarantees, not the process — deliberately smaller
              and unnumbered so it never reads as a "three things" list a
              second time next to the numbered chapters. Sits right under the
              receipt on purpose: the price just proved the rule (one fixed
              number, no meter), so this is the moment to name the three
              things that stay true no matter where a task sits on its own
              timeline, before the reader moves on to how the pool works. */}
          <Reveal className="mx-auto mt-10 grid max-w-[720px] gap-6 border-t border-white/8 pt-8 sm:grid-cols-3">
            {t.whatWeAre.pillars.map(([label, body]) => (
              <div key={label} className="srow">
                <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#C9CDD3]">
                  {label}
                </p>
                <p className="mt-1.5 text-[13px] leading-[1.5] text-[#767C86]">{body}</p>
              </div>
            ))}
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
              {/* "You never meet the worker. That's the point." used to sit
                  under this heading. It was the heading again in other words
                  — one professional standing between you and the work IS
                  never meeting the worker — so the reader paid for two lines
                  and was told one thing. */}
              <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
                {t.ch05.h2}
              </h2>

              <PaperReviewDesk caption={t.ch05.desk} />

              {/* Every row names the alternative it is beating, on the row
                  itself. The single header pair that used to sit above these
                  scrolled out of view after the first row and never came
                  back — see the note on ch05.pairs in src/lib/i18n/client.ts
                  for why per-row labels replaced it rather than sticky ones. */}
              <div className="mt-12">
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

                  {t.ch05.pairs.map(([who, there, here]) => (
                    <div
                      key={who}
                      className="cut-row grid items-start border-b border-black/8 py-4 md:grid-cols-[1fr_2.75rem_1fr]"
                    >
                      <div className="arrive-l md:pr-5 md:text-right">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A9099]">
                          {who}
                        </p>
                        <p className="mt-1 text-[14px] leading-relaxed text-[#5B6069]">{there}</p>
                      </div>
                      <span aria-hidden className="hatch my-3 block h-3 md:my-0 md:hidden" />
                      <span aria-hidden className="hidden md:block" />
                      <div className="arrive-r md:pl-5">
                        {/* The brand name, not a translated string: it is the
                            one constant in the table and the drumbeat the eye
                            catches four times down the right-hand side. */}
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#14161A]">
                          AfterDesk
                        </p>
                        <p className="mt-1 text-[14px] leading-relaxed text-[#14161A]">{here}</p>
                      </div>
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
            <TrustLinks lang={lang} />
          </div>
        </div>
      </footer>
    </div>
  );
}
