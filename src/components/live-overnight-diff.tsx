"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

/* ─────────────────────────────────────────────────────────────────────────
   The flagship artifact WORKS while you watch: the broken file gets scanned
   row by row, clean rows land one at a time with their tags stamping in,
   the stats punch up, DELIVERED lights green — hold — then the night starts
   over. A lifecycle replay of example data, never a fake live feed.

   SSR renders the finished state (no-JS and reduced-motion users see the
   complete before/after); the loop arms on mount only when motion is wanted.
   ───────────────────────────────────────────────────────────────────────── */

const BEFORE_ROWS = [
  { company: "acme widgets inc", contact: "j. smith", email: null },
  { company: "ACME WIDGETS, INC.", contact: "John Smith", email: "jsmith@acme.com" },
  { company: "northwind trading", contact: "m. garcia", email: "m.garcia@northwind", broken: true },
  { company: "Northwind Trading Co", contact: "Maria Garcia", email: null },
  { company: "delta tooling llc", contact: "r. chen", email: "rchen@delta.co" },
  { company: "DELTA TOOLING", contact: "Ray Chen", email: "rchen@delta.co" },
];

const AFTER_ROWS = [
  { company: "Acme Widgets Inc.", contact: "John Smith", email: "jsmith@acme.com", tag: "merged" },
  { company: "Northwind Trading Co.", contact: "Maria Garcia", email: "m.garcia@northwind.com", tag: "fixed" },
  { company: "Delta Tooling LLC", contact: "Ray Chen", email: "rchen@delta.co", tag: "merged" },
  { company: "Prairie Fabrication", contact: "Dana Okafor", email: "d.okafor@prairiefab.com", tag: "fixed" },
  { company: "Halcyon Freight", contact: "Tom Iversen", email: "t.iversen@halcyon.io", tag: "kept" },
];

const STATS: [string, string][] = [
  ["142", "rows"],
  ["18", "duplicates merged"],
  ["31", "emails corrected"],
  ["9", "dropped"],
];

const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(45deg, transparent 0 4px, rgba(255,255,255,.10) 4px 5px)",
};

/* Step machine: 0..5 scan the broken rows · 6..10 build the clean rows ·
   11 stamp the stats · 12 DELIVERED + hold · then reset. */
const SCAN_END = 6;
const BUILD_END = 11;
const STATS_STEP = 11;
const DONE_STEP = 12;

function stepDelay(step: number): number {
  if (step < SCAN_END) return 200;
  if (step < BUILD_END) return 320;
  if (step === STATS_STEP) return 1000;
  return 4800; // hold on DELIVERED before the night starts over
}

function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`truncate px-3 ${className}`}>{children}</div>;
}

