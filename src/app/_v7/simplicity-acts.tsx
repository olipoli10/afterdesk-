"use client";

/* V7 - the four simplicity acts (direction C hybridized with A's hero).
   REWRITTEN at the P3.1/P4.1 corrective gate.

   ENGINE CONTRACT (each rule answers a named Codex defect):
   - NAMED anchors - request / problem / walk-start / walk-end / result -
     resolved by name and verified for cardinality at measure time; the
     engine disarms LOUDLY (data-v7-engine="missing-anchors") instead of
     silently, and the guard rig fails on that state.
   - ONE coordinate authority: every target is stored as a DOCUMENT-space
     point at measure time; each frame converts to viewport space with the
     single scrollY read. No mixed math, no dead variables.
   - The slip and the A2 dock follow the same authority; A2 offsets are
     Math.round()ed so the pixel being never lands on fractions.
   - No per-frame CSS transition: transitions are applied ONCE on escort
     entry/exit via a class; scroll-driven frames write raw transforms.
   - The dock transform is guaranteed cleared when the story releases it
     (g outside the acts) and on unmount.
   - Ownership: this component RENDERS the concierge itself inside its own
     ref tree and finds the dock within that ref - no global
     document.querySelector, and a second A2 cannot exist.
   - Anchors re-measure after fonts load, on resize, and on first scroll
     past hydration. No layout reads inside the frame loop.
   - Reduced motion: the scheduler never starts; the story renders as
     natural flow with static slips and the dock resting in its corner. */

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { A2Concierge, type ConciergeCopy } from "@/app/_home/a2-concierge";
import type { V7ActsCopy } from "@/lib/i18n/v7-acts";

