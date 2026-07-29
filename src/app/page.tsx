import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, roleHome } from "@/lib/authz";

/* ─────────────────────────────────────────────────────────────────────────
   The landing page is a picture, not an essay: a real file arriving broken at
   night and leaving clean in the morning. Everything else is caption.
   Palette: night #0A0B0D / surface #111317 / dusk #1B2740 / paper #F7F6F3 /
   ink #14161A. Amber appears ONLY on damaged cells; green ONLY on fixed rows.
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

const LEDGER = [
  ["Clean 4,000 duplicate HubSpot contacts", "$85"],
  ["Build a list of 300 Florida dental clinics with owner emails", "$140"],
  ["Retype 62 scanned delivery slips into the ops sheet", "$60"],
  ["Format a 90-page proposal to the client template", "$75"],
  ["Chase 18 unpaid invoices and log every reply", "$95"],
  ["Rename and file 900 job-site photos by address", "$50"],
];

const TERMS = [
  ["PRICE", "One fixed price, approved before any work starts."],
  ["REVIEW", "Every file is checked by a person before you see it."],
  ["DATA", "Access ends when the task does. Files purged after 90 days."],
  ["COMMITMENT", "No subscription, no minimum. Skip a night by not sending a task."],
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

function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`truncate px-3 ${className}`}>{children}</div>;
}

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect(roleHome(user.role));

  return (
    <div className="bg-[#0A0B0D]">
      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <header className="border-b border-white/8">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-6">
          <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-white">
            Nightlexicon
          </span>
          <div className="flex items-center gap-5">
            <Link
              href="/login"
              className="text-[13px] font-medium text-[#8A9099] transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[13px] font-medium text-[#14161A] transition-colors hover:bg-white"
            >
              Send a task
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1120px] px-6 pb-4 pt-20 sm:pt-28">
        <h1 className="max-w-[16ch] text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
          <span className="block text-[#767C86]">Send the mess tonight.</span>
          <span className="block text-white">Get it back clean by morning.</span>
        </h1>
        <p className="mt-6 max-w-[46ch] text-[17px] leading-[1.5] text-[#9AA1AB]">
          Any admin task, described in plain English. One fixed price, approved before we
          start. Done by a person, overnight.
        </p>
        <div className="mt-8">
          <Link
            href="/register"
            className="inline-flex rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] transition-colors hover:bg-white"
          >
            Describe your task
          </Link>
        </div>
        <p className="mt-4 font-mono text-[13px] text-[#6B7280]">
          You get a fixed price back within one business hour.
        </p>
      </section>

      {/* ── THE DIFF ──────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1120px] px-6 pb-24 pt-12">
        <p className="mb-3 max-w-[70ch] font-mono text-[11px] leading-relaxed text-[#767C86]">
          One task from last Tuesday, sent as a sentence: &ldquo;Dedupe our exported leads,
          fix the company names, drop anyone we can&apos;t email.&rdquo;
        </p>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]">
          <div className="grid md:grid-cols-2">
            {/* BEFORE */}
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
                          aria-hidden
                          className="inline-block h-[14px] w-[60%] rounded-[2px] align-middle"
                          style={HATCH}
                        />
                      ) : (
                        <span style={r.broken ? { boxShadow: "inset 0 -2px 0 #D98324" } : undefined}>
                          {r.email}
                        </span>
                      )}
                    </Cell>
                  </div>
                ))}
              </div>
            </div>

            {/* AFTER */}
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
                    className="grid h-[34px] grid-cols-[1fr_0.7fr_1.1fr_auto] items-center border-b border-black/6 last:border-0"
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
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#14161A]" aria-hidden>
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
            <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
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
      </section>

      {/* ── THE RECEIPT ───────────────────────────────────────────────── */}
      <section className="border-t border-white/8">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-24">
          <p className="mb-10 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
            One price. Approved first.
          </p>
          <div className="mx-auto max-w-[420px]">
            <div className="rounded-xl border border-white/10 bg-[#111317] p-5 font-mono text-[12px]">
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
              <p>Fixed. Never hourly.</p>
              <p>You approve before work starts.</p>
              <p>Back before your first meeting.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE LEDGER (paper) ────────────────────────────────────────── */}
      <section className="bg-[#F7F6F3]">
        <div className="mx-auto w-full max-w-[880px] px-6 py-24">
          <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
            If you can describe it, it gets done.
          </h2>
          <div className="mt-8">
            {LEDGER.map(([task, price]) => (
              <div
                key={task}
                className="flex items-baseline justify-between gap-6 border-b border-black/8 py-[18px]"
              >
                <span className="font-mono text-[13px] text-[#5B6069]">{task}</span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-[#14161A]">
                  {price} · 7:00 AM
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE NIGHT BAND (paper) ────────────────────────────────────── */}
      <section className="border-t border-black/8 bg-[#F7F6F3]">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-24">
          <div className="space-y-2">
            {[
              { label: "NEW YORK · ET", lit: (h: number) => h >= 8 && h <= 17 },
              { label: "MANILA · PHT +12", lit: (h: number) => h < 8 || h > 17 },
            ].map((row) => (
              <div key={row.label}>
                <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
                  {row.label}
                </p>
                <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px overflow-hidden rounded bg-black/8">
                  {Array.from({ length: 24 }, (_, i) => (
                    <span
                      key={i}
                      className={`h-8 ${row.lit(i) ? "bg-[#14161A]" : "bg-[#1B2740]/15"}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {NIGHT_STEPS.map(([time, text]) => (
              <div key={time}>
                <p className="font-mono text-[11px] tabular-nums text-[#767C86]">{time}</p>
                <p className="mt-1 text-[15px] leading-snug text-[#14161A]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TERMS (paper) ─────────────────────────────────────────────── */}
      <section className="border-t border-black/8 bg-[#F7F6F3]">
        <div className="mx-auto w-full max-w-[880px] px-6 py-24">
          {TERMS.map(([label, text]) => (
            <div
              key={label}
              className="grid gap-2 border-b border-black/8 py-5 sm:grid-cols-[140px_1fr] sm:gap-6"
            >
              <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#767C86]">
                {label}
              </span>
              <span className="text-[16px] leading-relaxed text-[#14161A]">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CLOSING (paper page, ink block) ───────────────────────────── */}
      <section className="bg-[#F7F6F3] pb-16">
        <div className="mx-auto w-full max-w-[880px] px-6">
          <div className="rounded-2xl bg-[#0A0B0D] px-6 py-16 text-center">
            <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-white">
              Send your first task tonight.
            </h2>
            <div className="mt-7">
              <Link
                href="/register"
                className="inline-flex rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] transition-colors hover:bg-white"
              >
                Describe your task
              </Link>
            </div>
            <p className="mt-4 font-mono text-[12px] text-[#767C86]">
              Priced within one business hour. Nothing starts until you approve it.
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="border-t border-black/8 bg-[#F7F6F3]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-6">
          <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-[#14161A]">
            Nightlexicon
          </span>
          <div className="flex items-center gap-6 text-[13px] text-[#5B6069]">
            <Link href="/login" className="transition-colors hover:text-[#14161A]">
              Sign in
            </Link>
            <Link href="/register/va" className="transition-colors hover:text-[#14161A]">
              Work with us
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
