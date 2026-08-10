import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/logo";
import { cookies } from "next/headers";
import { arrivedFromInsideTheApp, getSessionUser, roleHome } from "@/lib/authz";
import { Reveal } from "@/components/reveal";
import { PublicCounters } from "@/components/public-counters";
import { LiveTaskWindow } from "@/components/live-task-window";
import { MobileMenu } from "@/components/mobile-menu";
import { PointerGlow } from "@/components/pointer-glow";
import { SITE_URL } from "@/lib/site";
import { LangSwitch } from "@/components/lang-switch";
import { PaperLedgerScan } from "@/components/paper-ledger-scan";
import { PaperInstrument } from "@/components/paper-instrument";
import { PaperReviewDesk } from "@/components/paper-review-desk";
import { TrustLinks } from "@/components/trust-links";
import { CLIENT_I18N, CLIENT_LANGS, clientLangOf } from "@/lib/i18n/client";
import { langAlternates, type SiteLang } from "@/lib/i18n/langs";
import { COMPACT_SERVICES_LABEL, COMPACT_HOW_LABEL } from "@/lib/i18n/mobile-menu-compact";
import { getSettings } from "@/lib/settings";

/* ─────────────────────────────────────────────────────────────────────────
   The landing page is a picture, not an essay: a real file arriving broken in
   the evening and leaving clean and reviewed. Everything else is caption.
   Palette: night #0A0B0D / surface #111317 / dusk #1B2740 / paper #F7F6F3 /
   ink #14161A. Amber appears ONLY on damaged cells; green ONLY on fixed rows.
   Motion: entrance rise on the hero, scroll-reveals below the fold, two
   ambient loops (hero glow, seam nudge) — all gated on prefers-reduced-motion.

   POSITIONING RULES the copy in src/lib/i18n/client.ts already enforces (do
   not regress here): no "any task", no blanket "by morning" promise, no
   labor-arbitrage framing, every demo artifact visibly labelled illustrative.
   ───────────────────────────────────────────────────────────────────────── */

/* Every visible string lives in src/lib/i18n/client.ts (EN/FR/ES/TL). The
   rule: the VOICE translates, the MACHINE (clock times, prices, filenames,
   task IDs) stays literal. */

const NOISE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
};

/** Per-language metadata for the one URL that renders four languages.
 *  Language comes from ?lang= ONLY, never the cookie — the bare "/" URL is
 *  declared to crawlers as the EN/x-default rendering (langAlternates), so a
 *  cookie-carrying visitor must not flip its indexed title. The PAGE renders
 *  in the cookie language; the metadata describes the URL. */
