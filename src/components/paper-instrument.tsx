"use client";

import { useEffect, useState, type CSSProperties } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   THE INSTRUMENT — 04/06.

   The decorative sweeping band becomes a measured instrument: a 24-hour
   ruler on the New York clock, two lanes whose dark halves are each other's
   light, and a needle at the real current time. Whichever station the
   needle is inside lights up — so a client reading this at 9 PM literally
   watches "One fixed price. You approve it." light.

   HONESTY, load-bearing:
   - The Manila offset comes from Intl, never a hardcoded UTC±. It is 12
     hours most of the year and 13 in North American winter, and the lane
     shifts with it. The note under the ruler says exactly that.
   - There is an explicit IDLE state. Between 8 AM and 6 PM New York, no
     station lights and no NOW chip appears — claiming otherwise would imply
     work is underway when it is not.
   - The needle renders only after mount, so the server never prints a clock
     time it cannot vouch for and hydration can never mismatch.

   Motion: one translate3d on one element, updated once a minute. Not a loop.
   ───────────────────────────────────────────────────────────────────────── */

const NY = "America/New_York";
const MNL = "Asia/Manila";
/* Station windows on the New York clock, in the order the steps are listed.
   [start, end) — the overnight window wraps midnight. */
const WINDOWS: [number, number][] = [
  [18, 19],
  [19, 23],
  [23, 6],
  [6, 8],
];

function clockOf(d: Date, tz: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { h: get("hour") % 24, m: get("minute") };
}

function inWindow(h: number, [a, b]: [number, number]): boolean {
  return a < b ? h >= a && h < b : h >= a || h < b;
}

/** Manila's night (18:00–06:00 local) expressed on the New York axis. */
function manilaNight(offset: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 12; i++) out.add((18 + i - offset + 48) % 24);
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function PaperInstrument({
  laneYou,
  laneThem,
  steps,
  note,
}: {
  laneYou: string;
  laneThem: string;
  steps: [string, string][];
  note: string;
}) {
  /* Server frame: the standard 12-hour offset, no needle, nothing lit. */
  const [offset, setOffset] = useState(12);
  const [now, setNow] = useState<{ h: number; m: number } | null>(null);

  useEffect(() => {
    const wantsMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

    const read = () => {
      const d = new Date();
      const ny = clockOf(d, NY);
      setNow(ny);
      setOffset((clockOf(d, MNL).h - ny.h + 24) % 24);
    };
    /* The first read always runs: the needle is information, not motion, so
       reduced-motion visitors get the correct position too — they just do
       not get the once-a-minute tick. */
    read();
    if (!wantsMotion) return;
    /* A hidden tab does no clock work; it re-syncs the moment it comes back. */
    const tick = () => {
      if (!document.hidden) read();
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const night = manilaNight(offset);
  const pct = now ? ((now.h * 60 + now.m) / 1440) * 100 : 0;
  const active = now ? WINDOWS.findIndex((w) => inWindow(now.h, w)) : -1;

  const lanes: [string, (h: number) => boolean][] = [
    [laneYou, (h) => h >= 18 || h < 6],
    [laneThem, (h) => night.has(h)],
  ];

  return (
    <div className="mt-9">
      <div className="relative">
      {/* the ruler — hour labels, minor ticks every hour, major every six */}
      <div aria-hidden className="pl-[74px] sm:pl-[86px]">
        <div className="relative mb-1 h-4">
          {[0, 6, 12, 18].map((h, i) => (
            <span
              key={h}
              className="absolute font-mono text-[10px] tabular-nums text-[#5B6069]"
              style={{ left: `${i * 25}%` }}
            >
              {pad(h)}
            </span>
          ))}
          <span className="absolute right-0 font-mono text-[10px] tabular-nums text-[#5B6069]">
            24
          </span>
        </div>
        <div className="ruler-ticks h-2.5 border-b border-black/15" />
      </div>

      {/* the two lanes — one lane's dark is the other's light */}
      <div className="mt-2 space-y-2">
        {lanes.map(([label, isNight]) => (
          <div key={label} className="flex items-center gap-3">
            {/* Fixed gutter so both lanes register on the same axis. Long
                translated city names wrap inside it rather than widening it
                — the ruler above and the needle are anchored to this width. */}
            <span className="w-[62px] shrink-0 font-mono text-[10px] uppercase leading-tight tracking-[0.12em] text-[#5B6069] sm:w-[74px]">
              {label}
            </span>
            <div
              aria-hidden
              className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-px overflow-hidden bg-black/8"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <span
                  key={h}
                  className={`h-7 ${isNight(h) ? "bg-[#1B2740]/[0.18]" : "bg-[#F7F6F3]"}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* the needle, at the real New York clock — one element, one transform */}
      {now ? (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-[74px] right-0 top-[20px] sm:left-[86px]"
        >
          <div className="needle-track" style={{ "--t": `${pct}%` } as CSSProperties}>
            <span className="needle-line" />
            <span className="absolute -top-[17px] left-0 -translate-x-1/2 bg-[#F7F6F3] px-1 font-mono text-[10px] tabular-nums text-[#14161A]">
              {pad(now.h)}:{pad(now.m)}
            </span>
          </div>
        </div>
      ) : null}
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase leading-relaxed tracking-[0.1em] text-[#5B6069]">
        {note}
      </p>

      {/* the four stations, hanging off the ruler on leader lines */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([time, text], i) => {
          const on = active === i;
          return (
            <div key={time} className="srow">
              <i aria-hidden className="plate-leader mb-2" />
              <div
                className={`border-t pt-3 motion-safe:transition-colors motion-safe:duration-200 ${
                  on ? "border-[#14161A]" : "border-black/10"
                }`}
              >
                <p className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-[#5B6069]">
                  <span>{time}</span>
                  {on ? (
                    <span className="stamp-in border border-[#14161A]/30 px-1 text-[9px] uppercase tracking-[0.14em] text-[#14161A]">
                      NOW
                    </span>
                  ) : null}
                </p>
                <p
                  className={`mt-1 text-[15px] leading-snug motion-safe:transition-colors motion-safe:duration-200 ${
                    on ? "text-[#14161A]" : "text-[#5B6069]"
                  }`}
                >
                  {text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
