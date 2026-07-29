"use client";

import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   The hero is a SESSION, not a screenshot: one task's whole life plays out
   in the product window, then loops. Linear's core trick with our material.

   Fail-safe: the server renders the QUOTE READY state; the loop only arms
   when motion is wanted. Reduced-motion users keep the static card.
   Everything is example data (task_0448) — a lifecycle replay, never a
   fake live feed.
   ───────────────────────────────────────────────────────────────────────── */

type Step = {
  stamp: string;
  stampTone: "muted" | "paper" | "dusk" | "green";
  activity: string;
  showPrice: boolean;
  approved: boolean;
  released: boolean;
};

const STEPS: Step[] = [
  {
    stamp: "Intake",
    stampTone: "muted",
    activity: "6:41 PM · task received",
    showPrice: false,
    approved: false,
    released: false,
  },
  {
    stamp: "Quote ready",
    stampTone: "paper",
    activity: "7:15 PM · priced by the operator · 34 min after intake",
    showPrice: true,
    approved: false,
    released: false,
  },
  {
    stamp: "In progress",
    stampTone: "dusk",
    activity: "7:22 PM · approved · claimed by a vetted specialist",
    showPrice: true,
    approved: true,
    released: false,
  },
  {
    stamp: "In review",
    stampTone: "muted",
    activity: "5:58 AM · delivered · operator review in progress",
    showPrice: true,
    approved: true,
    released: false,
  },
  {
    stamp: "Delivered",
    stampTone: "green",
    activity: "7:07 AM · passed review · in your inbox",
    showPrice: true,
    approved: true,
    released: true,
  },
];

const STEP_MS = 2100;
const HOLD_MS = 3600;

function stampClass(tone: Step["stampTone"]): string {
  switch (tone) {
    case "paper":
      return "bg-[#F7F6F3] text-[#14161A]";
    case "dusk":
      return "border border-[#1B2740] bg-[#1B2740]/60 text-[#C9CDD3]";
    case "green":
      return "border border-[#1E7F5C]/50 bg-[#1E7F5C]/20 text-[#F7F6F3]";
    default:
      return "border border-white/15 bg-white/[0.04] text-[#8A9099]";
  }
}

export function LiveTaskWindow() {
  // Server renders the canonical QUOTE READY state (index 1).
  const [i, setI] = useState(1);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wantsMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (!wantsMotion) return;
    setPlaying(true);
    setI(0);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const last = i === STEPS.length - 1;
    const t = window.setTimeout(
      () => setI((v) => (v + 1) % STEPS.length),
      last ? HOLD_MS : STEP_MS
    );
    return () => window.clearTimeout(t);
  }, [playing, i]);

  const s = STEPS[i];

  return (
    <div ref={ref} className="relative">
      <div className="glow-dusk pointer-events-none absolute -inset-16" />
      {/* a thread of light travels the frame — the ring IS the border */}
      <div className="sheen-frame relative shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)]">
      <div className="relative overflow-hidden rounded-[16px] bg-[#111317]">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
          <span className="font-mono text-[11px] text-[#8A9099]">task_0448</span>
          <span
            className={`rounded-[3px] px-1.5 py-[3px] font-mono text-[9px] uppercase leading-none tracking-[0.14em] transition-colors duration-300 ${stampClass(s.stampTone)}`}
          >
            {s.stamp}
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
          <div
            className={`mt-4 flex items-baseline justify-between border-t border-white/8 pt-3 transition-opacity duration-500 ${s.showPrice ? "opacity-100" : "opacity-0"}`}
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#767C86]">
              Fixed price
            </span>
            <span className="font-mono text-[26px] font-medium tabular-nums text-[#F7F6F3] underline decoration-[#1E7F5C] decoration-2 underline-offset-4">
              $74
            </span>
          </div>
          <div className="mt-4 flex gap-2">
            <span
              className={`flex-1 rounded-md py-2 text-center text-[12px] font-medium transition-colors duration-300 ${
                s.released
                  ? "border border-[#1E7F5C]/50 bg-[#1E7F5C]/20 text-[#F7F6F3]"
                  : s.approved
                    ? "border border-white/15 bg-white/[0.04] text-[#8A9099]"
                    : "bg-[#F7F6F3] text-[#14161A]"
              }`}
            >
              {s.released ? "Download delivery" : s.approved ? "Approved ✓" : "Approve"}
            </span>
            <span className="flex-1 rounded-md border border-white/15 py-2 text-center text-[12px] font-medium text-[#8A9099]">
              Ask a question
            </span>
          </div>
        </div>
        <div className="border-t border-white/8 bg-[#0F1011] px-4 py-2.5 font-mono text-[11px] text-[#767C86]">
          <span key={i} className="live-line block">
            {s.activity}
          </span>
        </div>
      </div>
      </div>
    </div>
  );
}
