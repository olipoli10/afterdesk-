import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser, roleHome } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { Reveal } from "@/components/reveal";
import { AudienceToggle } from "@/components/audience-toggle";
import { PublicCounters } from "@/components/public-counters";
import { PointerGlow } from "@/components/pointer-glow";
import { WORKERS_I18N, workersLangOf, type WorkersLang } from "@/lib/i18n/workers";

/* ─────────────────────────────────────────────────────────────────────────
   The worker homepage — "The Sunrise Side of the Seam". The client page is a
   file disappearing into the night and coming back at dawn; this page is the
   same building walked around from the back. Identical skeleton, palette
   flipped: daylight paper where the client had night, night as the accent.

   Bilingual: English / Tagalog via ?lang= + the ss-lang cookie (set by the
   middleware). The ARTIFACTS (pool rows, ledger, slip) stay English — real
   tasks arrive in English, and showing that is honest signaling.

   Palette law (unchanged): green #1E7F5C only money/fixed/passed; amber only
   returned-work; green text never directly on night (paper text + green
   underline there). Margin-pairing rule: example tasks/amounts here never
   share a domain or amount with the client page's examples.
   ───────────────────────────────────────────────────────────────────────── */

export const metadata = {
  title: "Work with us — get paid for careful work",
  description:
    "Tasks arrive while America sleeps, the payout printed on every one. No proposals, no bidding, no clients to manage.",
  alternates: { canonical: "/workers" },
};

const POOL_ROWS: {
  task: string;
  payout: string;
  tag: "open" | "you" | "claimed" | "high";
}[] = [
  { task: "Tag 1,200 support tickets by topic", payout: "$54", tag: "open" },
  { task: "Verify addresses for 620 store locations", payout: "$48", tag: "open" },
  { task: "Summarize 25 zoning PDFs into one memo", payout: "$66", tag: "you" },
  { task: "Type 14 handwritten order forms into a sheet", payout: "$38", tag: "open" },
  { task: "Rename and file 300 scanned receipts to a naming scheme", payout: "$72", tag: "claimed" },
  { task: "Reconcile a quarter of card statements", payout: "$120", tag: "high" },
];

/* One claimed task's day — including a send-back, because the standard is
   recoverable craft, not a strike. Artifact: stays English. */
const LEDGER_LINES: {
  t: string;
  label: string;
  detail: string;
  amber?: boolean;
  chip?: boolean;
  big?: boolean;
  money?: boolean;
}[] = [
  { t: "07:22", label: "CLAIMED", detail: "Summarize 25 zoning PDFs", money: true },
  { t: "13:05", label: "DELIVERED", detail: "zoning_memo_v1.pdf" },
  { t: "13:58", label: "SENT BACK", detail: "two parcels missing citations", amber: true },
  { t: "16:52", label: "DELIVERED", detail: "zoning_memo_v2.pdf" },
  { t: "", label: "REVIEW", detail: "PASSED", chip: true },
  { t: "", label: "RELEASED", detail: "$66", big: true },
];

/* The zeros are the differentiation argument, run as arithmetic. */
const SLIP_ZEROS: [string, string][] = [
  ["Bidding fee", "$0.00"],
  ["Proposal writing", "$0.00"],
  ["Commission off your rate", "$0.00"],
  ["Client calls", "0"],
];

const NOISE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
};

function PoolChip({ tag }: { tag: "open" | "you" | "claimed" | "high" }) {
  const base =
    "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide";
  // Palette law: green is reserved for money/fixed/passed — a claim is a
  // state, so the "you" chip is ink, and only the payout on the row is green.
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
  return (
    <span className={`${base} border border-[#14161A]/20 text-[#5B6069]`}>Open</span>
  );
}

function LangSwitch({ lang }: { lang: WorkersLang }) {
  const seg = "rounded px-1.5 py-0.5 transition-colors duration-150";
  return (
    <span className="flex items-center gap-0.5 font-mono text-[11px]">
      <Link
        href="/workers?lang=en"
        aria-current={lang === "en" ? "true" : undefined}
        className={`${seg} ${lang === "en" ? "bg-[#14161A] text-[#F7F6F3]" : "text-[#5B6069] hover:text-[#14161A]"}`}
      >
        EN
      </Link>
      <Link
        href="/workers?lang=tl"
        aria-current={lang === "tl" ? "true" : undefined}
        className={`${seg} ${lang === "tl" ? "bg-[#14161A] text-[#F7F6F3]" : "text-[#5B6069] hover:text-[#14161A]"}`}
      >
        TL
      </Link>
    </span>
  );
}

