"use client";

import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

/* ─────────────────────────────────────────────────────────────────────────
   The hero is a SESSION, not a screenshot: one task's whole life plays out
   in the product window, then loops. Linear's core trick with our material.

   Fail-safe: the server renders the QUOTE READY state; the loop only arms
   when motion is wanted. Reduced-motion users keep the static card.
   Everything is example data (task_0448) — a lifecycle replay, never a
   fake live feed.
   ───────────────────────────────────────────────────────────────────────── */

/* The stamp text and activity line for each step are language-dependent
   (LiveTaskWindowCopy.stamps / .lines, same order) — this array is now just
   the STRUCTURE: which tone, and which flags flip on, at each of the five
   beats. Language never changes the choreography, only the words. */
type Step = {
  stampTone: "muted" | "paper" | "dusk" | "green";
  showPrice: boolean;
  approved: boolean;
  released: boolean;
};

const STEPS: Step[] = [
  { stampTone: "muted", showPrice: false, approved: false, released: false },
  { stampTone: "paper", showPrice: true, approved: false, released: false },
  { stampTone: "dusk", showPrice: true, approved: true, released: false },
  { stampTone: "muted", showPrice: true, approved: true, released: false },
  { stampTone: "green", showPrice: true, approved: true, released: true },
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

/* The rail draws the five beats as shapes, not sentences — the one part of
   this card that reads before anyone reads a word of it. A dot fills the
   moment its beat starts and stays filled (the task's life doesn't UNDO
   itself), the line between two filled dots fills with it, and the live dot
   gets the ring + pulse so motion has a fixed point to draw the eye to. */
function StepRail({ index }: { index: number }) {
  return (
    <svg
      viewBox="0 0 220 16"
      className="block h-4 w-full overflow-visible"
      aria-hidden
    >
      {STEPS.slice(0, -1).map((_, i) => {
        const x1 = 8 + i * 51;
        const x2 = x1 + 51;
        const filled = i < index;
        return (
          <line
            key={i}
            x1={x1}
            y1={8}
            x2={x2}
            y2={8}
            strokeWidth={2}
            className={`transition-[stroke] duration-500 ${filled ? "stroke-[#1E7F5C]" : "stroke-white/12"}`}
          />
        );
      })}
      {STEPS.map((step, i) => {
        const cx = 8 + i * 51;
        const done = i < index;
        const live = i === index;
        const fill = step.released ? "#1E7F5C" : done || live ? "#F7F6F3" : "#111317";
        const stroke = step.released ? "#1E7F5C" : done || live ? "#F7F6F3" : "rgba(255,255,255,0.25)";
        return (
          <g key={i}>
            {live ? (
              <circle cx={cx} cy={8} r={7} className="fill-none stroke-white/20">
                <animate attributeName="r" values="7;9;7" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="1.8s" repeatCount="indefinite" />
              </circle>
            ) : null}
            <circle
              cx={cx}
              cy={8}
              r={4}
              fill={fill}
              stroke={stroke}
              strokeWidth={1.5}
              className="transition-[fill,stroke] duration-500"
            />
          </g>
        );
      })}
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 8.3 7 10.3 11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type LiveTaskWindowCopy = {
  taskTitle: string;
  fieldScope: string;
  scopeValue: string;
  fieldReturns: string;
  fixedPrice: string;
  approve: string;
  approved: string;
  download: string;
  askQuestion: string;
  stamps: [string, string, string, string, string];
  lines: [string, string, string, string, string];
};

export function LiveTaskWindow({ copy }: { copy: LiveTaskWindowCopy }) {
  // The server snapshot renders QUOTE READY; motion-capable clients play from intake.
  const [i, setI] = useState(0);
  const playing = useMediaQuery("(prefers-reduced-motion: no-preference)");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    const last = i === STEPS.length - 1;
    const t = window.setTimeout(
      () => setI((v) => (v + 1) % STEPS.length),
      last ? HOLD_MS : STEP_MS
    );
    return () => window.clearTimeout(t);
  }, [playing, i]);

  const visibleIndex = playing ? i : 1;
  const s = STEPS[visibleIndex];

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
            {copy.stamps[visibleIndex]}
          </span>
        </div>
        <div className="px-4 pt-3.5">
          <StepRail index={visibleIndex} />
        </div>
        <div className="px-4 pb-4 pt-2.5">
          <p className="text-[15px] font-medium text-[#F7F6F3]">{copy.taskTitle}</p>
          <div className="mt-3 space-y-1.5 font-mono text-[12px]">
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-[#8A9099]">{copy.fieldScope}</span>
              <span className="truncate text-[#C9CDD3]">{copy.scopeValue}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-[#8A9099]">{copy.fieldReturns}</span>
              {/* Literal clock time + timezone abbreviation — data, not a word. */}
              <span className="text-[#C9CDD3]">7:00 AM ET</span>
            </div>
          </div>
          <div
            className={`mt-4 flex items-baseline justify-between border-t border-white/8 pt-3 transition-opacity duration-500 ${s.showPrice ? "opacity-100" : "opacity-0"}`}
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8A9099]">
              {copy.fixedPrice}
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
              {s.approved ? (
                <span className="inline-flex items-center gap-1.5">
                  <CheckIcon className={`h-3 w-3 ${s.released ? "text-[#3DDCA0]" : "text-[#8A9099]"}`} />
                  {s.released ? copy.download : copy.approved}
                </span>
              ) : (
                copy.approve
              )}
            </span>
            <span className="flex-1 rounded-md border border-white/15 py-2 text-center text-[12px] font-medium text-[#8A9099]">
              {copy.askQuestion}
            </span>
          </div>
        </div>
        <div className="border-t border-white/8 bg-[#0F1011] px-4 py-2.5 font-mono text-[11px] text-[#8A9099]">
          <span key={visibleIndex} className="live-line block">
            {copy.lines[visibleIndex]}
          </span>
        </div>
      </div>
      </div>
    </div>
  );
}
