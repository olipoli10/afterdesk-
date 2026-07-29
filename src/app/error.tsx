"use client";

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
        Something broke on our side. Your data is fine.
      </h1>
      <div className="mt-8 flex items-center gap-4 text-[13px] font-medium">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[#14161A] transition-colors hover:bg-white"
        >
          Try again
        </button>
        <a href="/" className="text-[#8A9099] transition-colors hover:text-white">
          Back to the site
        </a>
      </div>
    </div>
  );
}
