import Link from "next/link";
import { Wordmark } from "@/components/logo";

export const metadata = {
  title: "Standing Capacity",
  description:
    "Reserve a recurring weekly block of hours at one fixed price. Your AfterDesk team, never a named worker, with a running account history so no one starts cold.",
};

const TIERS = [
  { hours: 5, blurb: "A few recurring tasks a week." },
  { hours: 10, blurb: "A steady stream of admin, research or data work." },
  { hours: 20, blurb: "Close to a part-time dedicated hand." },
];

const PILLARS = [
  {
    title: "One fixed price per week",
    body: "Set once when you subscribe, never renegotiated task by task inside the block.",
  },
  {
    title: "Your AfterDesk team, not a name",
    body: "Who does the work can change week to week. What never changes is the account — your preferences and history live with us, not in one person's head.",
  },
  {
    title: "Still reviewed before it reaches you",
    body: "Every task in the block still passes an operator's check first — the same rule as every task on this platform.",
  },
];

export default function StandingCapacityPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#0A0B0D]">
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0A0B0D]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-6">
          <Link href="/" className="text-[12px]">
            <Wordmark tone="paper" />
          </Link>
          <div className="flex items-center gap-5 text-[13px] font-medium">
            <Link href="/services" className="text-[#8A9099] transition-colors hover:text-white">
              Our Services
            </Link>
            <Link href="/login" className="text-[#8A9099] transition-colors hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[900px] px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
          Standing capacity
        </p>
        <h1 className="mt-3 max-w-[20ch] text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
          Recurring hours, one fixed weekly price.
        </h1>
        <p className="mt-5 max-w-[56ch] text-[17px] leading-[1.5] text-[#9AA1AB]">
          Instead of pricing every task on its own, reserve a block of hours every week. Submit
          tasks as they come up all week; each one is simply counted against the block you already
          paid for and approved.
        </p>

        <div className="mt-10 flex flex-wrap gap-2">
          <Link
            href="/register"
            className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white"
          >
            Ask us about standing capacity
          </Link>
          <p className="mt-3 basis-full font-mono text-[12px] text-[#767C86]">
            Sign up, then an operator sets your account up with you — this is not a self-serve
            checkout yet.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {TIERS.map((tier) => (
            <div key={tier.hours} className="rounded-[10px] border border-white/10 bg-[#111317] p-5">
              <p className="font-mono text-[26px] font-medium tabular-nums text-white">
                {tier.hours}h<span className="text-[15px] text-[#767C86]">/week</span>
              </p>
              <p className="mt-2 text-[13px] leading-[1.5] text-[#9AA1AB]">{tier.blurb}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-8 border-t border-white/8 pt-10 sm:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div key={pillar.title}>
              <p className="text-[15px] font-medium text-white">{pillar.title}</p>
              <p className="mt-1.5 text-[13px] leading-[1.5] text-[#9AA1AB]">{pillar.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-white/8 pt-10">
          <h2 className="text-[19px] font-semibold text-white">What happens if you go over?</h2>
          <p className="mt-2 max-w-[56ch] text-[14px] leading-[1.6] text-[#9AA1AB]">
            If a task would push you past your remaining hours for the week, you get three
            options: wait for next week&apos;s block, submit it as a one-off task at the normal
            fixed price, or move up a capacity tier.
          </p>
        </div>
      </section>
    </div>
  );
}
