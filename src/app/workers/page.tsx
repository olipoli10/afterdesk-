import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { MobileMenu } from "@/components/mobile-menu";
import { SampleExam } from "@/components/sample-exam";
import { cookies } from "next/headers";
import { getSessionUser, roleHome } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { Reveal } from "@/components/reveal";
import { AudienceToggle } from "@/components/audience-toggle";
import { PublicCounters } from "@/components/public-counters";
import { PointerGlow } from "@/components/pointer-glow";
import { LiveClaimCard } from "@/components/live-claim-card";
import { StickyApply } from "@/components/sticky-apply";
import { LangSwitch } from "@/components/lang-switch";
import { WORKERS_I18N, WORKERS_LANGS, workersLangOf } from "@/lib/i18n/workers";
import { publicSampleQuestion, academyStats } from "@/lib/academy/public";
import { SAMPLE_EXAM_TRANSLATIONS } from "@/lib/academy/sample-i18n";
import { TrustLinks } from "@/components/trust-links";
import { WORKER_SIDE_LABEL } from "@/lib/site";

/* ─────────────────────────────────────────────────────────────────────────
   The worker homepage — "THE SWITCH". The page used to explain the deal in
   six chapters; it now ASSERTS it in one object. Above the fold sits a task
   card whose payout is the same untouched glyphs after CLAIM, after REVIEW,
   after RELEASED — and beside it four struck rows (proposal, bidding,
   commission, client calls) that fade in and never resolve. That single
   artifact carries the whole comparison argument as image, which let the
   page collapse to four chapters.

   Palette law: green #1E7F5C only money/fixed/passed (#166049 as small text
   on light); amber #D98324 only returned-work; green text never directly on
   night. Margin-pairing rule: no example task or amount here may share a
   domain or a figure with the client page.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * The title leads with the category nouns the audience actually types
 * ("virtual assistant work", "Philippines") rather than with the brand, which
 * nobody searches yet. The promise still closes the line — it is the
 * differentiator and it survives truncation at ~60 characters.
 */
export const metadata = {
  title: "Virtual assistant work from the Philippines: the payout is printed before you claim",
  description:
    "Remote virtual assistant work for Filipino specialists. Tasks arrive already priced: no proposals, no bidding, no commission off your rate. Free training and a certificate before you apply.",
  alternates: { canonical: "/workers" },
};

const POOL_ROWS: {
  task: string;
  payout: string;
  tag: "open" | "you" | "claimed" | "high";
}[] = [
  { task: "Tag 1,200 support tickets by topic", payout: "$54", tag: "you" },
  { task: "Verify addresses for 620 store locations", payout: "$48", tag: "open" },
  { task: "Summarize 25 zoning PDFs into one memo", payout: "$66", tag: "open" },
  { task: "Type 14 handwritten order forms into a sheet", payout: "$38", tag: "open" },
  { task: "Rename and file 300 scanned receipts to a naming scheme", payout: "$72", tag: "claimed" },
  { task: "Reconcile a quarter of card statements", payout: "$120", tag: "high" },
];

/* One task's real day — including a send-back, because the standard is
   recoverable craft, not a strike. Lives at THE BAR, where it proves the
   amber path resolves. Artifact: stays English. */
const LEDGER_LINES: {
  t: string;
  label: string;
  detail: string;
  amber?: boolean;
  chip?: boolean;
  big?: boolean;
}[] = [
  { t: "07:22", label: "CLAIMED", detail: "Summarize 25 zoning PDFs · $66 fixed" },
  { t: "13:05", label: "DELIVERED", detail: "zoning_memo_v1.pdf" },
  { t: "13:58", label: "SENT BACK", detail: "two parcels missing citations", amber: true },
  { t: "16:52", label: "DELIVERED", detail: "zoning_memo_v2.pdf" },
  { t: "", label: "REVIEW", detail: "PASSED", chip: true },
  { t: "", label: "RELEASED", detail: "$66", big: true },
];

const NOISE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
};