export default async function WorkersHome({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect(roleHome(user.role));
  const settings = await getSettings();
  const sp = await searchParams;
  const cookieStore = await cookies();
  const lang = workersLangOf(sp.lang ?? cookieStore.get("ss-lang")?.value);
  const t = WORKERS_I18N[lang];
  const ch = (n: string, label: string) => (
    <>
      {n}
      <span className="opacity-50">/06</span> · {label}
    </>
  );

  return (
    <div className="overflow-x-clip bg-[#F7F6F3]">
      {/* ── NAV — sticky, blurred, paper ──────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#F7F6F3]/80 backdrop-blur-md">
        <div className="mx-auto grid h-14 w-full max-w-[1120px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
          <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] text-[#14161A] sm:text-[13px] sm:tracking-[0.22em]">
            Second Shift
          </span>
          <AudienceToggle side="worker" tone="paper" />
          <div className="flex items-center justify-end gap-3 sm:gap-5">
            <LangSwitch lang={lang} />
            <Link
              href="/login"
              className="hidden text-[13px] font-medium text-[#5B6069] transition-colors hover:text-[#14161A] sm:block"
            >
              {t.nav.signIn}
            </Link>
            <Link
              href="/register/va"
              className="lift rounded-full bg-[#14161A] px-3 py-1 text-[12px] font-medium text-[#F7F6F3] hover:bg-black hover:shadow-[0_6px_24px_rgba(20,22,26,0.25)] sm:px-4 sm:py-1.5 sm:text-[13px]"
            >
              {t.nav.apply}
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO — morning light ──────────────────────────────────────── */}
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

        <div className="relative mx-auto w-full max-w-[1120px] px-6 pb-4 pt-20 sm:pt-28">
          <h1 className="max-w-[17ch] text-[clamp(2.75rem,6.5vw,5rem)] font-semibold leading-[1.01] tracking-[-0.035em]">
            <span className="anim-rise block text-[#8A9099]">{t.hero.line1}</span>
            <span className="anim-rise d-1 block text-[#14161A]">{t.hero.line2}</span>
          </h1>
          <p className="anim-rise d-2 mt-6 max-w-[54ch] text-[17px] leading-[1.5] text-[#5B6069]">
            {t.hero.sub}
          </p>
          <div className="anim-rise d-3 mt-8">
            <Link
              href="/register/va"
              className="lift inline-flex rounded-full bg-[#14161A] px-5 py-2.5 text-[15px] font-medium text-[#F7F6F3] hover:bg-black hover:shadow-[0_10px_36px_rgba(20,22,26,0.28)]"
            >
              {t.hero.cta}
            </Link>
          </div>
          <p className="anim-rise d-4 mt-4 font-mono text-[13px] text-[#5B6069]">
            {t.hero.micro}
          </p>
        </div>

        {/* live counters — real aggregates, hidden until the ledger is non-zero */}
        <PublicCounters tone="paper" variant="strip" className="anim-rise d-5 mt-12" />
      </section>

      {/* ── THE POOL → YOUR LEDGER ────────────────────────────────────── */}
      <section className="relative mx-auto w-full max-w-[1120px] px-6 pb-24 pt-12">
        <p className="anim-rise d-6 mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
          {ch("01", t.ch01.label)}
        </p>
        <p className="anim-rise d-6 mb-3 max-w-[74ch] font-mono text-[11px] leading-relaxed text-[#5B6069]">
          {t.ch01.caption}
        </p>

        <p className="sr-only">
          Example: the task pool at 7:15 AM Manila lists priced tasks with fixed payouts.
          One is claimed at 7:22 AM for a fixed $66, delivered, sent back once with notes,
          re-delivered, and passes review — the $66 released is the number printed on the
          task.
        </p>

        <Reveal replay>
          <div aria-hidden className="sheen-frame sheen-frame--paper shadow-[0_24px_60px_-30px_rgba(20,22,26,0.35)]">
          <div className="relative overflow-hidden rounded-2xl">
            <div className="grid md:grid-cols-2">
              {/* THE POOL — paper, morning */}
              <div className="bg-[#F7F6F3]">
                <div className="flex h-10 items-center justify-between border-b border-[#14161A]/10 px-4">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1E7F5C]" />
                    <span className="font-mono text-[11px] text-[#5B6069]">task_pool</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#767C86]">7:15 AM Manila</span>
                </div>
                <div className="text-[13px]">
                  {POOL_ROWS.map((r) => (
                    <div
                      key={r.task}
                      className={`flex items-center gap-3 border-b border-[#14161A]/[0.06] px-4 py-[9px] last:border-0 ${
                        r.tag === "you" ? "bg-white ring-1 ring-inset ring-[#14161A]/15" : ""
                      }`}
                    >
                      <span className="truncate text-[#14161A]">{r.task}</span>
                      <span className="ml-auto shrink-0 font-mono text-[12px] tabular-nums text-[#1E7F5C]">
                        {r.payout}
                      </span>
                      <PoolChip tag={r.tag} />
                    </div>
                  ))}
                </div>
              </div>

              {/* YOUR LEDGER — night, end of day */}
              <div
                className="border-t border-[#14161A]/10 bg-[#111317] md:border-l md:border-t-0"
                style={{
                  backgroundImage:
                    "radial-gradient(ellipse at top, rgba(27,39,64,0.55) 0%, transparent 60%)",
                }}
              >
                <div className="flex h-10 items-center justify-between border-b border-white/8 px-4">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full border border-[#767C86]" />
                    <span className="font-mono text-[11px] text-[#8A9099]">your_ledger</span>
                  </span>
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
                        className={
                          l.amber
                            ? "shrink-0 text-[#D98324]"
                            : `shrink-0 ${l.big ? "text-[#F7F6F3]" : "text-[#8A9099]"}`
                        }
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
                          {l.money ? (
                            <span className="ml-2 text-[#F7F6F3] underline decoration-[#1E7F5C] decoration-2 underline-offset-4">
                              $66 fixed
                            </span>
                          ) : null}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* seam badge — the review everything crosses through */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 flex-col items-center md:flex">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F7F6F3] shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
                <svg viewBox="0 0 24 24" className="seam-chevron h-3.5 w-3.5 text-[#14161A]">
                  <path
                    d="M9 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="mt-2 rounded bg-[#0A0B0D]/60 px-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/80">
                Review
              </span>
            </div>

            {/* footer bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#14161A] px-4 py-3 font-mono text-[12px]">
              <span className="text-[#9AA1AB]">
                <span className="text-[#F7F6F3] underline decoration-[#1E7F5C] decoration-2 underline-offset-4">
                  $66 released
                </span>{" "}
                — the number printed at 7:15 AM.
              </span>
              <span className="text-[#F7F6F3]">
                New York is pouring its first coffee. The work is already there.
              </span>
            </div>
          </div>
          </div>
        </Reveal>
      </section>

      {/* ── THE PAYOUT SLIP ───────────────────────────────────────────── */}
      <section className="border-t border-black/8">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-24">
          <Reveal>
            <p className="mb-10 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-[#5B6069]">
              {ch("02", t.ch02.label)}
            </p>
            <div className="mx-auto max-w-[420px]">
              <div className="lift rounded-xl border border-[#14161A]/10 bg-white p-5 font-mono text-[12px] hover:border-[#14161A]/20">
                <div className="flex items-center justify-between border-b border-[#14161A]/10 pb-3 text-[#5B6069]">
                  <span>PAYOUT #0871</span>
                  <span className="rounded bg-[#1E7F5C]/10 px-2 py-0.5 text-[10px] uppercase text-[#1E7F5C]">
                    Fixed
                  </span>
                </div>
                {[
                  ["TASK", "Tag 1,200 support tickets by topic"],
                  ["SCOPE", "One sheet, topic per row, every ticket tagged"],
                  ["CLAIMED", "7:31 AM"],
                  ["DELIVERED", "2:14 PM"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-[#14161A]/[0.06] py-2.5">
                    <span className="shrink-0 text-[#5B6069]">{k}</span>
                    <span className="text-right text-[#14161A]">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-b border-[#14161A]/[0.06] py-2.5">
                  <span className="shrink-0 text-[#5B6069]">REVIEW</span>
                  <span className="text-right text-[#1E7F5C]">PASSED</span>
                </div>

                {/* the zeros — everything other platforms subtract, itemized */}
                <div className="space-y-1.5 py-3">
                  {SLIP_ZEROS.map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-2 text-[#5B6069]">
                      <span className="shrink-0">{k}</span>
                      <span className="mb-[3px] flex-1 border-b border-dotted border-[#14161A]/20" />
                      <span className="shrink-0 tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-baseline justify-between rounded bg-[#1E7F5C]/10 px-3 py-2.5">
                  <span className="text-[#166049]">RELEASED</span>
                  <span className="text-[26px] font-medium tabular-nums leading-none text-[#1E7F5C]">
                    $54
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-3 font-mono text-[12px] text-[#5B6069] sm:grid-cols-3">
                {t.ch02.captions.map((c) => (
                  <p key={c} className="srow border-t border-[#14161A]/20 pt-3">
                    {c}
                  </p>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── THE DAY BAND ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black/8">
        <PointerGlow tone="paper" />
        <div className="relative mx-auto w-full max-w-[1120px] px-6 py-24">
          <Reveal>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
              {ch("03", t.ch03.label)}
            </p>
            <h2 className="mb-2 text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
              {t.ch03.h2}
            </h2>
            <p className="mb-8 max-w-[52ch] text-[15px] leading-relaxed text-[#5B6069]">
              {t.ch03.sub}
            </p>
            <div className="space-y-4">
              {[
                { label: t.ch03.barYours, lit: (h: number) => h >= 8 && h <= 17 },
                {
                  label: t.ch03.barTheirs,
                  // 8 AM–5 PM New York shifted 12h onto the Manila clock.
                  lit: (h: number) => h >= 20 || h <= 5,
                },
              ].map((row) => (
                <div key={row.label}>
                  <p className="mb-1.5 text-[13px] font-medium text-[#14161A]">{row.label}</p>
                  <div className="relative grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px overflow-hidden rounded bg-black/8">
                    {Array.from({ length: 24 }, (_, i) => (
                      <span
                        key={i}
                        className={`h-8 ${row.lit(i) ? "bg-[#1B2740]" : "bg-[#14161A]/[0.06]"}`}
                      />
                    ))}
                    <span
                      aria-hidden
                      className="band-sweep absolute inset-y-0 left-0 w-[3px] bg-[#F7F6F3] mix-blend-difference"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {t.ch03.steps(settings.maxActiveClaims).map(([time, text]) => (
                <div key={time} className="srow">
                  <p className="font-mono text-[11px] tabular-nums text-[#5B6069]">{time}</p>
                  <p className="mt-1 text-[15px] leading-snug text-[#14161A]">{text}</p>
                </div>
              ))}
            </div>

            <p className="mt-8 font-mono text-[12px] text-[#5B6069]">{t.ch03.footnote}</p>
          </Reveal>
        </div>
      </section>

      {/* ── THE BAR — the page turns dark here, where the client page turned
             to paper ─────────────────────────────────────────────────── */}
      <section className="bg-[#0A0B0D]">
        <div className="relative overflow-hidden">
          <div
            aria-hidden
            className="hero-glow glow-dusk pointer-events-none absolute -top-32 left-1/2 h-[460px] w-[760px] -translate-x-1/2 opacity-60"
          />
          <div className="relative mx-auto w-full max-w-[880px] px-6 py-24">
            <Reveal>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
                {ch("04", t.ch04.label)}
              </p>
              <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#F7F6F3]">
                {t.ch04.h2}
              </h2>
              <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-[#9AA1AB]">
                {t.ch04.body}
              </p>

              <div className="mt-8 space-y-3">
                <div className="srow rounded border-l-[3px] border-[#1E7F5C] bg-[#111317] px-4 py-3 font-mono text-[13px] text-[#F7F6F3] ring-1 ring-white/[0.06]">
                  {t.ch04.rowPass}
                </div>
                <div className="srow rounded border-l-[3px] border-[#D98324] bg-[#111317] px-4 py-3 font-mono text-[13px] text-[#F7F6F3] ring-1 ring-white/[0.06]">
                  {t.ch04.rowReturned}
                </div>
                <p className="srow pl-4 font-mono text-[12px] text-[#8A9099]">
                  {t.ch04.revisionNote}
                </p>
                <div className="srow rounded border-l-[3px] border-[#5B6069] bg-[#111317] px-4 py-3 font-mono text-[13px] text-[#9AA1AB] ring-1 ring-white/[0.06]">
                  {t.ch04.rowFail}
                </div>
              </div>

              <p className="mt-8 border-t border-white/10 pt-4 font-mono text-[12px] leading-relaxed text-[#767C86]">
                {t.ch04.closing}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── THERE / HERE ──────────────────────────────────────────────── */}
      <section className="border-t border-white/8 bg-[#0A0B0D]">
        <div className="mx-auto w-full max-w-[880px] px-6 py-24">
          <Reveal>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
              {ch("05", t.ch05.label)}
            </p>
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#F7F6F3]">
              {t.ch05.h2}
            </h2>
            <div className="mt-8">
              <div className="mb-2 hidden grid-cols-2 gap-6 md:grid">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#767C86]">
                  {t.ch05.there}
                </span>
                <span className="w-fit rounded border border-[#1E7F5C]/40 bg-[#1E7F5C]/10 px-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[#F7F6F3]">
                  {t.ch05.here}
                </span>
              </div>
              {t.ch05.pairs.map(([there, here]) => (
                <div
                  key={there}
                  className="srow grid gap-2 border-b border-white/[0.05] py-4 md:grid-cols-2 md:gap-6"
                >
                  <p className="text-[14px] leading-relaxed text-[#767C86]">{there}</p>
                  <p className="text-[14px] leading-relaxed text-[#F7F6F3] md:border-l md:border-white/[0.08] md:pl-6">
                    {here}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── TERMS (night surface) ─────────────────────────────────────── */}
      <section className="border-t border-white/8 bg-[#111317]">
        <div className="mx-auto w-full max-w-[880px] px-6 py-24">
          <Reveal>
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
              {ch("06", t.ch06.label)}
            </p>
            {/* the shape of the company, in one line — decorative; the caption
                below carries the meaning for screen readers */}
            <div className="mb-10">
              <div aria-hidden className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#F7F6F3]">
                <span>You</span>
                <span className="h-px flex-1 bg-white/25" />
                <span>Operator</span>
                <span className="h-px flex-1 bg-white/25" />
                <span>Client</span>
              </div>
              <div aria-hidden className="relative mt-3">
                <div className="border-t border-dashed border-white/15" />
                <span className="absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#111317] font-mono text-[11px] text-[#767C86] ring-1 ring-white/15">
                  ×
                </span>
              </div>
              <p className="mt-3 font-mono text-[11px] text-[#8A9099]">{t.ch06.schematic}</p>
            </div>

            {t.ch06.terms(settings.maxActiveClaims, settings.maxQcRounds).map(([label, text]) => (
              <div
                key={label}
                className="srow grid gap-2 border-b border-white/[0.06] py-5 sm:grid-cols-[140px_1fr] sm:gap-6"
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
                <span className="text-[16px] leading-relaxed text-[#F7F6F3]/90">{text}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── CLOSING — paper block on night, the negative of the client's
             ink-on-paper closing ────────────────────────────────────── */}
      <section className="bg-[#0A0B0D] pb-16">
        <div className="mx-auto w-full max-w-[880px] px-6">
          <Reveal>
            <PublicCounters tone="night" variant="strip" className="mb-10" />
          </Reveal>
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-[#F7F6F3] px-6 py-16 text-center">
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.02]" style={NOISE} />
              <div className="relative">
                <h2 className="text-[30px] font-semibold tracking-[-0.02em]">
                  <span className="block text-[#8A9099]">{t.hero.line1}</span>
                  <span className="block text-[#14161A]">{t.hero.line2}</span>
                </h2>
                <div className="mt-7">
                  <Link
                    href="/register/va"
                    className="lift inline-flex rounded-full bg-[#14161A] px-5 py-2.5 text-[15px] font-medium text-[#F7F6F3] hover:bg-black hover:shadow-[0_10px_36px_rgba(20,22,26,0.3)]"
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

      {/* ── FOOTER (night) ────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-[#0A0B0D]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-6">
          <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-[#F7F6F3]">
            Second Shift
          </span>
          <div className="flex items-center gap-6 text-[13px] text-[#8A9099]">
            <Link href="/how-it-works" className="transition-colors hover:text-white">
              {t.footer.how}
            </Link>
            <Link href="/login" className="transition-colors hover:text-white">
              {t.footer.signIn}
            </Link>
            <Link href="/" className="transition-colors hover:text-white">
              {t.footer.sendWork}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
