import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, roleHome } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { Reveal } from "@/components/reveal";
import { AudienceToggle } from "@/components/audience-toggle";
import { PublicCounters } from "@/components/public-counters";

/* ─────────────────────────────────────────────────────────────────────────
   The landing page is a picture, not an essay: a real file arriving broken at
   night and leaving clean in the morning. Everything else is caption.
   Palette: night #0A0B0D / surface #111317 / dusk #1B2740 / paper #F7F6F3 /
   ink #14161A. Amber appears ONLY on damaged cells; green ONLY on fixed rows.
   Motion: entrance rise on the hero, scroll-reveals below the fold, two
   ambient loops (hero glow, seam nudge) — all gated on prefers-reduced-motion.
   ───────────────────────────────────────────────────────────────────────── */

const BEFORE_ROWS = [
  { company: "acme widgets inc", contact: "j. smith", email: null },
  { company: "ACME WIDGETS, INC.", contact: "John Smith", email: "jsmith@acme.com" },
  { company: "northwind trading", contact: "m. garcia", email: "m.garcia@northwind", broken: true },
  { company: "Northwind Trading Co", contact: "Maria Garcia", email: null },
  { company: "delta tooling llc", contact: "r. chen", email: "rchen@delta.co" },
  { company: "DELTA TOOLING", contact: "Ray Chen", email: "rchen@delta.co" },
];

const AFTER_ROWS = [
  { company: "Acme Widgets Inc.", contact: "John Smith", email: "jsmith@acme.com", tag: "merged" },
  { company: "Northwind Trading Co.", contact: "Maria Garcia", email: "m.garcia@northwind.com", tag: "fixed" },
  { company: "Delta Tooling LLC", contact: "Ray Chen", email: "rchen@delta.co", tag: "merged" },
  { company: "Prairie Fabrication", contact: "Dana Okafor", email: "d.okafor@prairiefab.com", tag: "fixed" },
  { company: "Halcyon Freight", contact: "Tom Iversen", email: "t.iversen@halcyon.io", tag: "kept" },
];

/* Deliberately spread across research, writing, data, media and admin — the
   breadth of the marketplace is proven by the spread, not by a claim.
   Index-table discipline: mono category tag + ≤7-word title + green figure. */
const LEDGER: [string, string, string][] = [
  ["DATA", "4,000 duplicate CRM contacts, cleaned", "$85"],
  ["RESEARCH", "300 dental clinics with owner emails", "$140"],
  ["WRITING", "12 product descriptions from spec sheets", "$70"],
  ["MEDIA", "8 hours of interviews, transcribed and tagged", "$110"],
  ["RESEARCH", "5 competitors' pricing pages, one sheet", "$95"],
  ["DOCS", "90-page proposal rebuilt in our template", "$75"],
];

/* The candor block: constraints stated as features. One line each. */
const terms = (retentionDays: number): [string, string][] => [
  ["PRICE", "One fixed price, approved before anything starts."],
  ["REVIEW", "Every delivery is reviewed before you see it."],
  ["IDENTITY", "You never meet the worker. That's the point."],
  ["DATA", `Access ends with the task. Files purged after ${retentionDays} days.`],
  ["REFUSALS", "Some tasks we turn down."],
];

const NIGHT_STEPS = [
  ["6:41 PM", "You describe the task."],
  ["7:15 PM", "One fixed price. You approve it."],
  ["Overnight", "A trained assistant does the work."],
  ["7:07 AM", "It is checked, then it is yours."],
];

const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(45deg, transparent 0 4px, rgba(255,255,255,.10) 4px 5px)",
};

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

