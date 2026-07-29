import Link from "next/link";
import { Reveal } from "@/components/reveal";

/* ─────────────────────────────────────────────────────────────────────────
   The doctrine page: the operating rules published as a numbered, versioned
   spec. Documentation is the trust artifact — a one-operator company earns
   authority by writing its constraints down, not by claiming scale.
   Paper surface: this is a document.
   ───────────────────────────────────────────────────────────────────────── */

export const metadata = {
  title: "How it works — the protocol",
  description:
    "One fixed price, one operator, one review standard. The Second Shift protocol, versioned and dated.",
  alternates: { canonical: "/how-it-works" },
};

const PROTOCOL: [string, string, string][] = [
  ["01", "DESCRIBE", "You describe the task in plain English. Attach files if it needs them."],
  ["02", "PRICE", "The operator sets one fixed price. Within four hours. You approve or decline."],
  ["03", "NIGHT", "A vetted specialist claims it while America sleeps. You never meet."],
  ["04", "REVIEW", "The operator checks every delivery. Sent back until right, up to 2 rounds."],
  ["05", "MORNING", "Delivered before your day starts. 72 hours to flag anything."],
  ["06", "DATA", "Access ends with the task. Files purged after 90 days."],
];

const STANDARD = [
  "Complete — every item the brief names, done.",
  "Verified — checked against the source files, not skimmed.",
  "Clean — formatted, consistent, nothing half-finished.",
  "Honest — gaps and judgment calls flagged, never hidden.",
];

const REFUSALS = [
  "Live calls or anything that puts you and the worker in contact.",
  "Anything that needs your identity to cross the seam.",
  "Anything illegal, deceptive, or that harvests private personal data.",
];

export default function HowItWorks() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F7F6F3]">
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#F7F6F3]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[880px] items-center justify-between px-6">
          <Link
            href="/"
            className="whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.22em] text-[#14161A]"
          >
            Second Shift
          </Link>
          <div className="flex items-center gap-5 text-[13px] font-medium">
            <Link href="/" className="text-[#5B6069] transition-colors hover:text-[#14161A]">
              Get work done
            </Link>
            <Link href="/workers" className="text-[#5B6069] transition-colors hover:text-[#14161A]">
              For workers
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[880px] px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
          Protocol · v1 · July 2026
        </p>
        <h1 className="mt-3 text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-[#14161A]">
          One price. One operator. One standard.
        </h1>

        {/* ── The protocol ─────────────────────────────────────────────── */}
        <Reveal className="mt-12">
          <div className="rounded-lg border border-[#14161A]/10 bg-white shadow-[0_1px_2px_rgba(20,22,26,0.04)]">
            {PROTOCOL.map(([n, label, text]) => (
              <div
                key={n}
                className="srow grid grid-cols-[52px_110px_1fr] items-baseline gap-3 border-b border-[#14161A]/[0.06] px-5 py-4 last:border-0 sm:gap-6"
              >
                <span className="font-mono text-[11px] tabular-nums text-[#5B6069]">{n}/06</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#14161A]">
                  {label}
                </span>
                <span className="text-[14px] leading-relaxed text-[#14161A]">{text}</span>
              </div>
            ))}
          </div>
        </Reveal>

        {/* ── The review standard ──────────────────────────────────────── */}
        <Reveal className="mt-16">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
            What &ldquo;passes review&rdquo; means
          </h2>
          <div className="mt-4">
            {STANDARD.map((s) => (
              <p
                key={s}
                className="srow border-b border-black/8 py-3 text-[14px] leading-relaxed text-[#14161A]"
              >
                {s}
              </p>
            ))}
          </div>
          <p className="mt-4 font-mono text-[11px] text-[#5B6069]">
            A delivery that misses the bar goes back with notes, up to 2 rounds. A final
            fail is unpaid — the worker&apos;s risk, never yours.
          </p>
        </Reveal>

        {/* ── Refusals ─────────────────────────────────────────────────── */}
        <Reveal className="mt-16">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
            What we turn down
          </h2>
          <div className="mt-4">
            {REFUSALS.map((s) => (
              <p
                key={s}
                className="srow border-b border-black/8 py-3 text-[14px] leading-relaxed text-[#14161A]"
              >
                {s}
              </p>
            ))}
          </div>
        </Reveal>

        {/* ── Bookend ──────────────────────────────────────────────────── */}
        <Reveal className="mt-16">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[#0A0B0D] px-6 py-8">
            <p className="text-[18px] font-semibold tracking-[-0.02em]">
              <span className="text-[#767C86]">Describe any task. </span>
              <span className="text-white">Get it back done by morning.</span>
            </p>
            <Link
              href="/register"
              className="lift inline-flex rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[14px] font-medium text-[#14161A] hover:bg-white"
            >
              Describe your task
            </Link>
          </div>
        </Reveal>

        <p className="mt-10 font-mono text-[11px] text-[#5B6069]">
          Changes to this protocol are versioned and dated here.
        </p>
      </main>
    </div>
  );
}
