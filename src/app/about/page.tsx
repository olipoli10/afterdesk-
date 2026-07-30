import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { TrustLinks } from "@/components/trust-links";

/* ─────────────────────────────────────────────────────────────────────────
   ABOUT US — the origin story, told in the company's own "we" voice.
   Same paper-document treatment as /how-it-works: this is a doctrine page,
   not a marketing hero, so it earns its length instead of fighting for it.

   Deliberately corporate, not confessional: no first person, no "I noticed",
   no founder photo, no name anywhere on the site right now. A company can
   be small and still speak as "we" — most one-person companies do.

   English-only, matching /how-it-works: this is the same kind of document,
   not a conversion page, so it does not carry the four-language treatment.
   ───────────────────────────────────────────────────────────────────────── */

export const metadata = {
  title: "About us — why Second Shift exists",
  description:
    "Two years outsourcing work to the Philippines taught us the real problem on both sides: entrepreneurs lose hours screening resumes, and Filipino specialists too often go underpaid or unpaid. Second Shift is the fix — one fixed price, one review standard, and free training that protects the people doing the work.",
  alternates: { canonical: "/about" },
};

const PROBLEM = [
  {
    side: "For entrepreneurs",
    body: "Outsourcing was supposed to save time. In practice it spent it: hours lost posting a job, reading forty proposals, screening resumes that all say the same thing, and interviewing people you have no reliable way to judge before you have paid them.",
  },
  {
    side: "For Filipino specialists",
    body: "The other side of that same market is worse. Fake job posts, unpaid “test tasks” that are really just free work, and clients who vanish before the invoice is due. A skilled specialist has no shortage of demand — they have a shortage of clients who pay what the work is worth, on time, every time.",
  },
];

const SOLUTION = [
  {
    n: "01",
    label: "ONE PRICE",
    body: "No proposals, no bidding, no hourly meter. A task gets one fixed price before anyone starts, so an entrepreneur is never guessing what the invoice will say.",
  },
  {
    n: "02",
    label: "ONE STANDARD",
    body: "Every delivery is checked against the same written standard before it reaches the client — not a star rating, not a popularity contest. The work either meets the bar or it goes back with notes.",
  },
  {
    n: "03",
    label: "FREE TRAINING",
    body: "The Academy teaches the trade itself — not just how to use this platform — for free, with real exams and a certificate that stays with the worker no matter what. Training is protection: a specialist who can spot a scam and prove their skill is much harder to underpay.",
  },
];

export default function AboutPage() {
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
            <Link href="/how-it-works" className="text-[#5B6069] transition-colors hover:text-[#14161A]">
              How it works
            </Link>
            <Link href="/workers" className="text-[#5B6069] transition-colors hover:text-[#14161A]">
              For workers
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[880px] px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
          About us
        </p>
        <h1 className="mt-3 max-w-[18ch] text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-[#14161A]">
          We built this because the old way was broken on both ends.
        </h1>
        <p className="mt-5 max-w-[62ch] text-[16px] leading-relaxed text-[#5B6069]">
          We have spent the last two years working directly with Filipino specialists —
          hiring them, managing them, and watching where that relationship kept going wrong.
          What we saw was not a market gap. It was a market failing two groups of people at once,
          for two very different reasons.
        </p>

        {/* ── The problem, both sides ──────────────────────────────────── */}
        <Reveal className="mt-14">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
            What we kept running into
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {PROBLEM.map((p) => (
              <div
                key={p.side}
                className="srow rounded-lg border border-[#14161A]/10 bg-white p-5 shadow-[0_1px_2px_rgba(20,22,26,0.04)]"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#14161A]">
                  {p.side}
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-[#5B6069]">{p.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 max-w-[64ch] text-[14px] leading-relaxed text-[#5B6069]">
            Neither problem is really about money. Entrepreneurs were not short on candidates —
            they were short on a reliable way to judge one before committing. Filipino specialists
            were not short on skill — they were short on clients who would pay for it honestly.
            Fix the trust problem on both sides and the money problem mostly solves itself.
          </p>
        </Reveal>

        {/* ── The solution ──────────────────────────────────────────────── */}
        <Reveal className="mt-16">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
            So we built a simpler way
          </h2>
          <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-[#14161A]">
            Second Shift is not a job board and not a freelance marketplace — both of those
            already exist, and neither fixed what we kept seeing. It is a portal with one job:
            make it simple for an entrepreneur to get a task done well, and make it safe for a
            Filipino specialist to get paid fairly for doing it.
          </p>
          <div className="mt-6 rounded-lg border border-[#14161A]/10 bg-white shadow-[0_1px_2px_rgba(20,22,26,0.04)]">
            {SOLUTION.map((s) => (
              <div
                key={s.n}
                className="srow grid grid-cols-[52px_130px_1fr] items-baseline gap-3 border-b border-[#14161A]/[0.06] px-5 py-4 last:border-0 sm:gap-6"
              >
                <span className="font-mono text-[11px] tabular-nums text-[#5B6069]">{s.n}/03</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#14161A]">
                  {s.label}
                </span>
                <span className="text-[14px] leading-relaxed text-[#14161A]">{s.body}</span>
              </div>
            ))}
          </div>
        </Reveal>

        {/* ── Why it matters, plainly ─────────────────────────────────────
            Ties into two real assets rather than restating slogans: the
            Academy's honest "what's the catch" answer, and the scam course,
            which is the most direct evidence this problem is real. */}
        <Reveal className="mt-16">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
            Why free training is part of the business, not a marketing line
          </h2>
          <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-[#14161A]">
            A specialist who has been trained properly delivers work that passes review the first
            time, which costs us less and pays them faster — so the training pays for itself.
            But it also does something we think matters on its own: it gives a Filipino specialist
            a real, portable credential and the judgment to{" "}
            <Link
              href="/academy/spotting-scams"
              className="font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 transition-colors hover:decoration-[#14161A]"
            >
              recognize a fake job offer
            </Link>{" "}
            before it costs them anything. That is available to anyone, free, whether or not they
            ever claim a task here.
          </p>
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
              className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[14px] font-medium text-[#14161A] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Describe your task
            </Link>
          </div>
        </Reveal>

        <p className="mt-10 font-mono text-[11px] text-[#5B6069]">
          Read the full operating protocol at{" "}
          <Link href="/how-it-works" className="underline decoration-[#5B6069]/40 underline-offset-2 hover:text-[#14161A]">
            How it works
          </Link>
          .
        </p>
      </main>

      <footer className="border-t border-black/8">
        <div className="mx-auto flex w-full max-w-[880px] flex-wrap items-center justify-between gap-4 px-6 py-6 text-[12px]">
          <span className="font-mono uppercase tracking-[0.16em] text-[#14161A]">
            Second Shift
          </span>
          <TrustLinks />
        </div>
      </footer>
    </div>
  );
}
