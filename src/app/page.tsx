import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser, roleHome } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { Reveal } from "@/components/reveal";
import { AudienceToggle } from "@/components/audience-toggle";
import { PublicCounters } from "@/components/public-counters";
import { LiveTaskWindow } from "@/components/live-task-window";
import { LiveOvernightDiff } from "@/components/live-overnight-diff";
import { PointerGlow } from "@/components/pointer-glow";
import { LangSwitch } from "@/components/lang-switch";
import { CLIENT_I18N, CLIENT_LANGS, clientLangOf } from "@/lib/i18n/client";

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

const ORG_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Second Shift",
  url: "https://secondshift.co",
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
  const ch = (n: string, label: string) => (
    <>
      {n}
      <span className="opacity-50">/06</span> · {label}
    </>
  );

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
        <div className="mx-auto grid h-14 w-full max-w-[1120px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
          <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] text-white sm:text-[13px] sm:tracking-[0.22em]">
            Second Shift
          </span>
          <AudienceToggle side="client" tone="night" />
          <div className="flex items-center justify-end gap-3 sm:gap-5">
            <LangSwitch path="/" current={lang} options={CLIENT_LANGS} tone="night" />
            <Link
              href="/login"
              className="hidden text-[12px] font-medium text-[#8A9099] transition-colors hover:text-white sm:block sm:text-[13px]"
            >
              {t.nav.signIn}
            </Link>
            <Link
              href="/register"
              className="lift hidden rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[13px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_6px_24px_rgba(247,246,243,0.18)] sm:block"
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

        <div className="relative mx-auto grid w-full max-w-[1120px] gap-12 px-6 pb-4 pt-20 sm:pt-28 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
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
                className="lift inline-flex rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_10px_36px_rgba(247,246,243,0.22)]"
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
          <div aria-hidden className="anim-rise d-3">
            <LiveTaskWindow />
          </div>
        </div>

        {/* live counters — the proof, at the moment of the promise */}
        <PublicCounters tone="night" variant="strip" className="anim-rise d-4 mt-12" />
      </section>

      {/* ── THE DIFF ──────────────────────────────────────────────────── */}
      <section className="relative mx-auto w-full max-w-[1120px] px-6 pb-24 pt-12">
        <p className="anim-rise d-5 mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
          {ch("01", t.ch01.label)}
        </p>
        <p className="anim-rise d-5 mb-3 max-w-[74ch] font-mono text-[11px] leading-relaxed text-[#767C86]">
          {t.ch01.caption}
        </p>

        <p className="sr-only">
          Example: a lead export arrives with duplicate companies, inconsistent casing and
          missing or invalid emails; it is returned the next morning deduplicated and
          corrected, for a fixed price of $68 approved in advance.
        </p>

        <Reveal replay>
          {/* dusk halo behind the flagship artifact, which WORKS on loop */}
          <div className="relative">
            <div
              aria-hidden
              className="glow-dusk pointer-events-none absolute -inset-x-24 -inset-y-16"
            />
            <div aria-hidden className="relative">
              <LiveOvernightDiff />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── THE RECEIPT ───────────────────────────────────────────────── */}
      <section className="border-t border-white/8">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-24">
          <Reveal>
            <p className="mb-10 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
              {ch("02", t.ch02.label)}
            </p>
            <div className="mx-auto max-w-[420px]">
              <div className="lift rounded-xl border border-white/10 bg-[#111317] p-5 font-mono text-[12px] transition-colors hover:border-white/20 hover:bg-[#15171B]">
                <div className="flex items-center justify-between border-b border-white/8 pb-3 text-[#767C86]">
                  <span>QUOTE #0412</span>
                  <span className="text-white">FIXED</span>
                </div>
                {[
                  ["TASK", "Dedupe 142-row lead export"],
                  ["SCOPE", "Merge on email, fix names, verify"],
                  ["RETURNS", "7:07 AM ET"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-white/6 py-2.5">
                    <span className="shrink-0 text-[#767C86]">{k}</span>
                    <span className="text-right text-[#C9CDD3]">{v}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between pt-4">
                  <span className="text-[#767C86]">TOTAL</span>
                  <span className="text-[32px] font-medium tabular-nums leading-none text-white">
                    $68
                  </span>
                </div>
                <p className="mt-2 text-right text-[11px] text-[#767C86]">{t.ch02.noMeter}</p>
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

      {/* ── THE LEDGER (paper) ────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#F7F6F3]">
        <PointerGlow tone="paper" />
        <div className="relative mx-auto w-full max-w-[880px] px-6 py-24">
          <Reveal>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
              {ch("03", t.ch03.label)}
            </p>
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
              {t.ch03.h2}
            </h2>
            <div className="mt-8">
              {t.ch03.rows.map(([tag, task, price]) => (
                <div
                  key={task}
                  className="srow group flex items-baseline gap-4 border-b border-black/8 py-[15px] transition-colors hover:bg-black/[0.02] sm:gap-6"
                >
                  <span className="w-[86px] shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5B6069]">
                    {tag}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[#14161A]">
                    {task}
                  </span>
                  <span className="shrink-0 font-mono text-[13px] tabular-nums text-[#166049]">
                    {price}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 font-mono text-[11px] text-[#5B6069]">{t.ch03.caption}</p>
          </Reveal>
        </div>
      </section>

      {/* ── THE NIGHT BAND (paper) ────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black/8 bg-[#F7F6F3]">
        <PointerGlow tone="paper" />
        <div className="relative mx-auto w-full max-w-[1120px] px-6 py-24">
          <Reveal>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
              {ch("04", t.ch04.label)}
            </p>
            <h2 className="mb-2 text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
              {t.ch04.h2}
            </h2>
            <p className="mb-8 max-w-[52ch] text-[15px] leading-relaxed text-[#5B6069]">
              {t.ch04.sub}
            </p>
            <div className="space-y-4">
              {[
                { label: t.ch04.barYours, lit: (h: number) => h >= 8 && h <= 17 },
                {
                  label: t.ch04.barTheirs,
                  // 8 AM–5 PM Manila shifted 12h onto the New York clock.
                  lit: (h: number) => h >= 20 || h <= 5,
                },
              ].map((row) => (
                <div key={row.label}>
                  <p className="mb-1.5 text-[13px] font-medium text-[#14161A]">{row.label}</p>
                  <div className="relative grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px overflow-hidden rounded bg-black/8">
                    {Array.from({ length: 24 }, (_, i) => (
                      <span
                        key={i}
                        className={`h-8 ${row.lit(i) ? "bg-[#14161A]" : "bg-[#1B2740]/15"}`}
                      />
                    ))}
                    {/* the same "now" sweeping both cities at once */}
                    <span
                      aria-hidden
                      className="band-sweep absolute inset-y-0 left-0 w-[3px] bg-[#F7F6F3] mix-blend-difference"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {t.ch04.steps.map(([time, text]) => (
                <div key={time} className="srow">
                  <p className="font-mono text-[11px] tabular-nums text-[#5B6069]">{time}</p>
                  <p className="mt-1 text-[15px] leading-snug text-[#14161A]">{text}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── TERMS (paper) ─────────────────────────────────────────────── */}
      <section className="border-t border-black/8 bg-[#F7F6F3]">
        <div className="mx-auto w-full max-w-[880px] px-6 py-24">
          <Reveal>
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
              {ch("06", t.ch06.label)}
            </p>
            {t.ch06.terms(settings.retentionDays).map(([label, text]) => (
              <div
                key={label}
                className="srow grid gap-2 border-b border-black/8 py-5 sm:grid-cols-[140px_1fr] sm:gap-6"
              >
                <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#5B6069]">
                  {label}
                </span>
                <span className="text-[16px] leading-relaxed text-[#14161A]">{text}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── THE DIFFERENCE (paper) — who we are, why this and not a
             freelance marketplace ───────────────────────────────────── */}
      <section className="border-t border-black/8 bg-[#F7F6F3]">
        <div className="mx-auto w-full max-w-[880px] px-6 py-24">
          <Reveal>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
              {ch("05", t.ch05.label)}
            </p>
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
              {t.ch05.h2}
            </h2>
            <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-[#5B6069]">
              {t.ch05.body}
            </p>
            <div className="mt-8">
              <div className="mb-2 hidden grid-cols-2 gap-6 md:grid">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#5B6069]">
                  {t.ch05.there}
                </span>
                <span className="w-fit rounded border border-[#1E7F5C]/40 bg-[#1E7F5C]/10 px-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[#166049]">
                  {t.ch05.here}
                </span>
              </div>
              {t.ch05.pairs.map(([there, here]) => (
                <div
                  key={there}
                  className="srow grid gap-2 border-b border-black/8 py-4 md:grid-cols-2 md:gap-6"
                >
                  <p className="text-[14px] leading-relaxed text-[#5B6069]">{there}</p>
                  <p className="text-[14px] leading-relaxed text-[#14161A] md:border-l md:border-black/10 md:pl-6">
                    {here}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CLOSING (paper page, ink block) ───────────────────────────── */}
      <section className="bg-[#F7F6F3] pb-16">
        <div className="mx-auto w-full max-w-[880px] px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-[#0A0B0D] px-6 py-16 text-center">
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
                    className="lift inline-flex rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_10px_36px_rgba(247,246,243,0.22)]"
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
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-6">
          <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-[#14161A]">
            Second Shift
          </span>
          <div className="flex items-center gap-6 text-[13px] text-[#5B6069]">
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
        </div>
      </footer>
    </div>
  );
}
