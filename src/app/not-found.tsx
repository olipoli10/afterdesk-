import Link from "next/link";

/**
 * Same drafting-plate treatment as src/app/error.tsx and the closing panel
 * on the client homepage — see the comment there for why.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A0B0D] px-6">
      <div aria-hidden className="night-grid--center pointer-events-none absolute inset-0" />
      <div className="plate plate--ink relative w-full max-w-[420px] px-7 py-10 text-center sm:px-9">
        <span className="inline-block border border-[#F7F6F3]/25 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[#F7F6F3]">
          404
        </span>
        <h1 className="mt-6 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[#F7F6F3]">
          This page doesn&apos;t exist.
        </h1>
        <div className="mt-8 flex items-center justify-center gap-4 text-[13px] font-medium">
          <Link
            href="/"
            className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[#14161A] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]"
          >
            Get work done
          </Link>
          <Link
            href="/workers"
            className="inline-flex min-h-11 items-center px-2 text-[#8A9099] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            For workers
          </Link>
        </div>
      </div>
    </div>
  );
}