const HOME_META: Record<SiteLang, { title: string; description: string }> = {
  en: {
    title: "Finished admin work at a fixed price: data, research, documents",
    description:
      "AfterDesk delivers finished administrative work for one fixed price you approve before anything starts. We define the scope, manage the execution, and check the result against a written standard.",
  },
  fr: {
    title: "Du travail administratif fini à prix fixe : données, recherche, documents",
    description:
      "AfterDesk livre du travail administratif fini pour un prix fixe approuvé avant que rien ne commence. Nous définissons le périmètre, gérons l'exécution et vérifions le résultat contre une norme écrite.",
  },
  es: {
    title: "Trabajo administrativo terminado a precio fijo: datos, investigación, documentos",
    description:
      "AfterDesk entrega trabajo administrativo terminado por un precio fijo que apruebas antes de que empiece nada. Definimos el alcance, gestionamos la ejecución y verificamos el resultado contra una norma escrita.",
  },
  tl: {
    title: "Tapos nang admin na trabaho sa fixed na presyo: data, research, dokumento",
    description:
      "Naghahatid ang AfterDesk ng tapos nang admin na trabaho sa isang fixed na presyo na inaaprubahan mo bago magsimula ang kahit ano. Kami ang nagtatakda ng scope, namamahala sa execution, at sumusuri sa resulta laban sa nakasulat na pamantayan.",
  },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = clientLangOf(sp.lang);
  return { ...HOME_META[lang], alternates: langAlternates("/", sp.lang) };
}

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
  description: "Finished administrative work at a fixed price, for data, research and document work.",
});

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const user = await getSessionUser();
  /* An unverified session is never bounced: behind the gate there is nothing
     for it to see, so this page is its way out. A verified one is bounced only
     on a cold arrival at the bare root — anyone who clicked through from
     inside the app asked for the marketing site and gets it. */
  if (user?.emailVerified && !(await arrivedFromInsideTheApp())) {
    redirect(roleHome(user.role));
  }
  const portal = user ? (user.emailVerified ? roleHome(user.role) : "/verify-email") : undefined;
  const sp = await searchParams;
  const cookieStore = await cookies();
  const lang = clientLangOf(sp.lang ?? cookieStore.get("ss-lang-client")?.value);
  const t = CLIENT_I18N[lang];
  // The dispute-window figure in the hero guarantee comes from the LIVE
  // setting, never a typed number: the published promise can never drift
  // from the value sweeps.ts actually enforces. Same rule /how-it-works
  // follows for every figure on the protocol page.
  const settings = await getSettings();
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
    /* lang on the subtree: the root <html> carries the resolved site lang,
       and screen readers must switch voice for the translated copy. */
    <div lang={lang} className="overflow-x-clip bg-[#0A0B0D]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ORG_JSONLD }}
      />
      {/* ── NAV — sticky, blurred ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0A0B0D]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-2 px-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-6">
          <Wordmark tone="paper" className="text-[11px] sm:text-[13px]" />
          {/*
            THE CLIENT HEADER NO LONGER OFFERS A SECOND AUDIENCE.

            It used to open with an AudienceToggle whose two halves were "Get
            work done" and "EARN". A buyer met the recruiting side of the
            business in the second link of the first screen, before the product
            had been explained — which reads as a two-sided marketplace, and
            that is the category this page is trying to leave.

            Specialists are not hidden: the footer still carries the door, and
            /workers keeps its own storefront untouched. What changed is that
            the client corridor now spends its nav on the client's own three
            questions.
          */}
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <Link
              href="/services"
              className="hidden text-[12px] font-medium text-[#8A9099] transition-colors hover:text-white sm:block sm:text-[13px]"
            >
              {t.footer.services}
            </Link>
            <Link
              href="/how-it-works"
              className="hidden text-[12px] font-medium text-[#8A9099] transition-colors hover:text-white sm:block sm:text-[13px]"
            >
              {t.footer.how}
            </Link>
          </div>
          <div className="flex items-center justify-end gap-1.5 sm:gap-2.5">
            <LangSwitch path="/" current={lang} options={CLIENT_LANGS} tone="night" />
            <Link
              href="/about"
              className="hidden shrink-0 whitespace-nowrap text-[12px] font-medium text-[#8A9099] transition-colors hover:text-white sm:block sm:text-[13px]"
            >
              {t.footer.about}
            </Link>
            {portal ? (
              <Link
                href={portal}
                className="lift hidden min-h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[13px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_6px_24px_rgba(247,246,243,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:inline-flex"
              >
                {t.nav.portal}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden shrink-0 whitespace-nowrap text-[12px] font-medium text-[#8A9099] transition-colors hover:text-white sm:block sm:text-[13px]"
                >
                  {t.nav.signIn}
                </Link>
                <Link
                  href="/register"
                  className="lift hidden min-h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[13px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_6px_24px_rgba(247,246,243,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:inline-flex"
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
            point: headline → the product itself → the door → the explanation. */}
        <div className="relative mx-auto flex w-full max-w-[1120px] flex-col px-6 pb-4 pt-4 sm:pt-28 lg:grid lg:grid-cols-[1fr_420px] lg:gap-12 lg:items-center">
          <div className="contents lg:block">
            <div className="order-1">
              {/* Phone-only: the links the header has no room for, behind one
                  compact trigger — see mobile-menu.tsx. */}
              <div className="mb-5 flex items-center justify-between sm:hidden">
                <MobileMenu
                  tone="night"
                  aboutLabel={t.footer.about}
                  servicesLabel={COMPACT_SERVICES_LABEL[lang]}
                  howLabel={COMPACT_HOW_LABEL[lang]}
                />
                <Link
                  href={portal ?? "/login"}
                  className="flex min-h-11 shrink-0 items-center whitespace-nowrap text-[12px] font-medium text-[#8A9099] transition-colors hover:text-white"
                >
                  {portal ? t.nav.portal : t.nav.signIn}
                </Link>
              </div>
              <h1 className="max-w-[17ch] text-[clamp(2.75rem,6.5vw,5rem)] font-semibold leading-[1.01] tracking-[-0.035em]">
                <span className="anim-rise block text-[#767C86]">{t.hero.line1}</span>
                <span className="anim-rise d-1 block text-white">{t.hero.line2}</span>
              </h1>
              {/* The management-fatigue argument, compressed into one line a
                  fast scroller hits before the CTA. */}
              <p className="anim-rise d-1 mt-5 max-w-[42ch] text-[17px] leading-[1.5] text-[#9AA1AB] sm:text-[19px]">
                {t.hero.subtitle}
              </p>
            </div>

            <div className="anim-rise d-2 order-3 mt-8">
              <Link
                href="/register"
                className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_10px_36px_rgba(247,246,243,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {t.hero.cta}
              </Link>
              {/* The literal answer to "what actually happens if I click
                  this" — the shield is the one glyph on the page that means
                  "protected", reused nowhere else. */}
              <p className="mt-3 flex items-start gap-1.5 font-mono text-[12px] text-[#767C86]">
                <svg viewBox="0 0 16 16" fill="none" className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[#5B6069]" aria-hidden>
                  <path
                    d="M8 1.5 13.5 3.5V7.5C13.5 11 11.2 13.3 8 14.5C4.8 13.3 2.5 11 2.5 7.5V3.5L8 1.5Z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                </svg>
                {t.hero.guarantee(settings.disputeWindowHours)}
              </p>
            </div>
          </div>

          {/* The product IS the hero image — and it's ALIVE: one task's whole
              life plays in the window, then loops. Visibly labelled
              illustrative (previewLabel below), same honesty convention as
              the ledger's NOT A RATE CARD note — the sr-only line carries the
              same framing for anyone who cannot see it. */}
          <p className="sr-only">{t.hero.srPreview(t.liveWindow.taskTitle)}</p>
          <div className="order-2 mt-10 lg:mt-0">
            <div aria-hidden className="anim-rise d-3">
              <LiveTaskWindow copy={t.liveWindow} />
            </div>
            <p className="anim-rise d-4 mt-2 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-[#5B6069]">
              {t.hero.previewLabel}
            </p>
          </div>
        </div>

        {/* live counters — the proof, at the moment of the promise. Renders
            nothing until the real thresholds are met (>=10 tasks, >=5
            workers): armed, never fabricated. */}
        <PublicCounters tone="night" variant="strip" copy={t.counters} className="anim-rise d-4 mt-12" />
      </section>

      {/* ── WHAT THIS IS ──────────────────────────────────────────────────
             The very next thing after the hero, on purpose: what AfterDesk
             actually IS, who does the work, and the one rule that makes it
             safe to send a task to a stranger. */}
      <section className="border-t border-white/8 bg-[#0D0E11]">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-16 sm:py-20">
          <Reveal>
            <p className="srow font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
              {t.whatWeAre.label}
            </p>
            {/* AfterDesk set in the wordmark's own treatment (mono,
                uppercase, tracked) so the brand reads as a mark planted
                mid-sentence, not just another word. */}
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

      {/* ── 01/04 THE RECEIPT ─────────────────────────────────────────── */}
      <section className="border-t border-white/8">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-24">
          <Reveal>
            <p className="mb-10 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
              {ch("01", t.ch02.label)}
            </p>
            <div className="mx-auto max-w-[420px]">
              <div className="hidden lg:block lift rounded-xl border border-white/10 bg-[#111317] p-5 font-mono text-[12px] transition-colors hover:border-white/20 hover:bg-[#15171B]">
                <div className="flex items-center justify-between border-b border-white/8 pb-3 text-[#8A9099]">
                  {/* "QUOTE #0412" is a machine ID and stays literal. */}
                  <span>QUOTE #0412</span>
                  <span className="text-white">{t.ch02.fixed}</span>
                </div>
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

              {/* Mobile-only stand-in for the card above: just the number, no
                  chrome, so it can't be mistaken for a second version of the
                  hero window. */}
              <div className="flex items-baseline justify-between gap-4 border-b border-white/8 pb-4 font-mono text-[12px] lg:hidden">
                <span className="text-[#8A9099]">{t.ch02.fieldTotal}</span>
                <span className="text-[28px] font-medium tabular-nums leading-none text-white">$68</span>
              </div>
              <p className="mt-2 text-right font-mono text-[11px] text-[#8A9099] lg:hidden">
                {t.ch02.noMeter}
              </p>

              <div className="mt-6 grid gap-3 font-mono text-[12px] text-[#767C86] sm:grid-cols-3">
                {t.ch02.captions.map((c) => (
                  <p key={c} className="srow">
                    {c}
                  </p>
                ))}
              </div>
            </div>
          </Reveal>
          {/* The standing guarantees — the three things that stay true no
              matter where a task sits on its own timeline. */}
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

      {/* ── 02/04 THE INDEX PLATE (paper) ─────────────────────────────
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

      {/* ── 03/04 THE INSTRUMENT (paper) ──────────────────────────────
             A measured 24-hour ruler with a needle at the real New York
             clock; the four stations light only while the needle is inside
             them. The whole dial is framed as ONE EXAMPLE evening (h2) —
             an illustration of the flow, not a delivery-time promise. */}
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

      {/* ── 04/04 THE SECTION CUT (paper) ─────────────────────────────
             The artifact demonstrates the review; the wall states the rule.
             THERE and HERE are drawn as an architectural section with a 45°
             hatched OPERATOR band between them: facing statements arrive
             from their own side, decelerate, and stop dead at the hatch.
             Nothing crosses it. The AI row leads the pairs — it is the
             alternative a 2026 buyer weighs first. */}
      <section className="relative overflow-hidden border-t border-black/8 bg-[#F7F6F3]">
        <div className="relative mx-auto w-full max-w-[920px] px-4 py-16 sm:px-6 sm:py-24">
          <Reveal replay>
            <div className="plate px-5 py-10 sm:px-9 sm:py-12">
              {plateCh("04", t.ch05.label)}
              <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
                {t.ch05.h2}
              </h2>

              <PaperReviewDesk caption={t.ch05.desk} />

              <div className="mt-12">
                <div className="relative">
                  {/* Sentence case at 13px, not 11px uppercase: this line
                      carries the frame for every pair below it, and all-caps
                      tracked-out 11px is the one line a fast reader skips —
                      which leaves the pairs reading as loose fragments. */}
                  <p className="sticky top-14 z-10 mb-4 -mx-5 border-y border-black/8 bg-[#F7F6F3]/95 px-5 py-2.5 text-center text-[13px] font-medium leading-snug text-[#14161A] backdrop-blur-sm sm:-mx-9 sm:px-9">
                    {t.ch05.legend}
                  </p>
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

      {/* ── CLOSING — the sheet is trimmed, the night resumes ────────── */}
      <section className="bg-[#F7F6F3] pb-16">
        <div className="mx-auto w-full max-w-[920px] px-4 sm:px-6">
          {/* What we refuse, stated before the last CTA. A page that only
              makes promises reads as less trustworthy than one that draws a
              boundary — and this reader is about to hand business files to
              someone they will never meet. Kept true to the NOT IN SCOPE
              list on /how-it-works. */}
          <Reveal className="mb-10 border-t border-black/8 pt-8">
            <p className="max-w-[68ch] text-[14px] leading-[1.6] text-[#5B6069]">
              {t.close.limits}
            </p>
          </Reveal>
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
            <Link href="/services" className="transition-colors hover:text-[#14161A]">
              {t.footer.services}
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