function subscribeReduced(cb: () => void) {
  const m = window.matchMedia("(prefers-reduced-motion: reduce)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const ANCHOR_NAMES = ["request", "problem", "walk-start", "walk-end", "result"] as const;

export function SimplicityActs({ copy, concierge }: { copy: V7ActsCopy; concierge: ConciergeCopy }) {
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
    /* the dock lives inside THIS tree (we render the concierge below) */
    const dock = root.querySelector<HTMLElement>("[data-a2-dock]");

    type Pt = { x: number; y: number }; /* DOCUMENT space, always */
    let A: Record<(typeof ANCHOR_NAMES)[number], Pt> | null = null;
    let dockHomeViewport: { x: number; y: number } | null = null;
    let blockTop = 0, blockHeight = 1, vh = 1;
    let escorting = false;

    const measure = () => {
      vh = window.innerHeight;
      const r = root.getBoundingClientRect();
      blockTop = r.top + window.scrollY;
      blockHeight = Math.max(1, root.offsetHeight - vh);
      const found: Partial<Record<(typeof ANCHOR_NAMES)[number], Pt>> = {};
      for (const name of ANCHOR_NAMES) {
        const el = root.querySelector<HTMLElement>(`[data-v7-anchor="${name}"]`);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        found[name] = { x: b.left + b.width / 2 + window.scrollX, y: b.top + window.scrollY };
      }
      const complete = ANCHOR_NAMES.every((n) => {
        const p = found[n];
        return p && Number.isFinite(p.x) && Number.isFinite(p.y);
      });
      A = complete ? (found as Record<(typeof ANCHOR_NAMES)[number], Pt>) : null;
      root.setAttribute("data-v7-engine", complete ? "armed" : "missing-anchors");
      if (dock) {
        /* dock is position:fixed - its untransformed rect IS viewport space */
        const prev = dock.style.transform;
        dock.style.transform = "";
        const b = dock.getBoundingClientRect();
        dockHomeViewport = { x: b.left, y: b.top };
        dock.style.transform = prev;
      }
    };
    measure();
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => undefined);
    window.addEventListener("resize", measure);

    const setEscort = (on: boolean) => {
      if (!dock || escorting === on) return;
      escorting = on;
      root.setAttribute("data-v7-escort", on ? "on" : "off");
      /* transition ONCE at entry/exit - never during scroll frames */
      dock.style.transition = on ? "none" : "transform 260ms cubic-bezier(.22,.8,.24,1)";
      if (!on) dock.style.transform = "translate3d(0,0,0)";
    };

    let raf = 0, lastY = -1;
    const W = [0.06, 0.3, 0.44, 0.8, 0.96]; /* waypoint thresholds in block progress */
    const frame = () => {
      raf = 0;
      const y = window.scrollY;
      if (y === lastY) return;
      lastY = y;
      if (!A) return; /* disarmed loudly; guards catch data-v7-engine */
      const g = clamp01((y - blockTop) / blockHeight);
      root.style.setProperty("--g", g.toFixed(4));
      const walk = clamp01((g - W[2]) / (W[3] - W[2]));
      root.style.setProperty("--walk", walk.toFixed(4));

      /* slip document-space target via named waypoints */
      let sx: number, sy: number, so = 1;
      if (g < W[0]) { sx = A.request.x; sy = A.request.y; so = 0; }
      else if (g < W[1]) { const t = (g - W[0]) / (W[1] - W[0]); sx = lerp(A.request.x, A.problem.x, t); sy = lerp(A.request.y, A.problem.y, t); }
      else if (g < W[2]) { const t = (g - W[1]) / (W[2] - W[1]); sx = lerp(A.problem.x, A["walk-start"].x, t); sy = lerp(A.problem.y, A["walk-start"].y, t); }
      else if (g < W[3]) { sx = lerp(A["walk-start"].x, A["walk-end"].x, walk); sy = lerp(A["walk-start"].y, A["walk-end"].y, walk); }
      else { const t = clamp01((g - W[3]) / (W[4] - W[3])); sx = lerp(A["walk-end"].x, A.result.x, t); sy = lerp(A["walk-end"].y, A.result.y, t); if (g >= W[4]) so = 0; }

      /* ONE conversion document -> viewport for both objects */
      const vx = sx - window.scrollX, vy = sy - y;
      slip.style.transform = `translate3d(${vx.toFixed(1)}px, ${vy.toFixed(1)}px, 0)`;
      slip.style.opacity = String(so);

      if (dock && dockHomeViewport) {
        const inStory = g > W[0] && g < W[4] && so > 0;
        setEscort(inStory);
        if (inStory) {
          /* integer-pixel escort, trailing beside the slip, never covering */
          const tx = Math.round(vx - 44 - dockHomeViewport.x);
          const ty = Math.round(vy - 6 - dockHomeViewport.y);
          dock.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
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
      <section data-act="1" className="relative mx-auto flex min-h-[88vh] w-full max-w-[1180px] flex-col justify-center px-6 pt-24">
        <h1 className="max-w-[15ch] text-[clamp(2.5rem,6vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
          {copy.act1.h}
        </h1>
        <p className="mt-5 max-w-[44ch] text-[clamp(1.05rem,1.6vw,1.25rem)] leading-[1.6] text-[#9AA1AB]">{copy.act1.sub}</p>
        <div className="mt-8 flex w-full max-w-[520px] items-center gap-3 rounded-lg border border-white/15 bg-[#171A20] px-4 py-3.5">
          <span aria-hidden className="text-[#C9A76A]">▍</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={copy.act1.placeholder}
            aria-label={copy.act1.placeholder}
            className="w-full min-w-0 bg-transparent text-[15px] text-[#F7F6F3] outline-none placeholder:text-[#5B6069]"
          />
          <span data-v7-anchor="request" className="h-px w-px" />
        </div>
        <p className="mt-3 font-mono text-[10.5px] text-[#5B6069]">{copy.act1.note}</p>
        {reduced && <StaticSlip label="req" className="mt-4" />}
      </section>

      {/* ── ACT 2 — the gauntlet, child-simple, bounded grid ─────────── */}
      <section data-act="2" className="relative mx-auto flex min-h-[80vh] w-full max-w-[1180px] flex-col justify-center px-6">
        <h2 className="max-w-[22ch] text-[clamp(1.4rem,3vw,2.1rem)] font-semibold leading-[1.18] tracking-[-0.03em]">
          {copy.act2.h}
        </h2>
        {/* the slip hovers above the gauntlet - contained flex-wrap, no
            percentage absolutes, so the geometry itself fits every phone */}
        <div className="relative mt-10">
          <span data-v7-anchor="problem" className="absolute left-1/2 top-[-34px] h-px w-px" />
          <div aria-hidden className="flex max-w-full flex-wrap gap-2.5">
            {copy.act2.gauntlet.map((q, i) => (
              <span
                key={q}
                className={`${mono} whitespace-nowrap rounded-[3px] border border-dashed border-white/25 px-2.5 py-1.5 text-[#5B6069]`}
                style={{ transform: `translate3d(0, calc(var(--g, 0) * ${((i % 3) - 1) * 8}px), 0)` }}
              >
                {q}
              </span>
            ))}
          </div>
          {reduced && <StaticSlip label="req" className="mt-4" />}
        </div>
      </section>

      {/* ── ACT 3 — the walk (sticky, continuous) ────────────────────── */}
      <section data-act="3" className="relative" style={{ height: reduced ? "auto" : "200vh" }}>
        <div className={reduced ? "" : "sticky top-0 flex min-h-screen flex-col justify-center"}>
          <div className="mx-auto w-full max-w-[1180px] px-6 py-[8vh]">
            <h2 className="max-w-[26ch] text-[clamp(1.4rem,3vw,2.1rem)] font-semibold leading-[1.18] tracking-[-0.03em]">
              {copy.act3.h}
            </h2>
            <div className="relative mt-16">
              <div className="relative h-px w-full bg-gradient-to-r from-transparent via-[#C9A76A] to-transparent">
                <span data-v7-anchor="walk-start" className="absolute left-[6%] top-0 h-px w-px" />
                <span data-v7-anchor="walk-end" className="absolute right-[6%] top-0 h-px w-px" />
              </div>
              {reduced && <StaticSlip label="req" className="absolute -top-8 left-[58%]" />}
              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                {copy.act3.stations.map((s, i) => (
                  <div key={s.name} className="min-w-0">
                    <span
                      aria-hidden
                      className="mb-2 block h-2 w-px bg-[#C9A76A]"
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

      {/* ── ACT 4 — the sealed result, ONYX (no paper hard-cut) ──────── */}
      <section data-act="4" className="relative mx-auto flex min-h-[80vh] w-full max-w-[1180px] flex-col justify-center px-6 pb-16">
        <h2 className="max-w-[26ch] text-[clamp(1.4rem,3vw,2.1rem)] font-semibold leading-[1.18] tracking-[-0.03em]">
          {copy.act4.h}
        </h2>
        {/* the short intentional light moment: ONE contained sealed card on
            onyx - the world stays night, the deliverable glows */}
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <div className="relative max-w-[300px] rounded-md border border-[#C9A76A] bg-[#F7F6F3] p-5 text-[#14161A] shadow-[0_0_40px_rgba(201,167,106,0.12)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a7a55]">AfterDesk · result</p>
            <p className="mt-2 text-[15px] font-semibold leading-[1.4]">✓ {copy.act4.chips[3]}</p>
            <span data-v7-anchor="result" className="absolute right-4 top-4 h-px w-px" />
            {reduced && <StaticSlip label="✓" className="mt-3" />}
          </div>
          <div className="grid gap-2.5">
            {copy.act4.chips.slice(0, 3).map((c) => (
              <span key={c} className={`${mono} rounded-[4px] border border-white/20 px-3.5 py-2 text-[#c7ccd4]`}>{c}</span>
            ))}
          </div>
        </div>
        <div className="mt-10">
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center rounded-full border border-[#C9A76A] px-6 text-[15px] font-medium text-[#E2C486] no-underline transition-colors hover:bg-[#C9A76A] hover:text-[#14161A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C486]"
          >
            {copy.act4.cta}
          </Link>
        </div>
      </section>

      {/* the ONE being lives inside this tree - scoped ownership */}
      <A2Concierge copy={concierge} />
    </div>
  );
}

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
