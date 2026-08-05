"use client";

import Link from "next/link";

/**
 * Root error boundary. Terse and honest — no stack traces, no internals,
 * just a way back. `reset()` re-renders the failed segment.
 *
 * Same drafting-plate treatment as the closing panel on the client
 * homepage — a centered grid vignette (night-grid--center) behind a
 * corner-ticked ink plate (.plate.plate--ink, defined in paper.css) — so a
 * system page a visitor never expects to see still looks like it belongs
 * to the site, not like a framework default that slipped through.
 */
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A0B0D] px-6">
      <div aria-hidden className="night-grid--center pointer-events-none absolute inset-0" />
      <div className="plate plate--ink relative w-full max-w-[420px] px-7 py-10 text-center sm:px-9">
        <span className="inline-block border border-[#F7F6F3]/25 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[#F7F6F3]">
          Error
        </span>
        <h1 className="mt-6 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[#F7F6F3]">
          Something broke on our side.
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#8A9099]">
          Your request may not have completed.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4 text-[13px] font-medium">
          <button
            type="button"
            onClick={reset}
            className="lift min-h-11 rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[#14161A] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center px-2 text-[#8A9099] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Back to the site
          </Link>
        </div>
      </div>
    </main>
  );
}
