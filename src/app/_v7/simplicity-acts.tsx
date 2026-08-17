"use client";

/* V7 - the four simplicity acts (direction C hybridized with A's hero).

   PERFORMANCE CONTRACT (binds the P1 evidence):
   - ONE passive scroll listener, ONE rAF scheduler, ONE scrollY read per
     frame; every visual write is transform/opacity or a CSS var.
   - No layout reads inside the frame loop: anchor rects are measured on
     mount/resize only.
   - The walk (act 3) interpolates CONTINUOUSLY - no stage quantization.
   - Reduced motion: the scheduler never starts; the story renders as
     complete natural flow with static slips and the A2 dock resting in
     its corner (the relevant anchor under reduced rules).

   ONE-BEING CONTRACT: this component renders NO A2 sprite. It moves the
   EXISTING concierge dock ([data-a2-dock], the single being + launcher)
   between act anchors by writing a transform on the dock wrapper. The
   frozen a2-concierge component is untouched. */

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { V7ActsCopy } from "@/lib/i18n/v7-acts";

function subscribeReduced(cb: () => void) {
  const m = window.matchMedia("(prefers-reduced-motion: reduce)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function SimplicityActs({ copy }: { copy: V7ActsCopy }) {
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const slipRef = useRef<HTMLDivElement | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current, slip = slipRef.current;
    if (!root || !slip) return;
    const dock = document.querySelector<HTMLElement>("[data-a2-dock]");

    /* anchors measured OUTSIDE the frame loop */
    type Pt = { x: number; y: number };
    let anchors: Pt[] = [];
    let dockHome: Pt = { x: 0, y: 0 };
    let walkLine: { x0: number; x1: number; y: number } = { x0: 0, x1: 0, y: 0 };
    let blockTop = 0, blockHeight = 1, vh = 1;
    const measure = () => {
      vh = window.innerHeight;
      const r = root.getBoundingClientRect();
      blockTop = r.top + window.scrollY;
      blockHeight = Math.max(1, root.offsetHeight - vh);
      const pts: Pt[] = [];
      for (const el of root.querySelectorAll<HTMLElement>("[data-slip-anchor]")) {
        const b = el.getBoundingClientRect();
        pts.push({ x: b.left + b.width / 2 + window.scrollX, y: b.top + window.scrollY });
      }
      anchors = pts;
      const datum = root.querySelector<HTMLElement>("[data-walk-datum]");
      if (datum) {
        const b = datum.getBoundingClientRect();
        walkLine = { x0: b.left + window.scrollX + 8, x1: b.right + window.scrollX - 8, y: b.top + window.scrollY };
      }
      if (dock) {
        const b = dock.getBoundingClientRect();
        dockHome = { x: b.left + window.scrollX, y: b.top + window.scrollY };
      }
    };
    measure();
    window.addEventListener("resize", measure);

    /* the ONE scheduler */
    let raf = 0, lastY = -1;
    const THRESH = [0.02, 0.3, 0.42, 0.78, 0.97]; /* slip waypoints in block progress */
    const frame = () => {
      raf = 0;
      const y = window.scrollY;
      if (y === lastY) return;
      lastY = y;
      const g = clamp01((y - blockTop + vh * 0.5) / blockHeight); /* global act progress */
      root.style.setProperty("--g", g.toFixed(4));
      /* act-3 walk progress: mapped from its own segment, continuous */
      const w = clamp01((g - THRESH[2]) / (THRESH[3] - THRESH[2]));
      root.style.setProperty("--walk", w.toFixed(4));

      /* slip position: piecewise lerp along waypoints; inside act 3 it rides
         the datum with the walk */
      let sx: number, sy: number, so = 1;
      if (anchors.length >= 4) {
        if (g < THRESH[0]) { sx = anchors[0].x; sy = anchors[0].y; so = 0; }
        else if (g < THRESH[1]) { const t = (g - THRESH[0]) / (THRESH[1] - THRESH[0]); sx = lerp(anchors[0].x, anchors[1].x, t); sy = lerp(anchors[0].y, anchors[1].y, t); }
        else if (g < THRESH[2]) { const t = (g - THRESH[1]) / (THRESH[2] - THRESH[1]); sx = lerp(anchors[1].x, walkLine.x0, t); sy = lerp(anchors[1].y, walkLine.y - 26, t); }
        else if (g < THRESH[3]) { sx = lerp(walkLine.x0, walkLine.x1, w); sy = walkLine.y - 26; }
        else { const t = clamp01((g - THRESH[3]) / (THRESH[4] - THRESH[3])); sx = lerp(walkLine.x1, anchors[3].x, t); sy = lerp(walkLine.y - 26, anchors[3].y, t); if (g > THRESH[4]) so = 0; }
        slip.style.transform = `translate3d(${(sx - window.scrollX).toFixed(1)}px, ${(sy - y).toFixed(1)}px, 0)`;
        slip.style.opacity = String(so);
      }

      /* A2 dock escort: the single being follows one step behind the slip
         while the acts own the viewport; otherwise it rests at home */
      if (dock) {
        if (g > 0.01 && g < 0.985) {
          const dx = (sx! - 40) - dockHome.x + window.scrollX * 0 - window.scrollX + window.scrollX; /* viewport-space */
          const vxTarget = (sx! - window.scrollX) - 44 - dockHome.x;
          const vyTarget = (sy! - y) - 2 - dockHome.y;
          dock.style.transform = `translate3d(${vxTarget.toFixed(1)}px, ${vyTarget.toFixed(1)}px, 0)`;
          dock.style.transition = "transform 320ms cubic-bezier(.22,.8,.24,1)";
          void dx;
        } else {
          dock.style.transform = "translate3d(0,0,0)";
        }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };
    window.addEventListener("scroll", onScroll, { passive: true });
    frame();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      if (raf) cancelAnimationFrame(raf);
      if (dock) { dock.style.transform = ""; dock.style.transition = ""; }
      slip.style.opacity = "0";
    };
  }, [reduced]);

  const mono = "font-mono text-[11px] uppercase tracking-[0.16em]";

  return (
    <div ref={rootRef} data-v7-acts="" className="relative bg-[#08090B] text-[#F7F6F3]">
      <p className="sr-only">{copy.srStory}</p>

      {/* the ONE continuing slip (hidden under reduced motion; static
          per-act stand-ins render instead) */}
      {!reduced && (
        <div
          ref={slipRef}
          aria-hidden
          data-v7-slip=""
          className="pointer-events-none fixed left-0 top-0 z-40 h-[18px] w-[28px] rounded-[2px] border border-[#C9A76A] bg-[#F7F6F3] font-mono text-[7px] leading-[16px] text-[#14161A] opacity-0"
          style={{ willChange: "transform" }}
        >
          <span className="pl-1">req</span>
        </div>
      )}

      {/* ── ACT 1 — the door ─────────────────────────────────────────── */}
      <section data-act="1" className="relative mx-auto flex min-h-[92vh] w-full max-w-[1180px] flex-col justify-center px-6">
        <h1 className="max-w-[15ch] text-[clamp(2.6rem,6vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
          {copy.act1.h}
        </h1>
        <p className="mt-5 max-w-[44ch] text-[clamp(1.05rem,1.6vw,1.25rem)] leading-[1.6] text-[#9AA1AB]">{copy.act1.sub}</p>
        <div className="mt-8 flex max-w-[520px] items-center gap-3 rounded-lg border border-white/15 bg-[#171A20] px-4 py-3.5">
          <span aria-hidden className="text-[#C9A76A]">▍</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={copy.act1.placeholder}
            aria-label={copy.act1.placeholder}
            className="w-full bg-transparent text-[15px] text-[#F7F6F3] outline-none placeholder:text-[#5B6069]"
          />
          <span data-slip-anchor className="h-px w-px" />
        </div>
        <p className="mt-3 font-mono text-[10.5px] text-[#5B6069]">{copy.act1.note}</p>
        {reduced && <StaticSlip label="req" className="mt-4" />}
      </section>

      {/* ── ACT 2 — the gauntlet ─────────────────────────────────────── */}
      <section data-act="2" className="relative mx-auto flex min-h-[92vh] w-full max-w-[1180px] flex-col justify-center px-6">
        <h2 className="max-w-[26ch] text-[clamp(1.5rem,3.2vw,2.3rem)] font-semibold leading-[1.15] tracking-[-0.03em]">
          {copy.act2.h}
        </h2>
        <div className="relative mt-12 h-[180px]" aria-hidden>
          <span data-slip-anchor className="absolute left-[46%] top-0 h-px w-px" />
          {copy.act2.gauntlet.map((q, i) => (
            <span
              key={q}
              className={`${mono} absolute rounded-[3px] border border-dashed border-white/25 px-2.5 py-1 text-[#5B6069]`}
              style={{
                left: `${8 + i * 19}%`,
                top: `${46 + (i % 2) * 28}%`,
                transform: `translate3d(0, calc(var(--g, 0) * ${(i % 3) - 1} * 10px), 0)`,
              }}
            >
              {q}
            </span>
          ))}
        </div>
        {reduced && <StaticSlip label="req" className="mt-2" />}
      </section>

      {/* ── ACT 3 — the walk (sticky, continuous) ────────────────────── */}
      <section data-act="3" className="relative" style={{ height: reduced ? "auto" : "220vh" }}>
        <div className={reduced ? "" : "sticky top-0 flex min-h-screen flex-col justify-center"}>
          <div className="mx-auto w-full max-w-[1180px] px-6 py-[8vh]">
            <h2 className="max-w-[26ch] text-[clamp(1.5rem,3.2vw,2.3rem)] font-semibold leading-[1.15] tracking-[-0.03em]">
              {copy.act3.h}
            </h2>
            <div className="relative mt-16">
              <div data-walk-datum className="relative h-px w-full bg-gradient-to-r from-transparent via-[#C9A76A] to-transparent" />
              {reduced && <StaticSlip label="req" className="absolute -top-8 left-[60%]" />}
              <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {copy.act3.stations.map((s, i) => (
                  <div key={s.name} className="relative">
                    <span
                      aria-hidden
                      className="absolute -top-[29px] left-0 h-2 w-px bg-[#C9A76A]"
                      style={reduced ? undefined : { opacity: `calc(0.25 + 0.75 * clamp(0, calc((var(--walk, 0) - ${i * 0.25}) * 8), 1))` }}
                    />
                    <p className={`${mono} text-[#E2C486]`} style={reduced ? undefined : { opacity: `calc(0.45 + 0.55 * clamp(0, calc((var(--walk, 0) - ${i * 0.25}) * 8), 1))` }}>
                      {s.name}
                    </p>
                    <p className="mt-1 font-mono text-[10.5px] leading-[1.5] text-[#5B6069]">{s.truth}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ACT 4 — paper landing ────────────────────────────────────── */}
      <section data-act="4" className="bg-[#F7F6F3] text-[#14161A]">
        <div className="mx-auto flex min-h-[80vh] w-full max-w-[1180px] flex-col justify-center px-6 py-20">
          <h2 className="max-w-[26ch] text-[clamp(1.5rem,3.2vw,2.3rem)] font-semibold leading-[1.15] tracking-[-0.03em]">
            {copy.act4.h}
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            {copy.act4.chips.map((c, i) => (
              <span
                key={c}
                className={`${mono} rounded-[4px] border px-3.5 py-2 ${i === 3 ? "border-[#C9A76A] bg-[#C9A76A22] text-[#14161A]" : "border-black/25 text-[#3d424b]"}`}
              >
                {c}{i === 3 ? " ✓" : ""}
              </span>
            ))}
            <span data-slip-anchor className="h-px w-px" />
            {reduced && <StaticSlip label="✓" />}
          </div>
          <div className="mt-10">
            <Link
              href="/register"
              className="inline-flex min-h-11 items-center rounded-full bg-[#14161A] px-6 text-[15px] font-medium text-[#F7F6F3] no-underline hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A76A]"
            >
              {copy.act4.cta}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* reduced-motion stand-in: the story's object, statically present */
function StaticSlip({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[18px] w-[28px] rounded-[2px] border border-[#C9A76A] bg-[#F7F6F3] pl-1 font-mono text-[7px] leading-[16px] text-[#14161A] ${className}`}
    >
      {label}
    </span>
  );
}
