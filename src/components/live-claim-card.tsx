"use client";

import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   THE SWITCH — the worker page's whole promise as one object.

   The payout appears in beat 1 and is the SAME DOM NODE, untouched, in beat
   5 after CLAIM, after REVIEW, after RELEASED. That invariant is the proof:
   the amount span carries no transition, no transform, no key — if it ever
   animates or re-mounts, the argument is dead. Everything else moves around
   it.

   Beside it, four struck rows in the visitor's own vocabulary (proposal,
   bidding, commission, client calls) fade in and never resolve — the entire
   comparison-table argument, above the fold, as image instead of prose.

   Loop pauses off-screen and when the tab is hidden (mid-tier Android
   battery). Reduced motion gets the printed state, still.
   ───────────────────────────────────────────────────────────────────────── */

type Beat = {
  /** Label above the amount. */
  label: string;
  /** The one control's text. */
  control: string;
  /** Control styling: ink = actionable, muted = in flight, green = released. */
  tone: "ink" | "muted" | "green";
  /** Ghost rows visible from this beat on. */
  ghosts: boolean;
};

const BEATS: Beat[] = [
  { label: "Payout — printed", control: "Claim", tone: "ink", ghosts: false },
  { label: "Payout — printed", control: "Claim", tone: "ink", ghosts: false },
  { label: "Payout — printed", control: "Claim", tone: "ink", ghosts: true },
  { label: "Payout — printed", control: "Claimed 7:22 AM", tone: "muted", ghosts: true },
  { label: "Payout — printed", control: "In review", tone: "muted", ghosts: true },
  { label: "Released", control: "Paid", tone: "green", ghosts: true },
];

/* The hold on beat 1 is load-bearing: the money sits on screen alone, before
   any interaction, which is literally what the headline claims. */
const BEAT_MS = [500, 1600, 1100, 1400, 1600, 3000];

export function LiveClaimCard({
  ghost,
  caption,
}: {
  ghost: [string, string][];
  caption: string;
}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const visible = useRef(true);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const wantsMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (!wantsMotion) return;

    const sync = () => setPlaying(visible.current && !document.hidden);

    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) visible.current = e.isIntersecting;
              sync();
            },
            { threshold: 0.25 }
          )
        : null;
    io?.observe(el);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setI((v) => (v + 1) % BEATS.length), BEAT_MS[i]);
    return () => window.clearTimeout(t);
  }, [playing, i]);

  const b = BEATS[i];
  const control =
    b.tone === "green"
      ? "border-[#1E7F5C]/40 bg-[#1E7F5C]/10 text-[#166049]"
      : b.tone === "muted"
        ? "border-[#14161A]/15 bg-transparent text-[#5B6069]"
        : "border-transparent bg-[#14161A] text-[#F7F6F3]";

  return (
    <div
      ref={hostRef}
      className="relative touch-pan-y select-none"
      style={{ touchAction: "pan-y" }}
    >
      <div className="glow-paperlight pointer-events-none absolute -inset-12" />

      <div className="sheen-frame sheen-frame--paper relative shadow-[0_24px_60px_-28px_rgba(20,22,26,0.45)]">
        <div className="relative overflow-hidden rounded-[16px] bg-white">
          {/* top rail */}
          <div className="flex items-center justify-between border-b border-[#14161A]/[0.08] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#5B6069]">
            <span>Task #0871</span>
            <span>Illustrative</span>
          </div>

          <div className="grid gap-x-6 px-4 py-4 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-snug text-[#14161A]">
                Tag 1,200 support tickets by topic
              </p>
              <p className="mt-1 font-mono text-[11px] text-[#5B6069]">
                One sheet, topic per row, every ticket tagged
              </p>

              <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5B6069]">
                {b.label}
              </p>
              {/* THE INVARIANT: no transition, no transform, no key. This node
                  is identical in every beat — that is the entire argument. */}
              <p className="mt-1 font-mono text-[44px] font-medium leading-none tabular-nums text-[#166049] sm:text-[52px]">
                $54.00
              </p>

              <div className="mt-5">
                <span
                  className={`inline-flex min-w-[128px] items-center justify-center rounded-md border px-4 py-2 font-mono text-[12px] uppercase tracking-[0.1em] transition-colors duration-300 ${control}`}
                >
                  {b.control}
                </span>
              </div>
            </div>

            {/* the ghost column — four things that never happen */}
            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-[#14161A]/[0.06] pt-4 sm:mt-0 sm:w-[176px] sm:grid-cols-1 sm:gap-y-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              {ghost.map(([k, v], gi) => (
                <div
                  key={k}
                  className="font-mono text-[10px] leading-tight text-[#5B6069] transition-opacity duration-500"
                  style={{
                    opacity: b.ghosts ? 0.85 : 0,
                    transitionDelay: b.ghosts ? `${gi * 90}ms` : "0ms",
                  }}
                >
                  <span className="block uppercase tracking-[0.12em] line-through decoration-[#14161A]/30">
                    {k}
                  </span>
                  <span className="block tabular-nums text-[#767C86]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-[#5B6069]">{caption}</p>
    </div>
  );
}