function PoolChip({ tag }: { tag: "open" | "you" | "claimed" | "high" }) {
  const base = "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide";
  // Palette law: green is reserved for money — a claim is a state, so the
  // "you" chip is ink and only the payout on the row is green.
  if (tag === "you")
    return <span className={`${base} pulse-soft bg-[#14161A] text-[#F7F6F3]`}>Claimed · you</span>;
  if (tag === "claimed")
    return <span className={`${base} bg-[#14161A]/10 text-[#5B6069]`}>Claimed</span>;
  if (tag === "high")
    return (
      <span className={`${base} flex items-center gap-1 bg-[#1B2740]/10 text-[#1B2740] ring-1 ring-[#1B2740]/20`}>
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        High-value
      </span>
    );
  return <span className={`${base} border border-[#14161A]/20 text-[#5B6069]`}>Open</span>;
}

export default async function WorkersHome({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  /* This page used to redirect every signed-in visitor to their portal. That
     made the worker storefront unreachable for the whole duration of a
     session — and since the worker portal signs out to /workers
     (src/app/va/layout.tsx), a sign-out whose cookie had not cleared yet was
     thrown straight back into the app. The storefront now renders for
     everyone; a session only changes the account door in the chrome. */
  const user = await getSessionUser();
  const portal = user ? roleHome(user.role) : undefined;
  const settings = await getSettings();
  const sp = await searchParams;
  const cookieStore = await cookies();
  const lang = workersLangOf(sp.lang ?? cookieStore.get("ss-lang-worker")?.value);
  const t = WORKERS_I18N[lang];
  const ch = (n: string, label: string) => (
    <>
      {n}
      <span className="opacity-50">/05</span> · {label}
    </>
  );
  /* The one published exam question, read from the LIVE curriculum so the
     caption "one real question" can never quietly become false. The prompt/
     options/explain are overridden per language from a hand-maintained
     translation table (src/lib/academy/sample-i18n.ts) — the course title
     and correct index always come from the real English question, so a
     translation can never silently disagree with which answer is right. */
  const rawSample = publicSampleQuestion();
  const translation = SAMPLE_EXAM_TRANSLATIONS[lang];
  const sample = rawSample && translation ? { ...rawSample, ...translation } : rawSample;
  const stats = academyStats();

  return (
    /* lang on the subtree: the root <html> is en, and screen readers must
       switch voice for the Tagalog copy. */
    <div lang={lang} className="overflow-x-clip bg-[#F7F6F3]">
      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#F7F6F3]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-2 px-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-6">
          <Wordmark tone="ink" className="text-[11px] sm:text-[13px]" />
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <AudienceToggle
              side="worker"
              tone="paper"
              clientLabel={t.nav.client}
              workersLabel={WORKER_SIDE_LABEL}
            />
            <Link
              href="/services"
              className="hidden text-[12px] font-medium text-[#5B6069] transition-colors hover:text-[#14161A] sm:block sm:text-[13px]"
            >
              Our Services
            </Link>
          </div>
          {/* Same fix as page.tsx's header, same reason: longer translated
              labels here had no min-width floor and no whitespace-nowrap, so
              a language whose text ran longer than English shrank and
              wrapped instead of the row making room for it. */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2.5">
            <LangSwitch path="/workers" current={lang} options={WORKERS_LANGS} tone="paper" />
            <Link
              href="/about"
              className="hidden shrink-0 whitespace-nowrap text-[13px] font-medium text-[#5B6069] transition-colors hover:text-[#14161A] sm:block"
            >
              {t.footer.about}
            </Link>
            {portal ? (
              /* Signing in is done and applying is over, so the two doors
                 collapse into one that leads where the reader can actually
                 go. Without it the portal is only reachable by typing the
                 URL. */
              <Link
                href={portal}
                className="lift hidden min-h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-[#14161A] px-4 py-1.5 text-[13px] font-medium text-[#F7F6F3] hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] sm:inline-flex"
              >
                {t.nav.portal}
              </Link>
            ) : (
              <>
                <Link
                  href="/login?audience=worker"
                  className="hidden shrink-0 whitespace-nowrap text-[13px] font-medium text-[#5B6069] transition-colors hover:text-[#14161A] sm:block"
                >
                  {t.nav.signIn}
                </Link>
                <Link
                  href="/register/va"
                  className="lift hidden min-h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-[#14161A] px-4 py-1.5 text-[13px] font-medium text-[#F7F6F3] hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] sm:inline-flex"
                >
                  {t.nav.apply}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── HERO — the promise as one object ──────────────────────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="paper-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="hero-glow glow-paperlight pointer-events-none absolute -top-48 left-[4%] h-[640px] w-[900px]"
        />
        <div
          aria-hidden
          className="glow-drift glow-dusk pointer-events-none absolute -top-24 right-[-10%] h-[400px] w-[560px] opacity-[0.18]"
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.02]" style={NOISE} />
        <PointerGlow tone="paper" />

        {/* Mobile order puts the proof before the ask: kill · H1 · sub ·
            card · CTA. `contents` lets the copy children participate in the
            same flex flow so `order` can interleave them with the card. */}
        <div className="relative mx-auto flex w-full max-w-[1120px] flex-col px-6 pb-4 pt-4 sm:pt-24 lg:grid lg:grid-cols-[1fr_460px] lg:items-center lg:gap-14">
          <div className="contents lg:block">
            {/* Phone-only: the links the header has no room for, behind
                one compact trigger — see mobile-menu.tsx. No anim-rise
                here, unlike its siblings below — see the matching comment
                on this same component in src/app/page.tsx for why an
                entrance fade on an interactive dropdown anchor causes the
                open panel to render translucent if tapped before it
                settles.

                Sign in sits next to the trigger, not inside it — same
                reasoning as src/app/page.tsx's matching comment: it's a
                frequent action for a returning worker, unlike the two
                discovery links left in the menu, and the header has no
                spare width for it at 375px (logo + audience toggle +
                language switcher already fill the row). */}
            <div className="order-0 mb-5 flex items-center justify-between sm:hidden">
              <MobileMenu tone="paper" aboutLabel={t.footer.about} />
              <Link
                href={portal ?? "/login?audience=worker"}
                className="flex min-h-11 shrink-0 items-center whitespace-nowrap text-[13px] font-medium text-[#5B6069] transition-colors hover:text-[#14161A]"
              >
                {portal ? t.nav.portal : t.nav.signIn}
              </Link>
            </div>
            <p className="anim-rise order-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[#5B6069]">
              {t.hero.kill}
            </p>
            <h1 className="anim-rise d-1 order-2 mt-4 max-w-[16ch] text-[clamp(2rem,5.5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-[#14161A]">
              {t.hero.h1}
            </h1>
            <p className="anim-rise d-2 order-3 mt-5 max-w-[46ch] text-[17px] leading-[1.5] text-[#5B6069]">
              {t.hero.sub}
            </p>
            <div className="anim-rise d-4 order-5 mt-8">
              <Link
                href="/register/va"
                className="lift inline-flex h-12 items-center rounded-full bg-[#14161A] px-6 text-[15px] font-medium text-[#F7F6F3] hover:bg-black"
              >
                {t.hero.cta}
              </Link>
            </div>
            <p className="anim-rise d-5 order-6 mt-4 font-mono text-[12px] text-[#5B6069]">
              {t.hero.micro}
            </p>
          </div>

          <p className="sr-only">
            Example task card: “Tag 1,200 support tickets by topic” carries a printed
            payout of $54.00 before it is claimed. The same $54.00 is what is released
            after the delivery passes review. No proposal, no bidding, no commission and
            no client calls are involved.
          </p>
          <div aria-hidden className="anim-rise d-3 order-4 mt-10 lg:order-none lg:mt-0">
            <LiveClaimCard ghost={t.hero.ghost} caption={t.hero.cardCaption} copy={t.claimCard} />
          </div>
        </div>

        <PublicCounters tone="paper" variant="strip" copy={t.counters} className="anim-rise d-5 mt-14" />
      </section>

      {/* ── 01/05 THE POOL ────────────────────────────────────────────── */}
      <section className="relative mx-auto w-full max-w-[1120px] border-t border-black/8 px-6 pb-20 pt-16">
        <Reveal replay>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
            {ch("01", t.ch01.label)}
          </p>
          <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
            {t.ch01.h2}
          </h2>
          <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[#5B6069]">
            {t.ch01.body}
          </p>

          <div aria-hidden className="sheen-frame sheen-frame--paper mt-8 shadow-[0_24px_60px_-32px_rgba(20,22,26,0.35)]">
            <div className="relative overflow-hidden rounded-2xl bg-[#F7F6F3]">
              <div className="flex h-10 items-center justify-between border-b border-[#14161A]/10 bg-white px-4">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1E7F5C]" />
                  <span className="font-mono text-[11px] text-[#5B6069]">task_pool</span>
                </span>
                <span className="font-mono text-[11px] text-[#5B6069]">7:15 AM Manila</span>
              </div>
              <div className="bg-white text-[13px]">
                {POOL_ROWS.map((r) => (
                  <div
                    key={r.task}
                    className={`srow flex items-center gap-3 border-b border-[#14161A]/[0.06] px-4 py-[10px] last:border-0 ${
                      r.tag === "you" ? "bg-[#F7F6F3] ring-1 ring-inset ring-[#14161A]/15" : ""
                    }`}
                  >
                    <span className="truncate text-[#14161A]">{r.task}</span>
                    <span className="ml-auto shrink-0 font-mono text-[12px] tabular-nums text-[#166049]">
                      {r.payout}
                    </span>
                    <PoolChip tag={r.tag} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 font-mono text-[11px] text-[#5B6069]">{t.ch01.disclosure}</p>

          {/* the day bands, absorbed: two lines, one caption, no chapter */}
          <div className="mt-10 space-y-2">
            {[
              { label: "Manila", lit: (h: number) => h >= 8 && h <= 17 },
              { label: "New York", lit: (h: number) => h >= 20 || h <= 5 },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-[68px] shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[#5B6069]">
                  {row.label}
                </span>
                <div className="relative grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-px overflow-hidden rounded bg-black/8">
                  {Array.from({ length: 24 }, (_, i) => (
                    <span
                      key={i}
                      className={`h-5 ${row.lit(i) ? "bg-[#1B2740]" : "bg-[#14161A]/[0.06]"}`}
                    />
                  ))}
                  <span
                    aria-hidden
                    className="band-sweep absolute inset-y-0 left-0 w-[3px] bg-[#F7F6F3] mix-blend-difference"
                  />
                </div>
              </div>
            ))}
            <p className="pt-1 font-mono text-[11px] text-[#5B6069]">{t.ch01.bandCaption}</p>
          </div>
        </Reveal>
      </section>

      {/* ── 02/05 THE ACADEMY ─────────────────────────────────────────────
          The acquisition argument, in first place by the founder's call:
          free training is the reason to sign up, and word of mouth is the
          growth mechanism. A certificate mill never shows you its test — so
          this chapter shows one, marked, to a stranger with no account.
          That performs "free, real, nothing withheld" instead of claiming it.

          COLOUR: no green and no amber anywhere in here. Green is money and
          amber is returned work; a graded answer is neither, so the mark is
          ink and the pass stamp is dusk. The first green a reader meets is
          still the payout in 02 THE POOL.
          ──────────────────────────────────────────────────────────────── */}
      {sample ? (
        <section className="relative mx-auto w-full max-w-[1120px] px-6 pb-20 pt-16">
          <Reveal replay>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
              {ch("02", t.chAcademy.label)}
            </p>
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
              {t.chAcademy.h2}
            </h2>
            <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed text-[#5B6069]">
              {t.chAcademy.body}
            </p>

            <div
              aria-hidden
              className="sheen-frame sheen-frame--paper mt-8 max-w-[760px] shadow-[0_24px_60px_-32px_rgba(20,22,26,0.35)]"
            >
              <div className="overflow-hidden rounded-2xl bg-white">
                {/* the scale, as machinery rather than bullets */}
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-[#14161A]/10 bg-[#F7F6F3] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#5B6069]">
                  <span>
                    <b className="font-medium text-[#14161A]">{stats.courses}</b>{" "}
                    {t.chAcademy.stats.courses}
                  </span>
                  <span className="text-[#14161A]/25">·</span>
                  <span>
                    <b className="font-medium text-[#14161A]">{stats.lessons}</b>{" "}
                    {t.chAcademy.stats.lessons}
                  </span>
                  <span className="text-[#14161A]/25">·</span>
                  <span>
                    <b className="font-medium text-[#14161A]">{stats.questions}</b>{" "}
                    {t.chAcademy.stats.questions}
                  </span>
                </div>

                {/* the same 40px instrument bar as task_pool — one house idiom */}
                <div className="flex h-10 items-center justify-between gap-3 border-b border-[#14161A]/10 px-4">
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1B2740]" />
                    <span className="truncate font-mono text-[11px] lowercase text-[#5B6069]">
                      exam · {sample.courseTitle}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#5B6069]">
                    {stats.passScore} of {stats.questionCount} to pass
                  </span>
                </div>

                {/* the paper — playable, see src/components/sample-exam.tsx */}
                <SampleExam
                  prompt={sample.prompt}
                  options={sample.options}
                  correct={sample.correct}
                  explain={sample.explain}
                  ui={t.sampleExamUi}
                />

                {/* the terms, as machine stamps — $0.00 in ink, never green.
                    Two shapes, because the four-cell version costs two rows on
                    a phone for facts the reader has already been given: the
                    pass mark is printed in the instrument bar directly above,
                    and the attempt limit only matters once someone is IN the
                    exam. The phone keeps the two that are genuinely new here —
                    the certificate is permanent, and it costs nothing. */}
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#14161A]/10 bg-[#F7F6F3] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#5B6069] sm:hidden">
                  <span>
                    certificate <b className="font-medium text-[#14161A]">permanent</b>
                  </span>
                  <span className="text-[#14161A]/25">·</span>
                  <span>
                    cost <b className="font-medium tabular-nums text-[#14161A]">$0.00</b>
                  </span>
                </p>
                <dl className="hidden border-t border-[#14161A]/10 bg-[#F7F6F3] sm:grid sm:grid-cols-4">
                  {[
                    ["Pass mark", `${stats.passScore} of ${stats.questionCount}`],
                    ["Attempts", `${stats.attemptsPerDay} per 24 h`],
                    ["Certificate", "permanent"],
                    ["Cost", "$0.00"],
                  ].map(([k, v], i) => (
                    <div
                      key={k}
                      className={`px-4 py-3 ${i > 0 ? "border-l border-[#14161A]/[0.06]" : ""}`}
                    >
                      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#5B6069]">
                        {k}
                      </dt>
                      <dd className="mt-1 font-mono text-[13px] tabular-nums text-[#14161A]">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <p className="sr-only">
              A real exam question from the {sample.courseTitle} course, answerable here without an
              account: choose an option to see whether it is right and why. Pass mark{" "}
              {stats.passScore} of {stats.questionCount}, {stats.attemptsPerDay} attempts per 24
              hours, the certificate is permanent and the cost is zero.
            </p>

            <p className="mt-3 max-w-[62ch] font-mono text-[11px] leading-relaxed text-[#5B6069]">
              {t.chAcademy.caption} {t.chAcademy.english}
            </p>
            <p className="mt-4 text-[15px]">
              <Link
                href="/academy"
                className="font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-[5px] transition-colors hover:decoration-[#14161A]"
              >
                {t.chAcademy.ctaLink(stats.courses)}
              </Link>{" "}
              <span className="font-mono text-[12px] text-[#5B6069]">{t.chAcademy.ctaTail}</span>
            </p>
          </Reveal>
        </section>
      ) : null}

      {/* ── 03/05 THE SLIP ────────────────────────────────────────────── */}
      <section className="border-t border-black/8">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-20">
          <Reveal>
            <p className="mb-2 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
              {ch("03", t.ch02.label)}
            </p>
            <h2 className="mb-10 text-center text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
              {t.ch02.h2}
            </h2>
            <div className="mx-auto max-w-[420px]">
              <div className="lift rounded-xl border border-[#14161A]/10 bg-white p-5 font-mono text-[12px] hover:border-[#14161A]/20">
                <div className="flex items-center justify-between border-b border-[#14161A]/10 pb-3 text-[#5B6069]">
                  <span>PAYOUT #0871</span>
                  <span className="rounded bg-[#1E7F5C]/10 px-2 py-0.5 text-[10px] uppercase text-[#166049]">
                    {t.ch02.fixed}
                  </span>
                </div>
                {[
                  [t.ch02.fieldTask, "Tag 1,200 support tickets by topic"],
                  [t.ch02.fieldClaimed, "7:31 AM"],
                  [t.ch02.fieldDelivered, "2:14 PM"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-[#14161A]/[0.06] py-2.5">
                    <span className="shrink-0 text-[#5B6069]">{k}</span>
                    <span className="text-right text-[#14161A]">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-b border-[#14161A]/[0.06] py-2.5">
                  <span className="shrink-0 text-[#5B6069]">{t.ch02.fieldReview}</span>
                  <span className="text-right text-[#166049]">{t.ch02.passed}</span>
                </div>

                <div className="space-y-1.5 py-3">
                  {t.ch02.zeros.map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-2 text-[#5B6069]">
                      <span className="shrink-0">{k}</span>
                      <span className="mb-[3px] flex-1 border-b border-dotted border-[#14161A]/20" />
                      <span className="shrink-0 tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-baseline justify-between rounded bg-[#1E7F5C]/10 px-3 py-2.5">
                  <span className="text-[#166049]">{t.ch02.released}</span>
                  <span className="text-[26px] font-medium tabular-nums leading-none text-[#166049]">
                    $54.00
                  </span>
                </div>
              </div>
              <p className="mt-4 text-center font-mono text-[12px] text-[#5B6069]">
                {t.ch02.kicker}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 04/05 THE BAR — the page's one big turn to night ──────────── */}
      <section className="bg-[#0A0B0D]">
        <div className="relative overflow-hidden">
          <div
            aria-hidden
            className="hero-glow glow-dusk pointer-events-none absolute -top-32 left-1/2 h-[460px] w-[760px] -translate-x-1/2 opacity-60"
          />
          <div className="relative mx-auto w-full max-w-[880px] px-6 py-20">
            <Reveal>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
                {ch("04", t.ch03.label)}
              </p>
              <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#F7F6F3]">
                {t.ch03.h2}
              </h2>

              <div className="mt-8 space-y-3">
                <div className="srow rounded border-l-[3px] border-[#1E7F5C] bg-[#111317] px-4 py-3 font-mono text-[13px] text-[#F7F6F3] ring-1 ring-white/[0.06]">
                  {t.ch03.rowPass}
                </div>
                <div className="srow rounded border-l-[3px] border-[#D98324] bg-[#111317] px-4 py-3 font-mono text-[13px] text-[#F7F6F3] ring-1 ring-white/[0.06]">
                  {t.ch03.rowReturned}
                </div>
                {/* never stamped, never animated — a failure state must not perform */}
                <div className="rounded border-l-[3px] border-[#5B6069] bg-[#111317] px-4 py-3 font-mono text-[13px] text-[#9AA1AB] ring-1 ring-white/[0.06]">
                  {t.ch03.rowFail}
                </div>
              </div>

              <p className="mt-4 font-mono text-[12px] leading-relaxed text-[#8A9099]">
                {t.ch03.footnote}
              </p>

              {/* the ledger of one task's real day — the amber path resolving */}
              <div aria-hidden className="mt-10 overflow-hidden rounded-xl border border-white/10 bg-[#111317]">
                <div className="flex h-10 items-center justify-between border-b border-white/8 px-4">
                  <span className="font-mono text-[11px] text-[#8A9099]">your_ledger</span>
                  <span className="font-mono text-[11px] text-[#8A9099]">7:09 PM Manila</span>
                </div>
                <div className="font-mono text-[12px] tabular-nums">
                  {LEDGER_LINES.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-[9px] last:border-0"
                    >
                      {l.t ? <span className="shrink-0 text-[#8A9099]">{l.t}</span> : null}
                      <span
                        className={`shrink-0 ${
                          l.amber ? "text-[#D98324]" : l.big ? "text-[#F7F6F3]" : "text-[#8A9099]"
                        }`}
                      >
                        {l.label}
                      </span>
                      {l.chip ? (
                        <span className="rounded border border-[#1E7F5C]/40 bg-[#1E7F5C]/15 px-1.5 py-0.5 text-[10px] text-[#F7F6F3]">
                          {l.detail}
                        </span>
                      ) : (
                        <span
                          className={
                            l.big
                              ? "text-[18px] font-semibold text-[#F7F6F3] underline decoration-[#1E7F5C] decoration-2 underline-offset-4"
                              : "truncate text-[#C9CDD3]"
                          }
                        >
                          {l.detail}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 05/05 THE TERMS ───────────────────────────────────────────── */}
      <section className="border-t border-white/8 bg-[#111317]">
        <div className="mx-auto w-full max-w-[880px] px-6 py-20">
          <Reveal>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8A9099]">
              {ch("05", t.ch04.label)}
            </p>
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#F7F6F3]">
              {t.ch04.h2}
            </h2>

            {/* the shape of the company, in one line — decorative; the
                caption below carries the meaning for screen readers */}
            <div className="my-8">
              <div aria-hidden className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#F7F6F3]">
                <span>You</span>
                <span className="h-px flex-1 bg-white/25" />
                <span>Operator</span>
                <span className="h-px flex-1 bg-white/25" />
                <span>Client</span>
              </div>
              <div aria-hidden className="relative mt-3">
                <div className="border-t border-dashed border-white/15" />
                <span className="absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#111317] font-mono text-[11px] text-[#8A9099] ring-1 ring-white/15">
                  ×
                </span>
              </div>
              <p className="mt-3 font-mono text-[11px] text-[#8A9099]">{t.ch04.schematic}</p>
            </div>

            {t.ch04.terms(settings.maxActiveClaims, settings.maxQcRounds).map(([label, text]) => (
              <div
                key={label}
                className="srow grid gap-1 border-b border-white/[0.06] py-4 sm:grid-cols-[120px_1fr] sm:gap-6"
              >
                <span
                  className={`font-mono text-[12px] uppercase tracking-[0.1em] ${
                    label === "PAYOUT"
                      ? "text-[#F7F6F3] underline decoration-[#1E7F5C] decoration-2 underline-offset-4"
                      : "text-[#8A9099]"
                  }`}
                >
                  {label}
                </span>
                <span className="text-[15px] leading-relaxed text-[#F7F6F3]/90">{text}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── CLOSING — paper on night, the negative of the client page ─── */}
      <section className="bg-[#0A0B0D] pb-16">
        <div className="mx-auto w-full max-w-[880px] px-6">
          <Reveal>
            <PublicCounters tone="night" variant="strip" copy={t.counters} className="mb-10" />
          </Reveal>
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-[#F7F6F3] px-6 py-16 text-center">
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.02]" style={NOISE} />
              <div className="relative">
                <h2 className="text-[30px] font-semibold tracking-[-0.02em]">
                  <span className="block text-[#8A9099]">{t.closing.line1}</span>
                  <span className="block text-[#14161A]">{t.closing.line2}</span>
                </h2>
                <div className="mt-7">
                  <Link
                    href="/register/va"
                    className="lift inline-flex h-12 items-center rounded-full bg-[#14161A] px-6 text-[15px] font-medium text-[#F7F6F3] hover:bg-black"
                  >
                    {t.closing.cta}
                  </Link>
                </div>
                <p className="mt-4 font-mono text-[12px] text-[#5B6069]">{t.closing.funnel}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-[#0A0B0D] pb-20 sm:pb-0">
        <div className="mx-auto grid w-full max-w-[1120px] gap-4 px-6 py-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <Wordmark tone="paper" className="text-[12px]" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#8A9099] sm:justify-end">
            <Link href="/about" className="transition-colors hover:text-white">
              {t.footer.about}
            </Link>
            <Link href="/how-it-works" className="transition-colors hover:text-white">
              {t.footer.how}
            </Link>
            <Link href="/login?audience=worker" className="transition-colors hover:text-white">
              {t.footer.signIn}
            </Link>
            <Link href="/" className="transition-colors hover:text-white">
              {t.footer.sendWork}
            </Link>
          </div>
          <div className="text-[12px] sm:col-span-2 sm:border-t sm:border-white/10 sm:pt-4">
            <TrustLinks tone="night" lang={lang} />
          </div>
        </div>
      </footer>

      <StickyApply label={t.nav.apply} href="/register/va" />
    </div>
  );
}