function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`truncate px-3 ${className}`}>{children}</div>;
}

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect(roleHome(user.role));
  const settings = await getSettings();

  return (
    <div className="overflow-x-clip bg-[#0A0B0D]">
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
          <div className="flex items-center justify-end gap-5">
            <Link
              href="/login"
              className="text-[12px] font-medium text-[#8A9099] transition-colors hover:text-white sm:text-[13px]"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="lift hidden rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[13px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_6px_24px_rgba(247,246,243,0.18)] sm:block"
            >
              Send a task
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* ambient glow + film grain */}
        <div
          aria-hidden
          className="hero-glow pointer-events-none absolute -top-40 left-[8%] h-[520px] w-[760px] rounded-full bg-[#1B2740] blur-[130px]"
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04]" style={NOISE} />

        <div className="relative mx-auto grid w-full max-w-[1120px] gap-12 px-6 pb-4 pt-20 sm:pt-28 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <h1 className="max-w-[17ch] text-[clamp(2.75rem,6.5vw,5rem)] font-semibold leading-[1.01] tracking-[-0.035em]">
              <span className="anim-rise block text-[#767C86]">Describe any task.</span>
              <span className="anim-rise d-1 block text-white">Get it back done by morning.</span>
            </h1>
            <p className="anim-rise d-2 mt-6 max-w-[52ch] text-[17px] leading-[1.5] text-[#9AA1AB]">
              Research, data, writing, spreadsheets, admin — priced in{" "}
              {settings.quoteTurnaroundHours} working hours, delivered by morning.
            </p>
            <div className="anim-rise d-3 mt-8">
              <Link
                href="/register"
                className="lift inline-flex rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_10px_36px_rgba(247,246,243,0.22)]"
              >
                Describe your task
              </Link>
            </div>
          </div>

          {/* The product IS the hero image: a quote arriving, dense and real.
              This window carries the page's ONE deep shadow. */}
          <p className="sr-only">
            Product preview: a task titled &ldquo;Clean a 1,800-row supplier price
            list&rdquo; arrives with a fixed quote of $74, scope and morning return time
            printed, ready to approve — priced by the operator 34 minutes after intake.
          </p>
          <div aria-hidden className="anim-rise d-3 relative">
            <div className="pointer-events-none absolute -inset-6 rounded-[24px] bg-[#1B2740]/40 blur-[60px]" />
            <div className="relative overflow-hidden rounded-[16px] border border-white/10 bg-[#111317] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)]">
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
                <span className="font-mono text-[11px] text-[#8A9099]">task_0448</span>
                <span className="rounded-[3px] bg-[#F7F6F3] px-1.5 py-[3px] font-mono text-[9px] uppercase leading-none tracking-[0.14em] text-[#14161A]">
                  Quote ready
                </span>
              </div>
              <div className="px-4 py-4">
                <p className="text-[15px] font-medium text-[#F7F6F3]">
                  Clean a 1,800-row supplier price list
                </p>
                <div className="mt-3 space-y-1.5 font-mono text-[12px]">
                  <div className="flex justify-between gap-4">
                    <span className="shrink-0 text-[#767C86]">SCOPE</span>
                    <span className="truncate text-[#C9CDD3]">merge duplicates, fix units</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="shrink-0 text-[#767C86]">RETURNS</span>
                    <span className="text-[#C9CDD3]">7:00 AM ET</span>
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between border-t border-white/8 pt-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#767C86]">
                    Fixed price
                  </span>
                  <span className="font-mono text-[26px] font-medium tabular-nums text-[#F7F6F3] underline decoration-[#1E7F5C] decoration-2 underline-offset-4">
                    $74
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  <span className="lift flex-1 rounded-md bg-[#F7F6F3] py-2 text-center text-[12px] font-medium text-[#14161A]">
                    Approve
                  </span>
                  <span className="flex-1 rounded-md border border-white/15 py-2 text-center text-[12px] font-medium text-[#8A9099]">
                    Ask a question
                  </span>
                </div>
              </div>
              <div className="border-t border-white/8 bg-[#0F1011] px-4 py-2.5 font-mono text-[11px] text-[#767C86]">
                <span className="text-[#8A9099]">7:15 PM</span> · priced by the operator ·{" "}
                <span className="text-[#8A9099]">34 min after intake</span>
              </div>
            </div>
          </div>
        </div>

        {/* live counters — the proof, at the moment of the promise */}
        <PublicCounters tone="night" variant="strip" className="anim-rise d-4 mt-12" />
      </section>

      {/* ── THE DIFF ──────────────────────────────────────────────────── */}
      <section className="relative mx-auto w-full max-w-[1120px] px-6 pb-24 pt-12">
        <p className="anim-rise d-5 mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
          01<span className="opacity-50">/06</span> · The overnight diff
        </p>
        <p className="anim-rise d-5 mb-3 max-w-[74ch] font-mono text-[11px] leading-relaxed text-[#767C86]">
          &ldquo;Dedupe our leads, fix the names, drop bad emails.&rdquo; — sent 6:41 PM
        </p>

        <p className="sr-only">
          Example: a lead export arrives with duplicate companies, inconsistent casing and
          missing or invalid emails; it is returned the next morning deduplicated and
          corrected, for a fixed price of $68 approved in advance.
        </p>

        <Reveal>
          {/* dusk halo behind the flagship artifact — static atmosphere */}
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-10 -inset-y-8 rounded-[32px] bg-[#1B2740]/25 blur-[80px]"
            />
          <div
            aria-hidden
            className="relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] transition-shadow duration-500 hover:shadow-[0_36px_90px_-20px_rgba(0,0,0,0.8)]"
          >
            {/* app-window chrome: this is the product, not an illustration */}
            <div className="flex items-center justify-between border-b border-white/8 bg-[#0F1011] px-4 py-2.5">
              <span className="font-mono text-[11px] text-[#8A9099]">
                second shift · task_0447
              </span>
              <span className="rounded border border-[#1E7F5C]/40 bg-[#1E7F5C]/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#F7F6F3]">
                Delivered 7:07 AM
              </span>
            </div>
            <div className="grid md:grid-cols-2">
              {/* BEFORE — static: the mess is already there */}
              <div className="bg-[#111317]">
                <div className="flex h-10 items-center gap-2 border-b border-white/8 px-4">
                  <span className="h-1.5 w-1.5 rounded-full border border-[#767C86]" />
                  <span className="font-mono text-[11px] text-[#8A9099]">
                    leads_export.csv · sent 6:41 PM
                  </span>
                </div>
                <div className="font-mono text-[12px] tabular-nums text-[#8A9099]">
                  {BEFORE_ROWS.map((r, i) => (
                    <div
                      key={i}
                      className="grid h-[34px] grid-cols-[1fr_0.75fr_1.15fr] items-center border-b border-white/6 last:border-0"
                    >
                      <Cell>{r.company}</Cell>
                      <Cell>{r.contact}</Cell>
                      <Cell>
                        {r.email === null ? (
                          <span
                            className="inline-block h-[14px] w-[60%] rounded-[2px] align-middle"
                            style={HATCH}
                          />
                        ) : (
                          <span
                            style={r.broken ? { boxShadow: "inset 0 -2px 0 #D98324" } : undefined}
                          >
                            {r.email}
                          </span>
                        )}
                      </Cell>
                    </div>
                  ))}
                </div>
              </div>

              {/* AFTER — rows stagger in: the work happening */}
              <div className="border-t border-white/10 bg-[#F7F6F3] md:border-l md:border-t-0">
                <div className="flex h-10 items-center gap-2 border-b border-black/8 px-4">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1E7F5C]" />
                  <span className="font-mono text-[11px] text-[#5B6069]">
                    leads_export_clean.csv · returned 7:07 AM
                  </span>
                </div>
                <div className="font-mono text-[12px] tabular-nums text-[#14161A]">
                  {AFTER_ROWS.map((r, i) => (
                    <div
                      key={i}
                      className="srow grid h-[34px] grid-cols-[1fr_0.7fr_1.1fr_auto] items-center border-b border-black/6 last:border-0"
                    >
                      <Cell>{r.company}</Cell>
                      <Cell>{r.contact}</Cell>
                      <Cell>{r.email}</Cell>
                      <div className="pr-3">
                        <span className="rounded bg-[#1E7F5C]/10 px-1.5 py-0.5 text-[10px] text-[#166049]">
                          {r.tag}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* seam badge — desktop only, sits on the vertical join */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 flex-col items-center md:flex">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F7F6F3] shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
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
                Overnight
              </span>
            </div>

            {/* footer bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0A0B0D] px-4 py-3 font-mono text-[12px]">
              <span className="text-[#767C86]">
                142 rows · 18 duplicates merged · 31 emails corrected · 9 dropped
              </span>
              <span className="text-white">$68 — approved before any work started.</span>
            </div>
          </div>
          </div>
        </Reveal>
      </section>

      {/* ── THE RECEIPT ───────────────────────────────────────────────── */}
      <section className="border-t border-white/8">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-24">
          <Reveal>
            <p className="mb-10 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
              02<span className="opacity-50">/06</span> · One price. Approved first.
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
                <p className="mt-2 text-right text-[11px] text-[#767C86]">
                  No subscription. No minimum. No hourly meter.
                </p>
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
                <p className="srow">Fixed. Never hourly.</p>
                <p className="srow">You approve before work starts.</p>
                <p className="srow">Back before your first meeting.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── THE LEDGER (paper) ────────────────────────────────────────── */}
      <section className="bg-[#F7F6F3]">
        <div className="mx-auto w-full max-w-[880px] px-6 py-24">
          <Reveal>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
              03<span className="opacity-50">/06</span> · The ledger
            </p>
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
              If you can describe it, it gets done.
            </h2>
            <div className="mt-8">
              {LEDGER.map(([tag, task, price]) => (
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
            <p className="mt-4 font-mono text-[11px] text-[#5B6069]">
              Illustrative tasks. Every price fixed, approved first.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── THE NIGHT BAND (paper) ────────────────────────────────────── */}
      <section className="border-t border-black/8 bg-[#F7F6F3]">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-24">
          <Reveal>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
              04<span className="opacity-50">/06</span> · The night
            </p>
            <h2 className="mb-2 text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
              Your night is their working day.
            </h2>
            <p className="mb-8 max-w-[52ch] text-[15px] leading-relaxed text-[#5B6069]">
              Your team stops at 5 PM. Theirs starts, twelve hours ahead.
            </p>
            <div className="space-y-4">
              {[
                { label: "Your working hours — New York", lit: (h: number) => h >= 8 && h <= 17 },
                {
                  label: "Their working hours — Manila, 12 hours ahead",
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
                      className="band-sweep absolute inset-y-0 left-0 w-[2px] bg-[#F7F6F3] mix-blend-difference"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {NIGHT_STEPS.map(([time, text]) => (
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
              06<span className="opacity-50">/06</span> · The terms
            </p>
            {terms(settings.retentionDays).map(([label, text]) => (
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
              05<span className="opacity-50">/06</span> · The operator
            </p>
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
              One professional between you and the work.
            </h2>
            <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-[#5B6069]">
              Run by an operator, not an algorithm. One professional prices, matches and
              reviews every task.
            </p>
            <div className="mt-8">
              <div className="mb-2 hidden grid-cols-2 gap-6 md:grid">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#5B6069]">
                  There
                </span>
                <span className="w-fit rounded border border-[#1E7F5C]/40 bg-[#1E7F5C]/10 px-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[#166049]">
                  Here
                </span>
              </div>
              {[
                ["Post a job. Read forty proposals.", "Describe it once. One price back in hours, not days."],
                ["Interview, hire, onboard, manage.", "Nothing to manage. The operator runs the night."],
                ["Hourly meters running while you sleep.", "One fixed price, approved before anything starts."],
                ["Hope it's right in the morning.", "Reviewed by a professional before you ever see it."],
              ].map(([there, here]) => (
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
                className="hero-glow pointer-events-none absolute -top-24 left-1/2 h-[280px] w-[480px] -translate-x-1/2 rounded-full bg-[#1B2740] blur-[110px]"
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04]" style={NOISE} />
              <div className="relative">
                <h2 className="text-[30px] font-semibold tracking-[-0.02em]">
                  <span className="block text-[#767C86]">Describe any task.</span>
                  <span className="block text-white">Get it back done by morning.</span>
                </h2>
                <div className="mt-7">
                  <Link
                    href="/register"
                    className="lift inline-flex rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white hover:shadow-[0_10px_36px_rgba(247,246,243,0.22)]"
                  >
                    Describe your task
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
              How it works
            </Link>
            <Link href="/login" className="transition-colors hover:text-[#14161A]">
              Sign in
            </Link>
            <Link href="/workers" className="transition-colors hover:text-[#14161A]">
              Work with us
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
