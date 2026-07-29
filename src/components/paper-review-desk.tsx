"use client";

import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   THE REVIEW DESK — 05/06, above the operator wall.

   The artifact demonstrates the review; the wall below states the rule.
   Two deliveries sit on the desk and their state trails write themselves
   out: one clears on the first pass, one comes back with notes, is
   re-delivered, and then clears. That return path is the truest thing about
   the product and the only honest use amber has on this site.

   HONESTY GUARDS (hard):
   - The trail is the platform's ACTUAL delivery state machine — delivered,
     operator review, passed, or returned with notes and re-delivered. There
     is no invented checklist here: a made-up four-line QC list would be
     invented process, and the operator's real list is not published.
   - No amounts, no task domains, no percentages, no rejection rate, no
     elapsed-time promise. That is also what lets this port to the worker
     page with one prop and leak nothing about margin.
   - The caption says EXAMPLE, above the artifact rather than inside it.

   Motion: opacity + translate3d only, one timeout chain, paused off-screen
   and when the tab is hidden. The server renders the completed frame, so
   the still picture — including the amber return — is the whole argument.
   ───────────────────────────────────────────────────────────────────────── */

type Tone = "neutral" | "pass" | "return";
type Token = { at: number; text: string; tone: Tone };

/* Machine strings: the platform runs in English and its stamps stay English,
   the same rule the night artifacts follow. */
const TRAILS: Token[][] = [
  [
    { at: 1, text: "DELIVERED", tone: "neutral" },
    { at: 3, text: "IN REVIEW", tone: "neutral" },
    { at: 5, text: "PASSED", tone: "pass" },
  ],
  [
    { at: 2, text: "DELIVERED", tone: "neutral" },
    { at: 4, text: "IN REVIEW", tone: "neutral" },
    { at: 6, text: "RETURNED", tone: "return" },
    { at: 7, text: "RE-DELIVERED", tone: "neutral" },
    { at: 8, text: "PASSED", tone: "pass" },
  ],
];

const LAST = 9; // the hold frame
const STEP_MS = 700;
const HOLD_MS = 3000;

const TONE: Record<Tone, string> = {
  neutral: "text-[#5B6069] border-black/12",
  pass: "text-[#166049] border-[#1E7F5C]/35",
  return: "text-[#955710] border-[#D98324]/45",
};

export function PaperReviewDesk({ caption }: { caption: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(LAST); // server frame: the finished desk

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wantsMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (!wantsMotion || typeof IntersectionObserver !== "function") return;

    let onScreen = false;
    const sync = () => setPlaying(onScreen && !document.hidden);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) onScreen = e.isIntersecting;
        sync();
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(
      () => setStep((s) => (s >= LAST ? 0 : s + 1)),
      step >= LAST ? HOLD_MS : STEP_MS
    );
    return () => window.clearTimeout(t);
  }, [playing, step]);

  /* The returned delivery pulls back toward the night for one beat. */
  const away = playing && step === 6;

  return (
    <div ref={ref} className="mt-7">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#5B6069]">
        {caption}
      </p>
      <div className="cast border border-black/12 bg-[#F7F6F3] px-4 py-4 sm:px-6 sm:py-5">
        {TRAILS.map((trail, row) => (
          <div
            key={row}
            className={`flex flex-wrap items-center gap-x-2 gap-y-2 border-black/8 py-3 ${
              row === 0 ? "border-b" : ""
            } motion-safe:transition-transform motion-safe:duration-300`}
            style={row === 1 && away ? { transform: "translate3d(-10px, 0, 0)" } : undefined}
          >
            <span className="font-mono text-[10px] tabular-nums text-[#5B6069]">
              {String(row + 1).padStart(2, "0")}
            </span>
            {/* the delivery itself: three hairlines, no filename to invent */}
            <span aria-hidden className="mr-1 flex w-6 shrink-0 flex-col gap-[3px]">
              <i className="h-px w-full bg-black/20" />
              <i className="h-px w-full bg-black/20" />
              <i className="h-px w-2/3 bg-black/20" />
            </span>
            {trail.map((tk) => {
              const shown = !playing || step >= tk.at;
              return (
                <span
                  key={tk.text}
                  className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    TONE[tk.tone]
                  } ${shown ? "" : "opacity-0"} ${playing && step === tk.at ? "stamp-in" : ""}`}
                >
                  {tk.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
