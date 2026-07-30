"use client";

import Link from "next/link";

/**
 * Root error boundary. Terse and honest — no stack traces, no internals,
 * just a way back. `reset()` re-renders the failed segment.
 */
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0B0D] px-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#767C86]">
        Second Shift
      </p>
      <h1 className="mt-6 font-mono text-[13px] text-[#8A9099]">
        Something broke on our side. Your request may not have completed.
      </h1>
      <div className="mt-8 flex items-center gap-4 text-[13px] font-medium">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[#14161A] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]"
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
  );
}
