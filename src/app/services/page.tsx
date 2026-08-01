import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { OFFERINGS } from "@/lib/offerings";

export const metadata = {
  title: "Our Services",
  description:
    "Every way to get work done through AfterDesk — a single task with a fixed price, or standing weekly capacity.",
};

/* Entry point that helps a visitor pick which offering fits, not a
   replacement for either offering's own detailed page (src/app/page.tsx for
   one-off, /services/standing-capacity for the new mode). Built from
   src/lib/offerings.ts so a third offering is one array entry, not a
   restructure. */
export default function ServicesPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#0A0B0D]">
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0A0B0D]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-6">
          <Link href="/" className="text-[12px]">
            <Wordmark tone="paper" />
          </Link>
          <div className="flex items-center gap-5 text-[13px] font-medium">
            <Link href="/login" className="text-[#8A9099] transition-colors hover:text-white">
              Sign in
            </Link>
            <Link
              href="/register"
              className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[#14161A] hover:bg-white"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1120px] px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
          Our Services
        </p>
        <h1 className="mt-3 max-w-[24ch] text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
          One team. Two ways to send it work.
        </h1>
        <p className="mt-5 max-w-[52ch] text-[17px] leading-[1.5] text-[#9AA1AB]">
          Every offering below runs on the same rule: you never manage a specialist directly, and
          an operator checks the work before it reaches you.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {OFFERINGS.map((offering) => (
            <Link
              key={offering.slug}
              href={offering.href}
              className="lift group flex flex-col rounded-[10px] border border-white/10 bg-[#111317] p-6 transition-colors hover:border-white/25"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
                {offering.audience}
              </p>
              <h2 className="mt-2 text-[20px] font-semibold text-white">{offering.title}</h2>
              <p className="mt-2 flex-1 text-[14px] leading-[1.55] text-[#9AA1AB]">
                {offering.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[#F7F6F3]">
                Learn more
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