export function LiveOvernightDiff() {
  // The external-store server snapshot keeps SSR on the finished night;
  // motion-capable clients start at the beginning without a mount effect.
  const [step, setStep] = useState(0);
  const playing = useMediaQuery("(prefers-reduced-motion: no-preference)");
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      if (step >= DONE_STEP) {
        setLoop((n) => n + 1);
        setStep(0);
      } else {
        setStep(step + 1);
      }
    }, stepDelay(step));
    return () => window.clearTimeout(t);
  }, [playing, step]);

  const visibleStep = playing ? step : DONE_STEP;
  const scanIndex = playing && visibleStep < SCAN_END ? visibleStep : -1;
  const builtRows =
    !playing || visibleStep >= BUILD_END
      ? AFTER_ROWS.length
      : Math.max(0, visibleStep - SCAN_END);
  const statsShown = !playing || visibleStep >= STATS_STEP;
  const delivered = !playing || visibleStep >= DONE_STEP;

  return (
    <div className="sheen-frame shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]">
    <div className="relative overflow-hidden rounded-2xl">
      {/* app-window chrome: this is the product, not an illustration */}
      <div className="flex h-10 items-center justify-between border-b border-white/8 bg-[#0F1011] px-4">
        <span className="font-mono text-[11px] text-[#8A9099]">afterdesk · task_0447</span>
        {delivered ? (
          <span
            key={`d-${loop}`}
            className="stamp-in rounded border border-[#1E7F5C]/40 bg-[#1E7F5C]/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#F7F6F3]"
          >
            Delivered 7:07 AM
          </span>
        ) : (
          <span className="font-mono text-[10px] text-[#8A9099]">
            {step < SCAN_END ? "scanning…" : "working overnight…"}
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2">
        {/* BEFORE — the mess, scanned row by row */}
        <div className="bg-[#111317]">
          <div className="flex h-10 items-center gap-2 border-b border-white/8 px-4">
            <span className="h-1.5 w-1.5 rounded-full border border-[#767C86]" />
            <span className="font-mono text-[11px] text-[#8A9099]">
              leads_export.csv · sent 6:41 PM
            </span>
          </div>
          <div className="font-mono text-[12px] tabular-nums text-[#8A9099]">
            {BEFORE_ROWS.map((r, i) => (
              <div
                key={i}
                className={`grid h-[34px] grid-cols-[1fr_0.75fr_1.15fr] items-center border-b border-white/6 transition-colors duration-200 last:border-0 ${
                  scanIndex === i ? "bg-white/[0.06]" : ""
                }`}
              >
                <Cell>{r.company}</Cell>
                <Cell>{r.contact}</Cell>
                <Cell>
                  {r.email === null ? (
                    <span
                      className="inline-block h-[14px] w-[60%] rounded-[2px] align-middle"
                      style={HATCH}
                    />
                  ) : (
                    <span style={r.broken ? { boxShadow: "inset 0 -2px 0 #D98324" } : undefined}>
                      {r.email}
                    </span>
                  )}
                </Cell>
              </div>
            ))}
          </div>
        </div>

        {/* AFTER — clean rows land one at a time, tags stamp in */}
        <div className="border-t border-white/10 bg-[#F7F6F3] md:border-l md:border-t-0">
          <div className="flex h-10 items-center gap-2 border-b border-black/8 px-4">
            <span
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                delivered ? "bg-[#1E7F5C]" : "border border-[#767C86]"
              }`}
            />
            <span className="font-mono text-[11px] text-[#5B6069]">
              leads_export_clean.csv{delivered ? " · returned 7:07 AM" : ""}
            </span>
          </div>
          <div className="font-mono text-[12px] tabular-nums text-[#14161A]">
            {AFTER_ROWS.map((r, i) => (
              <div
                key={i}
                className={`grid h-[34px] grid-cols-[1fr_0.7fr_1.1fr_auto] items-center border-b border-black/6 transition-all duration-300 last:border-0 ${
                  i < builtRows ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                }`}
              >
                <Cell>{r.company}</Cell>
                <Cell>{r.contact}</Cell>
                <Cell>{r.email}</Cell>
                <div className="pr-3">
                  {i < builtRows ? (
                    <span
                      key={`t-${loop}-${i}`}
                      className="stamp-in inline-block rounded bg-[#1E7F5C]/10 px-1.5 py-0.5 text-[10px] text-[#166049]"
                    >
                      {r.tag}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* seam badge */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 flex-col items-center md:flex">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F7F6F3] shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
          <svg viewBox="0 0 24 24" className="seam-chevron h-3.5 w-3.5 text-[#14161A]">
            <path
              d="M9 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="mt-2 rounded bg-[#0A0B0D]/60 px-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/80">
          Overnight
        </span>
      </div>

      {/* footer bar — the stats punch in, then the money line */}
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 bg-[#0A0B0D] px-4 py-3 font-mono text-[12px]">
        <span className="text-[#8A9099]">
          {statsShown
            ? STATS.map(([n, label], i) => (
                <span
                  key={`s-${loop}-${i}`}
                  className="stamp-in mr-1 inline-block"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  {n} {label}
                  {i < STATS.length - 1 ? " ·" : ""}
                </span>
              ))
            : "…"}
        </span>
        <span
          className={`text-white transition-opacity duration-500 ${delivered ? "opacity-100" : "opacity-0"}`}
        >
          $68 — approved before any work started.
        </span>
      </div>
    </div>
    </div>
  );
}
