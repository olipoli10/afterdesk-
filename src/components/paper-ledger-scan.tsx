"use client";

import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   THE INDEX PLATE — 03/06.

   The flat table becomes a printed bill of materials, and then it works: a
   fine cursor travels down the index and each row it crosses is uncovered —
   its category tag lands, and a solid paper block slides off its price. The
   picture is the rule: nothing carries a price until the operator passes
   over it.

   Fail-safe by construction. The server renders the FINISHED plate (every
   tag, every price, no cursor), so no-JS and reduced-motion visitors read
   the complete index. The loop only arms on mount, only when motion is
   wanted, and pauses whenever the plate is off-screen or the tab is hidden.

   Motion is transform-only: one 1px cursor on translate3d, one paper block
   per price on translate3d. No filter, no clip-path, no animated width.
   ───────────────────────────────────────────────────────────────────────── */

const STEP_MS = 620;
const HOLD_MS = 2600;

export function PaperLedgerScan({
  rows,
  note,
  range,
}: {
  /** [category tag, task title, fixed price] — illustrative examples. */
  rows: [string, string, string][];
  /** Honesty label. Translated: it has to be understood to do its job. */
  note: string;
  /** Computed from the rows above, never typed by hand. */
  range: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(rows.length); // server frame: the hold
  const last = rows.length - 1;

  /* Arm only when motion is wanted, and only while genuinely on screen. */
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
      () => setStep((s) => (s > last ? 0 : s + 1)),
      step > last ? HOLD_MS : STEP_MS
    );
    return () => window.clearTimeout(t);
  }, [playing, step, last]);

  const cursorRow = Math.min(step, last);

  return (
    <div ref={ref} className="ledger mt-7">
      {playing ? (
        <div
          aria-hidden
          className="ledger-cursor"
          style={{ transform: `translate3d(0, calc(var(--rowh) * ${cursorRow}), 0)` }}
        />
      ) : null}

      {rows.map(([tag, task, price], i) => {
        const lit = !playing || step >= i;
        return (
          <div
            key={task}
            className="ledger-row lift-sheet relative grid grid-cols-[1fr_auto] items-center gap-x-3 pl-3 sm:grid-cols-[2.5rem_5.5rem_1fr_auto] sm:gap-x-4"
          >
            {/* Below 640px the plate drops the row-number gutter and the row
                folds to two lines, so a task title is never truncated to
                nonsense to protect a column. */}
            <span
              aria-hidden
              className="hidden font-mono text-[10px] tabular-nums text-[#5B6069] sm:block"
            >
              {String(i + 1).padStart(3, "0")}
            </span>
            {/* Toggling .stamp-in off and back on re-fires the keyframe on the
                next pass — no remount, no key churn. */}
            <span
              className={`order-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5B6069] sm:order-none ${
                lit ? "" : "opacity-0"
              } ${playing && step === i ? "stamp-in" : ""}`}
            >
              {tag}
            </span>
            <span className="order-3 col-span-2 flex min-w-0 items-center sm:order-none sm:col-span-1">
              <span className="truncate text-[14px] text-[#14161A]">{task}</span>
              <i aria-hidden className="dotleader" />
            </span>
            <span className="relative order-2 overflow-hidden pr-3 sm:order-none">
              <span className="font-mono text-[13px] tabular-nums text-[#166049]">{price}</span>
              {playing ? <i aria-hidden className="price-cover" data-off={lit} /> : null}
            </span>
          </div>
        );
      })}

      <p className="mt-4 pl-3 font-mono text-[11px] tabular-nums tracking-[0.1em] text-[#5B6069]">
        {note} <span className="text-[#14161A]">{range}</span>
      </p>
    </div>
  );
}
