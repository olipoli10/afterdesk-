"use client";

/* V7 - the four simplicity acts (direction C hybridized with A's hero).
   REWRITTEN at the P3.1/P4.1 corrective gate.

   ENGINE CONTRACT (each rule answers a named Codex defect):
   - NAMED anchors - request / problem / walk-start / walk-end / result -
     resolved by name and verified for cardinality at measure time; the
     engine disarms LOUDLY (data-v7-engine="missing-anchors") instead of
     silently, and the guard rig fails on that state.
   - TWO coordinate spaces, one authority (P4.2). Document-space anchors
     serve the acts in normal flow; the act-3 walk lives inside a STICKY,
     where document coordinates lie while the element is pinned. The
     engine precomputes the pin window (pinStart/pinEnd), the datum lane's
     offset inside the sticky inner, and the walk x range, then derives
     every frame's target in VIEWPORT space by pure arithmetic - exact in
     all three sticky phases, zero per-frame layout reads.
   - Text is protected by RESERVED LANES in the layout itself, not by
     runtime dodging: act 2 gives the escort its own lane under the
     headline, act 3 puts the datum lane FIRST inside the sticky, and the
     story SEALS at walk-end (the result card materializes) so no transit
     ever crosses the stations or a headline.
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

function AccentLine({ text, accent }: { text: string; accent: string }) {
  const at = text.indexOf(accent);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span data-copy-accent="" className="text-[#D87526]">{accent}</span>
      {text.slice(at + accent.length)}
    </>
  );
}

const ANCHOR_NAMES = ["request", "problem", "solution", "walk-start", "walk-end", "result", "example"] as const;

export function SimplicityActs({ copy, concierge }: { copy: V7ActsCopy; concierge: ConciergeCopy }) {
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const slipRef = useRef<HTMLDivElement | null>(null);
  const [typed, setTyped] = useState("");
  /* the artifact's localized accessible names, readable from the frame
     loop without widening the effect dependencies (written in an effect,
     never during render) */
  const artCopyRef = useRef(copy.artifact);
  useEffect(() => { artCopyRef.current = copy.artifact; }, [copy.artifact]);

  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current, slip = slipRef.current;
    if (!root || !slip) return;
    /* the dock lives inside THIS tree (we render the concierge below) */
    const dock = root.querySelector<HTMLElement>("[data-a2-dock]");

    type Pt = { x: number; y: number }; /* DOCUMENT space (normal-flow acts) */
    let A: Record<(typeof ANCHOR_NAMES)[number], Pt> | null = null;
    /* A-REFOCUS: the dock's home is IN THE FLOW of the hero (A2 stands
       above the intake box), so its home is tracked in DOCUMENT space and
       the escort subtracts the current scroll each frame - the transform
       math stays exact at any scroll position. */
    let dockHomeDoc: { x: number; y: number } | null = null;
    let blockTop = 0, blockHeight = 1, vh = 1;
    /* geometry-based milestones: the slip RESTS at each stop when that anchor
       sits at a comfortable viewport height, so the pacing holds on every
       track length. They depend on the layout, not on the scroll. */
    let yAppear = 0, yProblem = 0, ySolution = 0, yCarryStart = 0, yApproachEnd = 0, yExample = 0;
    let narrativeVh = 1, lastWidth = 0, adjusting = false;
    /* WHERE THE READER IS, kept up to date every frame. A resize event only
       fires AFTER the browser has relaid out and possibly moved the scroll
       itself, so an anchor read at that moment describes a layout the reader
       never saw. This one is always captured in the layout they were
       actually reading. */
    let actBoxes: Array<{ id: string; top: number; h: number }> = [];
    let anchor: { id: string; f: number } | null = null;
    /* sticky constants for act 3 - the second coordinate space */
    let pinStart = 0, pinEnd = 0, sectionTop = 0, laneOffset = 0, wsX = 0, weX = 0;
    let stageTopDoc = 0, stageBottomDoc = 0, stickyTop = 0;
    /* Everything the escort must never land on. Each surface carries the
       rule needed to place it at the current scroll, so a pinned heading is
       judged where it is really drawn; its COLUMN, so it only counts when it
       is actually in the pair's way; and the stretch of story where it is an
       obstacle at all - the request field is where the pair begins and the
       sealed card is where it is set down, and neither blocks the moment the
       story deliberately puts the pair there. */
    type Plane = { mode: "flow" | "pinned" | "stage"; top: number; h: number; stickyTop: number; pinStart: number; pinEnd: number; left: number; right: number; fromY: number; untilY: number };
    let planes: Plane[] = [];
    let escorting = false;
    let exitTimer = 0;

    /* NATURAL layout coordinates. getBoundingClientRect() returns where an
       element is PAINTED, so for a sticky element it reports its pinned
       position - measuring from it would redefine the pin window at the
       current scroll and reset the walk. The offsetTop/offsetLeft chain
       reports the layout position, which is what a pin window is made of. */
    const docTop = (el: HTMLElement) => { let y = 0; let n: HTMLElement | null = el; while (n) { y += n.offsetTop; n = n.offsetParent as HTMLElement | null; } return y; };
    const docLeft = (el: HTMLElement) => { let x = 0; let n: HTMLElement | null = el; while (n) { x += n.offsetLeft; n = n.offsetParent as HTMLElement | null; } return x; };
    /* Chrome folds the sticky shift into offsetTop as well as into the
       rendered rect, so BOTH lie about a pinned element's natural place.
       The only honest reading is to neutralise the stickiness for the
       measurement itself: the style is set and restored inside a single
       task, so nothing is ever painted in the static state - no visible
       manipulation, no temporary scroll. */
    /* ONE transaction: every sticky element in the tree is neutralised
       together, all natural readings are taken, and the styles are always
       restored in finally. One forced layout instead of one per element,
       and nothing is ever painted in the static state. */
    const withNaturalLayout = <T,>(read: () => T): T => {
      const sticky: Array<[HTMLElement, string]> = [];
      for (const el of root.querySelectorAll<HTMLElement>("*")) {
        if (getComputedStyle(el).position === "sticky") { sticky.push([el, el.style.position]); el.style.position = "static"; }
      }
      try {
        return read();
      } finally {
        for (const [el, prev] of sticky) el.style.position = prev;
      }
    };
    /* a point inside a sticky block: its natural place is the block's
       natural top plus its own (shift-free) offset within it */


    /* the narrative height unit: captured once, refreshed only on a real
       width/orientation change. Mobile chrome that changes only the height
       must never restretch the story's own geometry. */
    const setNarrativeUnit = () => {
      narrativeVh = window.innerHeight;
      root.style.setProperty("--v7vh", narrativeVh + "px");
      lastWidth = window.innerWidth;
    };

    /* the launcher now lives in normal flow at A2's post above the intake
       box: its home is a document-space point read from the offset chain
       (no sticky ancestor sits between it and the root, so the chain is
       honest here). Refreshing it is not a structural remeasure. */
    const measureDockHome = () => {
      if (!dock) return;
      const prev = dock.style.transform;
      dock.style.transform = "";
      const btn = dock.querySelector<HTMLElement>("button") ?? dock;
      dockHomeDoc = { x: docLeft(btn), y: docTop(btn) };
      dock.style.transform = prev;
    };

    const measure = () => {
      vh = window.innerHeight;
      blockTop = docTop(root);
      blockHeight = Math.max(1, root.offsetHeight - narrativeVh);
      const found: Partial<Record<(typeof ANCHOR_NAMES)[number], Pt>> = {};
      const natural = withNaturalLayout(() => {
        const out: Record<string, number> = {};
        for (const name of ANCHOR_NAMES) {
          const el = root.querySelector<HTMLElement>(`[data-v7-anchor="${name}"]`);
          if (!el) continue;
          found[name] = { x: docLeft(el) + el.offsetWidth / 2, y: docTop(el) };
        }
        /* the acts, in natural coordinates, so the reader's position inside
           the idea they are reading can be computed every frame without
           touching the layout again */
        actBoxes = [];
        for (const sec of root.querySelectorAll<HTMLElement>("section[data-act], [data-v7-sem='example']")) {
          actBoxes.push({ id: sec.getAttribute("data-act") ?? "example", top: docTop(sec), h: sec.offsetHeight });
        }
        const sec0 = root.querySelector<HTMLElement>('section[data-act="3"]');
        const inner0 = sec0?.querySelector<HTMLElement>("[data-v7-stage]") ?? sec0?.firstElementChild as HTMLElement | null;
        if (sec0) out.sectionTop = docTop(sec0);
        if (inner0) out.stageTop = docTop(inner0);
        for (const sel of ['section[data-act="1"] h1', 'section[data-act="2"] h2', 'section[data-act="2b"] h2', 'section[data-act="3"] h2', 'section[data-act="4"] h2']) {
          const el = root.querySelector<HTMLElement>(sel);
          if (el) out["plane:" + sel] = docTop(el);
        }
        return out;
      });
      const complete = ANCHOR_NAMES.every((n) => {
        const p = found[n];
        return p && Number.isFinite(p.x) && Number.isFinite(p.y);
      });
      A = complete ? (found as Record<(typeof ANCHOR_NAMES)[number], Pt>) : null;
      /* pin window + datum lane, from real sticky geometry. All offsets are
         layout-stable, so this stays exact at ANY scroll position. */
      const sec = root.querySelector<HTMLElement>('section[data-act="3"]');
      const inner = (sec?.querySelector<HTMLElement>("[data-v7-stage]") ?? sec?.firstElementChild) as HTMLElement | null;
      const ws = root.querySelector<HTMLElement>('[data-v7-anchor="walk-start"]');
      const we = root.querySelector<HTMLElement>('[data-v7-anchor="walk-end"]');
      if (sec && inner && ws && we && complete) {
        sectionTop = natural.sectionTop;
        /* the stage may sit BELOW the section top (a plateau heading above
           it) and may pin at a non-zero offset: both come from NATURAL
           layout, so the three sticky phases stay exact at any scroll and
           survive a viewport height change */
        stageTopDoc = natural.stageTop;
        const st = parseFloat(getComputedStyle(inner).top);
        stickyTop = Number.isFinite(st) ? st : 0;
        stageBottomDoc = sectionTop + sec.offsetHeight - inner.offsetHeight;
        pinStart = stageTopDoc - stickyTop;
        pinEnd = stageBottomDoc - stickyTop;
        /* offsets INSIDE the stage are relative, so they are unaffected by
           the stage's own sticky shift */
        laneOffset = docTop(ws) - docTop(inner);
        wsX = docLeft(ws);
        weX = docLeft(we);
      } else {
        A = null;
      }
      /* TEXT PLANES: every headline and station line the pair could cross,
         each described in the space it actually lives in. A plateau
         heading is pinned in VIEWPORT space while its section is in view
         (the P4.2 lesson, applied to text this time); stage content moves
         with the stage; ordinary copy stays in document space. */
      planes = [];
      if (A) {
        yAppear = blockTop + Math.min(0.05 * blockHeight, narrativeVh * 0.35);
        yProblem = Math.max(yAppear + 1, A.problem.y - narrativeVh * 0.5);
        ySolution = Math.max(yProblem + 1, A.solution.y - narrativeVh * 0.5);
        const solutionSection = actBoxes.find((b) => b.id === "2b");
        /* WHAT and PROBLEM already have their own complete visual evidence.
           A2 enters only as SOLUTION approaches, through the reserved carry
           column, and is fully present before that heading reaches the
           ownership zone. The entrance is scroll-driven, never timed. */
        yCarryStart = Math.max(yProblem, (solutionSection?.top ?? A.solution.y) - narrativeVh * 0.96);
        yApproachEnd = Math.max(ySolution + 1, pinStart);
        yExample = A.example.y - narrativeVh * 0.78;
      }
      const planeSel = ['section[data-act="1"] h1', 'section[data-act="2"] h2', 'section[data-act="2b"] h2', 'section[data-act="3"] h2', 'section[data-act="4"] h2'];
      for (const sel of planeSel) {
        const el = root.querySelector<HTMLElement>(sel);
        if (!el) continue;
        const host = el.closest("section") as HTMLElement | null;
        const cs = getComputedStyle(el);
        const elBox = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const fragments = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
        range.detach();
        const addFragments = (mode: Plane["mode"], baseTop: number, stickyTop: number, planePinStart: number, planePinEnd: number) => {
          for (const r of fragments) {
            const lineOffset = r.top - elBox.top;
            planes.push({ mode, top: baseTop + lineOffset, h: r.height,
              stickyTop: mode === "pinned" ? stickyTop + lineOffset : stickyTop,
              pinStart: planePinStart, pinEnd: planePinEnd, left: r.left + window.scrollX, right: r.right + window.scrollX,
              fromY: -1e9, untilY: 1e9 });
          }
        };
        if (inner && inner.contains(el)) {
          addFragments("stage", docTop(el) - docTop(inner), 0, 0, 0);
        } else if (cs.position === "sticky" && host) {
          const hostTop = natural.sectionTop !== undefined && host === root.querySelector('section[data-act="3"]') ? natural.sectionTop : docTop(host);
          const st = parseFloat(cs.top) || 0;
          const nat = natural["plane:" + sel] ?? docTop(el);
          addFragments("pinned", nat, st, nat - st, hostTop + host.offsetHeight - el.offsetHeight - st);
        } else {
          addFragments("flow", docTop(el), 0, 0, 0);
        }
      }
      /* the request field, the gauntlet chips and the sealed result card are
         not type, but the reader is reading them just the same */
      for (const el of root.querySelectorAll<HTMLElement>('[data-v7-sem="what"] input, [data-v7-sem="problem"] .flex-wrap > *')) {
        planes.push({ mode: "flow", top: docTop(el), h: el.offsetHeight, stickyTop: 0, pinStart: 0, pinEnd: 0,
          left: docLeft(el), right: docLeft(el) + el.offsetWidth, fromY: yAppear, untilY: 1e9 });
      }
      for (const el of root.querySelectorAll<HTMLElement>('section[data-act="4"] .rounded-md')) {
        planes.push({ mode: "flow", top: docTop(el), h: el.offsetHeight, stickyTop: 0, pinStart: 0, pinEnd: 0,
          left: docLeft(el), right: docLeft(el) + el.offsetWidth, fromY: -1e9, untilY: yExample });
      }

      /* the station lines ride inside the pinned stage */
      if (inner) {
        const innerTop = inner.getBoundingClientRect().top;
        for (const el of inner.querySelectorAll<HTMLElement>("p")) {
          const range = document.createRange();
          range.selectNodeContents(el);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width <= 1 || r.height <= 1) continue;
            planes.push({ mode: "stage", top: r.top - innerTop, h: r.height, stickyTop: 0, pinStart: 0, pinEnd: 0,
              left: r.left + window.scrollX, right: r.right + window.scrollX, fromY: -1e9, untilY: 1e9 });
          }
          range.detach();
        }
      }
      root.setAttribute("data-v7-engine", A ? "armed" : "missing-anchors");
      buildLane();
      measureDockHome();
      lastY = -1; /* force a recompute on the next frame */
    };

    const setEscort = (on: boolean) => {
      if (!dock || escorting === on) return;
      escorting = on;
      root.setAttribute("data-v7-escort", on ? "on" : "off");
      if (on) {
        if (exitTimer) { window.clearTimeout(exitTimer); exitTimer = 0; }
        /* the launcher affordance stays home: no hail mid-story (P6) */
        dock.setAttribute("data-v7-escorting", "on");
        dock.style.transition = "none";
        dock.style.opacity = "1";
      } else {
        /* the being never glides across page content on release: it fades
           where the story left it, snaps home invisible, fades back in */
        dock.style.transition = "opacity 140ms linear";
        dock.style.opacity = "0";
        exitTimer = window.setTimeout(() => {
          exitTimer = 0;
          dock.style.transition = "none";
          dock.style.transform = "translate3d(0,0,0)";
          dock.removeAttribute("data-v7-escorting");
          dock.removeAttribute("data-a2-scene");
          dock.style.removeProperty("--a2-travel-y");
          requestAnimationFrame(() => {
            dock.style.transition = "opacity 180ms linear";
            dock.style.opacity = "1";
          });
        }, 160);
      }
    };

    let raf = 0, lastY = -1;
    /* WHAT THE STORY WANTS at a given scroll. Pure narrative intent: no
       collision handling of any kind lives in here. */
    const desire = (y: number) => {
      const sx = window.scrollX;
      const itv = y < pinStart ? stageTopDoc - y : y <= pinEnd ? stickyTop : stageBottomDoc - y;
      const laneY = itv + laneOffset;
      const walkT = pinEnd > pinStart ? clamp01((y - pinStart) / (pinEnd - pinStart)) : 0;
      const carryOpacity = clamp01((y - yCarryStart) / Math.max(1, narrativeVh * 0.08));
      /* while it carries, the story asks for a comfortable band rather than a
         lane that has already scrolled off the top */
      const carryY = Math.min(Math.max(laneY, vh * 0.18), vh * 0.62);
      if (!A) return { vx: 0, vy: vh * 0.5, so: 0 };
      if (y < yAppear) return { vx: A.request.x - sx, vy: A.request.y - y, so: 0 };
      if (y < yProblem) {
        const t = (y - yAppear) / (yProblem - yAppear);
        return { vx: lerp(A.request.x - sx, A.problem.x - sx, t), vy: lerp(A.request.y - y, A.problem.y - y, t), so: carryOpacity };
      }
      if (y < ySolution) {
        const t = (y - yProblem) / (ySolution - yProblem);
        return { vx: lerp(A.problem.x - sx, A.solution.x - sx, t), vy: lerp(A.problem.y - y, A.solution.y - y, t), so: carryOpacity };
      }
      if (y < yApproachEnd) {
        const t = (y - ySolution) / (yApproachEnd - ySolution);
        return { vx: lerp(A.solution.x - sx, wsX - sx, t), vy: lerp(A.solution.y - y, laneY, t), so: carryOpacity };
      }
      if (y <= pinEnd) return { vx: lerp(wsX, weX, walkT) - sx, vy: laneY, so: carryOpacity };
      if (y < yExample) return { vx: weX - sx, vy: carryY, so: carryOpacity };
      const t = clamp01((y - yExample) / (narrativeVh * 0.35));
      const out = clamp01((y - (yExample + narrativeVh * 0.95)) / (narrativeVh * 0.25));
      return { vx: lerp(weX - sx, A.example.x - sx + 64, t), vy: lerp(carryY, A.example.y - y + 30, t), so: carryOpacity * (1 - out) };
    };

    /* every obstacle placed in viewport space at a given scroll */
    const bandsAt = (y: number) => {
      const itv = y < pinStart ? stageTopDoc - y : y <= pinEnd ? stickyTop : stageBottomDoc - y;
      const out: Array<[number, number, number, number]> = [];
      for (const pl of planes) {
        if (y < pl.fromY || y > pl.untilY) continue;
        let t: number;
        if (pl.mode === "flow") t = pl.top - y;
        else if (pl.mode === "stage") t = itv + pl.top;
        else t = y < pl.pinStart ? pl.top - y : y <= pl.pinEnd ? pl.stickyTop : pl.pinEnd + pl.stickyTop - y;
        const b = t + pl.h;
        if (b < -40 || t > vh + 40) continue;
        out.push([t, b, pl.left, pl.right]);
      }
      return out;
    };

    /* THE PROJECTION. Given where the story wants the pair and what is on
       screen, return the nearest height at which the whole composition sits
       clear of everything. One function, no cases: the free space is built
       from the obstacles, and the answer is the closest point inside it. */
    /* the composition's real reach around its anchor point. The being grows
       as the story advances, so these cover its LARGEST size: a model built
       on the resting size left 10px of clearance where 12 was asked for. */
    const RISE = 40, DROP = 54, CLEAR = 12;
    const freeAt = (bands: Array<[number, number, number, number]>, xL: number, xR: number) => {
      const lo = RISE, hi = vh - DROP - 8;
      const free: Array<[number, number]> = [];
      if (hi <= lo) return free;
      const blocked: Array<[number, number]> = [];
      for (const [bT, bB, oL, oR] of bands) {
        if (oR < xL - 6 || oL > xR + 6) continue;
        blocked.push([bT - CLEAR - DROP, bB + CLEAR + RISE]);
      }
      blocked.sort((a, b) => a[0] - b[0]);
      let cur = lo;
      for (const [mT, mB] of blocked) {
        if (mB <= cur) continue;
        if (mT > cur) free.push([cur, Math.min(mT, hi)]);
        cur = Math.max(cur, mB);
        if (cur >= hi) break;
      }
      if (cur < hi) free.push([cur, hi]);
      return free.filter(([a, b]) => b - a >= 1);
    };
    /* THE CARRY LANE: one global, continuous function of scroll position.
       Choosing the nearest free interval independently at each sample still
       teleported when that interval closed. Instead, every legal height is
       mapped for the whole story first; a dynamic programme then finds one
       connected, minimum-cost route through those measured gaps. The route
       is computed once and depends only on scroll position — never on
       reading direction or arrival path.

       A windowed predecessor search (a hard per-sample displacement cap)
       previously turned one genuinely tight squeeze into total failure: a
       real, physically narrow gap can close to nothing within a single
       sample even though a wide-open gap exists right beside it, and if the
       escort was pinned inside the narrow one when it closed, the only
       predecessor within the window was gone - `end < 0`, the whole lane
       disarmed for the entire story. Search now covers every legal height
       in the row: the quadratic step cost still makes ordinary motion the
       cheapest choice and keeps it exactly as smooth as before, but a
       transition is never refused purely because it is far - only because
       the destination is not legal. The one time a real squeeze forces a
       larger step, it costs that one step, never the rest of the page. */
    const LANE_STEP = 10, Y_STEP = 8;
    let lane: Float32Array | null = null;
    let laneCut: Uint8Array | null = null;
    let laneFrom = 0;
    const buildLane = () => {
      if (!A) { lane = null; laneCut = null; return; }
      /* The route exists for the carrying story, with a hidden lead-in long
         enough to reach its first legal height before opacity begins. The
         request field above is evidence for WHAT, not part of the carrying
         interval, so it must not make an invisible prelude unsatisfiable. */
      laneFrom = Math.max(blockTop, yCarryStart - narrativeVh * 0.35);
      const laneUntil = yExample + narrativeVh * 1.3;
      const n = Math.max(4, Math.ceil((laneUntil - laneFrom) / LANE_STEP) + 2);
      const lo = RISE, hi = vh - DROP - 8;
      const m = Math.max(2, Math.floor((hi - lo) / Y_STEP) + 1);
      const wants = new Float32Array(n);
      const directLegal = new Uint8Array(n);
      const legal: Uint8Array[] = [];
      for (let i = 0; i < n; i++) {
        const y = laneFrom + i * LANE_STEP;
        const d = desire(y);
        /* Plan the collision-free route before it becomes visible too. If
           obstacles appeared only when opacity crossed a threshold, the
           first visible sample could require an impossible jump. The hidden
           lead-in gives the same continuous function room to pre-position. */
        const free = freeAt(bandsAt(y), d.vx - 54, d.vx + 62);
        wants[i] = Math.min(Math.max(d.vy, lo), hi);
        if (free.some(([a, b]) => wants[i] >= a && wants[i] <= b)) directLegal[i] = 1;
        const row = new Uint8Array(m);
        for (let k = 0; k < m; k++) {
          const vy = lo + k * Y_STEP;
          if (free.some(([a, b]) => vy >= a && vy <= b)) row[k] = 1;
        }
        legal.push(row);
      }

      /* A genuinely reserved layout lane needs no projection at all. Keep
         the narrative's continuous desired path byte-for-byte when every
         sample already clears every measured surface; only invoke the
         global projector when the layout itself cannot provide that lane. */
      if (directLegal.every((v) => v === 1)) {
        lane = wants;
        return;
      }

      let costs = new Float64Array(m);
      costs.fill(Infinity);
      const back: Int16Array[] = [new Int16Array(m).fill(-1)];
      for (let k = 0; k < m; k++) {
        if (!legal[0][k]) continue;
        const d = lo + k * Y_STEP - wants[0];
        costs[k] = d * d * 0.02;
      }
      for (let i = 1; i < n; i++) {
        const next = new Float64Array(m);
        next.fill(Infinity);
        const rowBack = new Int16Array(m).fill(-1);
        /* every predecessor in the row is a candidate: connectivity is
           bounded only by legality, never by an artificial search window */
        for (let k = 0; k < m; k++) {
          if (!legal[i][k]) continue;
          let best = Infinity, bestJ = -1;
          for (let j = 0; j < m; j++) {
            if (!Number.isFinite(costs[j])) continue;
            const step = (k - j) * Y_STEP;
            const candidate = costs[j] + step * step * 0.08;
            if (candidate < best) { best = candidate; bestJ = j; }
          }
          if (bestJ < 0) continue;
          const d = lo + k * Y_STEP - wants[i];
          next[k] = best + d * d * 0.02;
          rowBack[k] = bestJ;
        }
        costs = next;
        back.push(rowBack);
      }

      let end = -1, best = Infinity;
      for (let k = 0; k < m; k++) {
        if (costs[k] < best) { best = costs[k]; end = k; }
      }
      if (end < 0) {
        lane = null;
        laneCut = null;
        root.setAttribute("data-v7-engine", "no-carry-lane");
        return;
      }
      const path = new Float32Array(n);
      for (let i = n - 1, k = end; i >= 0; i--) {
        path[i] = lo + k * Y_STEP;
        if (i > 0) k = back[i][k];
      }
      lane = path;
      /* THE INTERPOLATION SAFETY PASS. Two adjacent samples are each
         individually legal - that is what the DP guarantees - but a
         straight blend between them can still sweep through illegal space
         in between when a real obstacle sits between the two sides. Proven
         by direct measurement: a six-scroll-pixel window where the blended
         position visibly overlapped station text, even though both
         endpoints were correct on their own. Every transition is checked at
         several scroll positions against the SAME geometry the DP itself
         used; one that would cross illegal space is marked so laneAt steps
         instead of blends there - never rendered inside the obstacle, and
         never smoothed through it either. Ordinary transitions, the
         overwhelming majority of the page, are entirely unaffected. */
      const cut = new Uint8Array(n);
      for (let i = 1; i < n; i++) {
        const v0 = path[i - 1], v1 = path[i];
        if (v0 === v1) continue;
        const y0 = laneFrom + (i - 1) * LANE_STEP, y1 = laneFrom + i * LANE_STEP;
        const SAMPLES = 6;
        let safe = true;
        for (let s = 1; s < SAMPLES && safe; s++) {
          const t = s / SAMPLES;
          const y = y0 + (y1 - y0) * t;
          const vy = v0 + (v1 - v0) * t;
          const d = desire(y);
          const free = freeAt(bandsAt(y), d.vx - 54, d.vx + 62);
          if (!free.some(([a, b]) => vy >= a && vy <= b)) safe = false;
        }
        if (!safe) cut[i] = 1;
      }
      laneCut = cut;
    };
    const laneAt = (y: number) => {
      if (!lane || lane.length < 2) return desire(y).vy;
      const t = (y - laneFrom) / LANE_STEP;
      const i = Math.min(lane.length - 2, Math.max(0, Math.floor(t)));
      const f = Math.min(1, Math.max(0, t - i));
      if (laneCut && laneCut[i + 1]) {
        /* the only way to move between two correct, legal positions on
           opposite sides of something solid without ever rendering inside
           it: hold, then step, exactly once, at the midpoint */
        return f < 0.5 ? lane[i] : lane[i + 1];
      }
      return lane[i] + (lane[i + 1] - lane[i]) * f;
    };

    const frame = () => {
      raf = 0;
      const y = window.scrollY;
      if (y === lastY) return;
      lastY = y;
      if (!A) return; /* disarmed loudly; guards catch data-v7-engine */
      const g = clamp01((y - blockTop) / blockHeight);
      root.style.setProperty("--g", g.toFixed(4));
      /* far-fabric parallax: written by THIS same frame on the same rAF -
         depth without a second clock, compositor-only (transform) */
      root.style.setProperty("--par", (-(y * 0.05)).toFixed(1) + "px");
      const centre = y + vh * 0.5;
      for (const b of actBoxes) {
        if (b.h > 0 && centre >= b.top && centre < b.top + b.h) { anchor = { id: b.id, f: (y - b.top) / b.h }; break; }
      }
      /* the walk is bound to the REAL pin window, not to block fractions */
      const walk = pinEnd > pinStart ? clamp01((y - pinStart) / (pinEnd - pinStart)) : 0;
      root.style.setProperty("--walk", walk.toFixed(4));
      root.style.setProperty("--seal", clamp01((y - pinEnd) / (narrativeVh * 0.4)).toFixed(4));


      /* WHERE THE PAIR IS. The lane already answered this question for every
         scroll position, from the real layout: it is clear of headline type,
         station lines, the request field, the gauntlet chips, the sealed
         card and the launcher, it is smooth, and it is the same in both
         reading directions. Nothing here has to dodge anything. */
      const d = desire(y);
      const vx = d.vx;
      const vy = laneAt(y);
      const so = d.so;
      const storyActive = so > 0.01 && y >= yAppear;

      slip.style.transform = `translate3d(${vx.toFixed(1)}px, ${vy.toFixed(1)}px, 0)`;
      slip.style.opacity = so.toFixed(3);

      /* the artifact's three machined states: request until the walk,
         locked while the scope is frozen on the datum, checked after the
         seal. Attribute + localized accessible name, written on change. */
      const artState = y < yApproachEnd ? "request" : y <= pinEnd ? "locked" : "checked";
      if (slip.getAttribute("data-v7-artifact") !== artState) {
        slip.setAttribute("data-v7-artifact", artState);
        slip.setAttribute("aria-label", artCopyRef.current[artState]);
      }

      if (dock && dockHomeDoc) {
        setEscort(storyActive);
        if (storyActive) {
          /* A2's walk is driven by the SAME scroll authority as the route.
             Four integer compositor positions form a quiet step cycle; when
             scroll stops, the being stops. Reverse scroll plays it backward.
             Scene attributes change only at narrative boundaries and let the
             existing sprite player spend one short reaction there. */
          const scene = y < yApproachEnd ? "solution" : y <= pinEnd ? "run" : y < yExample ? "review" : "outcome";
          if (dock.getAttribute("data-a2-scene") !== scene) dock.setAttribute("data-a2-scene", scene);
          const step = [0, -2, -1, 0][Math.abs(Math.floor(y / 18)) % 4];
          dock.style.setProperty("--a2-travel-y", `${step}px`);
          /* integer-pixel escort, trailing beside the slip, never covering.
             The being keeps its painted 64px and the SAME clearances the
             R2.2 lane was proven against (left edge vx-54, feet vy+36);
             the home is document-space now, so the current scroll is
             subtracted to land the same viewport target. */
          const sx = window.scrollX;
          const tx = Math.round(vx - 60 - (dockHomeDoc.x - sx));
          const ty = Math.round(vy - 35 - (dockHomeDoc.y - y));
          dock.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
          /* the being fades with its plate, never apart from it: one
             composition, one opacity, so the two can never disagree */
          dock.style.opacity = so.toFixed(3);
        }
      }
    };
    setNarrativeUnit();
    measure();
    /* fonts.ready is uncancellable: the flag stops a stale resolution from
       re-arming the engine after this effect was cleaned up (e.g. when the
       reduced-motion store flips right after hydration) */
    let disposed = false;
    if (document.fonts?.ready) document.fonts.ready.then(() => { if (!disposed) { measure(); frame(); } }).catch(() => undefined);
    /* a mobile address bar fires a burst of resize events: coalesce them
       into at most ONE remeasure per frame */
    let resizeRaf = 0;
    const onResize = () => {
      if (window.innerWidth !== lastWidth) {
        /* A REAL relayout (orientation or width), handled BEFORE this frame
           is painted. Deferring it to the next animation frame would show
           one hybrid image - new width, old story unit, old scroll - and a
           single wrong image is exactly the flash the reader notices.

           The mobile and desktop rhythms are not proportional to one
           another, so global progress is NOT the invariant: the reader's
           ACT and their position inside it are. That anchor is kept up to
           date on every painted frame, so it describes the layout they were
           actually reading, not this half-changed one. */
        const pos = anchor;
        setNarrativeUnit();
        measure();
        if (pos && !adjusting) {
          const box = actBoxes.find((b) => b.id === pos.id);
          if (box && box.h > 0) {
            const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const target = Math.min(maxY, Math.max(0, Math.round(box.top + pos.f * box.h)));
            if (Math.abs(target - window.scrollY) > 2) {
              adjusting = true;          /* exactly one adjustment, never a second */
              window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
              requestAnimationFrame(() => { adjusting = false; });
            }
          }
        }
        lastY = -1;
        frame();
        return;
      }
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        {
          /* height-only (mobile chrome): the story geometry is expressed in
             the captured unit, so nothing structural moved. Refresh only the
             viewport-space values the escort needs to stay on screen. */
          vh = window.innerHeight;
          measureDockHome();
          lastY = -1;
          frame();
        }
      });
    };
    window.addEventListener("resize", onResize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };
    window.addEventListener("scroll", onScroll, { passive: true });
    frame();
    return () => {
      disposed = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      vv?.removeEventListener("resize", onResize);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      if (raf) cancelAnimationFrame(raf);
      if (exitTimer) window.clearTimeout(exitTimer);
      if (dock) {
        dock.style.transform = "";
        dock.style.transition = "";
        dock.style.opacity = "";
        dock.style.removeProperty("--a2-travel-y");
        dock.removeAttribute("data-v7-escorting");
        dock.removeAttribute("data-a2-scene");
      }
      slip.style.opacity = "0";
      /* the armed marker must not survive a flip to reduced motion */
      root.removeAttribute("data-v7-engine");
      root.removeAttribute("data-v7-escort");
    };
  }, [reduced]);

  const mono = "font-mono text-[11px] uppercase tracking-[0.16em]";

  return (
    <div ref={rootRef} data-v7-acts="" className="relative bg-[#08090B] text-[#F7F6F3]">
      {/* while the being escorts the slip, its launcher hail stays silent -
          the affordance belongs to the resting dock, not to the story.
          P8.1: during the story the being doubles (integer scale, feet
          planted, anatomy untouched) and the launcher chrome steps back so
          only the character carries. The artifact plate switches its three
          machined states by attribute. */}
      <style>{`
        [data-a2-dock][data-v7-escorting="on"] > span[aria-hidden] { display: none; }
        /* the being now rests at 64px natively (integer 2x sprite), so the
           escort no longer rescales it: the PAINTED escort is byte-identical
           to the R2.2-proven geometry - same 64px being, same clearances. */
        [data-a2-dock][data-v7-escorting="on"] [data-a2-being] { transform: translate3d(0, var(--a2-travel-y, 0px), 0) scale(1); transform-origin: 50% 100%; }
        [data-a2-dock][data-v7-escorting="on"] button { background: transparent; border-color: transparent; box-shadow: none; overflow: visible; }
        /* the closure is COMMANDED BY SCROLL: the gold seam closes with
           the walk, the frame stabilizes to gold, the result surface is
           revealed by the seal progress, the check lands last. Reversible
           at any scroll position; no time-based animation, no pulse. */
        [data-v7-slip] [data-plate] { background: #14171d; border-color: color-mix(in srgb, #3a4150, #C9A76A calc(var(--walk, 0) * 100%)); }
        [data-v7-slip] [data-seam] { transform: scaleY(calc(0.35 + 0.65 * var(--walk, 0))); transform-origin: 50% 100%; }
        [data-v7-slip] [data-band] { opacity: var(--walk, 0); }
        [data-v7-slip] [data-lines] { opacity: max(calc(1 - 0.45 * var(--walk, 0) - 1.4 * var(--seal, 0)), 0); }
        [data-v7-slip] [data-paper] { opacity: min(calc(var(--seal, 0) * 1.5), 1); }
        [data-v7-slip] [data-check] { opacity: clamp(0, calc((var(--seal, 0) - 0.62) * 2.6), 1); }
        /* ── FABLE OPENING ──────────────────────────────────────────────
           Focus choreography: the machine acknowledges its operator. Pure
           :focus-within state styling - transitions, never animations. */
        [data-slot]:focus-within { border-color: rgba(201, 167, 106, 0.65); }
        [data-slot]:focus-within [data-slotseam] { opacity: 1; }
        [data-slot]:focus-within [data-tick] { border-color: #C9A76A; }
        [data-slotseam] {
          padding: 1px;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
        }
        /* Entrance orchestration: every element exactly once, ~1.1s total,
           staggered console -> seam -> statement -> slot -> manifest ->
           out-rail -> port. All keyframes animate FROM hidden states and
           base styles ARE the finished scene, so reduced motion (and no-JS)
           get the complete final composition instantly. The intake sweep is
           the page's single ambient signal; the lumen stays still. */
        @media (prefers-reduced-motion: no-preference) {
          [data-fabric] { animation: v7in 0.6s ease-out both; }
          [data-console] { animation: v7in 0.5s ease-out 0.08s both; }
          [data-seamtop] { animation: v7seam 0.45s ease-out 0.3s both; transform-origin: 50% 50%; }
          section[data-act="1"] h1 { animation: v7rise 0.5s ease-out 0.42s both; }
          [data-v7-sub] { animation: v7rise 0.48s ease-out 0.54s both; }
          [data-slot] { animation: v7rise 0.5s ease-out 0.66s both; }
          [data-v7-note] { animation: v7in 0.45s ease-out 0.8s both; }
          [data-v7-manifest] { animation: v7rise 0.48s ease-out 0.86s both; }
          [data-outrail] { animation: v7seam 0.4s ease-out 0.98s both; transform-origin: 0 50%; }
          [data-port] { animation: v7in 0.3s ease-out 1.08s both; }
          [data-rail] { animation: v7rail 0.4s ease-out 1.04s both; }
          [data-lumen] { animation: v7in 0.7s ease-out both; }
          [data-await-sweep] { animation: v7await 6s linear infinite; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-await-sweep] { animation: none; transform: rotate(0.12turn); }
        }
        /* SCENE 4 station illumination: a bump with 60% passage-memory,
           entirely a function of --walk. pre rises before the centre, post
           closes the peak window, hold carries the memory. Base styles are
           the FINISHED lit state, so reduced motion (engine off, no --walk)
           shows every station lit. */
        [data-station] {
          --w: var(--walk, 1);
          --pre: clamp(0, calc((var(--w) - (var(--c, 0) - 0.15)) * 9), 1);
          --post: clamp(0, calc(((var(--c, 0) + 0.11) - var(--w)) * 12), 1);
          --hold: clamp(0, calc((var(--w) - (var(--c, 0) + 0.03)) * 14), 1);
          --lit: max(calc(0.6 * var(--hold)), min(var(--pre), var(--post)));
        }
        [data-station]:not([style]) { --lit: 1; }
        [data-station] { border-color: color-mix(in srgb, #262B35, #6F4C29 calc(var(--lit) * 100%)); }
        [data-station] [data-strod] { opacity: calc(0.35 + 0.65 * var(--lit)); box-shadow: 0 0 calc(12px * var(--lit)) rgba(201, 167, 106, 0.55); }
        [data-station] [data-stname] { opacity: calc(0.6 + 0.4 * var(--lit)); }
        [data-station] [data-sttruth] { opacity: calc(0.55 + 0.45 * var(--lit)); }
        /* SCENES 5+6: the seal resolves the exception, lands the human mark
           in verified green (the palette's "passed" state), and closes the
           artifact's frame. All defaults are the finished state. */
        [data-exception] [data-exwarn] { opacity: calc(1 - clamp(0, calc(var(--seal, 1) * 2.4), 1)); position: absolute; }
        [data-exception] [data-exok] { opacity: clamp(0, calc(var(--seal, 1) * 2.4), 1); }
        [data-exception] { position: relative; padding-left: 34px; }
        [data-exception] > span { left: 14px; }
        [data-mark] { border-color: color-mix(in srgb, #6F4C29, #1E7F5C calc(clamp(0, calc((var(--seal, 1) - 0.3) * 2.2), 1) * 100%)); color: color-mix(in srgb, #C9A76A, #1E7F5C calc(clamp(0, calc((var(--seal, 1) - 0.3) * 2.2), 1) * 100%)); }
        [data-sealed-card] { border-color: color-mix(in srgb, rgba(201, 167, 106, 0.25), #C9A76A calc(clamp(0, calc((var(--seal, 1) - 0.45) * 2), 1) * 100%)); box-shadow: 0 0 calc(44px * var(--seal, 1)) rgba(201, 167, 106, 0.14); }
        @keyframes v7in { from { opacity: 0; } }
        @keyframes v7rise { from { opacity: 0; transform: translateY(14px); } }
        @keyframes v7seam { from { transform: scaleX(0); } }
        @keyframes v7rail { from { transform: scaleY(0); } }
        @keyframes v7await { to { transform: rotate(1turn); } }
      `}</style>
      <p className="sr-only">{copy.srStory}</p>

      {/* THE FAR PLANE: a barely-visible engineering fabric behind every
          act - fine 32px weave inside a sparser 160px survey grid. It says
          a measured apparatus extends beyond what is lit, and it kills the
          "text floating on blank black" failure at near-zero paint cost
          (two repeating gradients, compositor-translated by the engine's
          own frame via --par). */}
      <div
        aria-hidden
        data-fabric=""
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(154,161,171,0.045) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, rgba(154,161,171,0.045) 0 1px, transparent 1px 32px), repeating-linear-gradient(0deg, rgba(154,161,171,0.05) 0 1px, transparent 1px 160px), repeating-linear-gradient(90deg, rgba(154,161,171,0.05) 0 1px, transparent 1px 160px)",
          transform: "translate3d(0, var(--par, 0px), 0)",
          willChange: "transform",
        }}
      />

      {!reduced && (
        <div
          ref={slipRef}
          role="img"
          aria-label={copy.artifact.request}
          data-v7-slip=""
          data-v7-artifact="request"
          className="pointer-events-none fixed left-0 top-0 z-40 w-[52px] opacity-0"
          style={{ willChange: "transform" }}
        >
          {/* the carried piece: a machined onyx plate with a gold seam.
              Three states, universal visual grammar, localized name:
              request (etched lines) -> locked (gold frame + seal band)
              -> checked (light plate, gold seam, dark check). */}
          <div data-plate="" className="relative h-[34px] w-[52px] overflow-hidden rounded-[3px] border shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
            <span data-paper="" aria-hidden className="absolute inset-0 bg-[#F7F6F3]" />
            <span data-seam="" aria-hidden className="absolute inset-y-[3px] left-[3px] w-[2px] rounded-full bg-[#C9A76A]" />
            <span data-band="" aria-hidden className="absolute inset-x-[9px] top-[4px] h-[4px] rounded-sm bg-[#C9A76A]" />
            <span data-lines="" aria-hidden className="absolute bottom-[7px] left-[11px] right-[7px] flex flex-col gap-[4px]">
              <i className="block h-[2px] w-[82%] rounded bg-[#78808B]" />
              <i className="block h-[2px] w-[58%] rounded bg-[#78808B]" />
              <i className="block h-[2px] w-[70%] rounded bg-[#78808B]" />
            </span>
            <span data-check="" aria-hidden className="absolute inset-0 grid place-items-center pl-[4px] font-mono text-[17px] font-bold leading-none text-[#14161A]">✓</span>
          </div>
        </div>
      )}

      {/* ── ACT 1 — the intake console ───────────────────────────────── */}
      {/* FABLE OPENING: the Instrument Desk direction grafted with the
          Datum Line's path manifest and execution rail. The first viewport
          is one machined graphite object - a powered intake console waiting
          for its operator - not text on a void. Every engine surface is
          untouched: same h1 selector and sticky plateau, same input
          selector, same request-anchor placement, no new sticky elements.
          MOBILE PLATEAUS: native sticky only - the finger is never
          intercepted, there is no snap and no automatic advance. */}
      <section data-act="1" data-v7-sem="what" className="relative mx-auto flex min-h-[calc(var(--v7vh,100vh)*1.24)] w-full max-w-[1180px] flex-col px-6 pt-[calc(var(--v7vh,100vh)*0.24)] sm:min-h-[88vh] sm:justify-center sm:pt-32">
        {/* THE CONSOLE: one plane that contains the whole first moment.
            2D lighting stands in for inclination - a lit top seam, gradient
            weight toward the base, a grounding shadow. The page header sits
            on its upper rail, so the name-plate lockup reads as mounted. */}
        <div aria-hidden data-console="" className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--v7vh,100vh)*0.05)] top-3 rounded-[12px] border border-[#232830] bg-[linear-gradient(180deg,#171A20_0%,#111419_55%,#0C0E13_100%)] shadow-[0_36px_90px_rgba(0,0,0,0.55)] sm:bottom-8 sm:top-4">
          <span data-seamtop="" className="absolute inset-x-8 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#C9A76A] to-transparent opacity-75" />
          <span className="absolute left-3 top-3 h-2.5 w-2.5 border-l border-t border-[#3A4150]" />
          <span className="absolute right-3 top-3 h-2.5 w-2.5 border-r border-t border-[#3A4150]" />
          <span className="absolute bottom-3 left-3 h-2.5 w-2.5 border-b border-l border-[#3A4150]" />
          <span className="absolute bottom-3 right-3 h-2.5 w-2.5 border-b border-r border-[#3A4150]" />
          {/* the collected out-rail: the intake's output runs along the
              console base to the port ON THE ESCORT COLUMN - the same
              derived x the anchors use (87% of the padded content box),
              so the request's visible exit IS the lane the story rides */}
          <span data-outrail="" className="absolute bottom-6 left-8 h-px right-[calc(1.5rem+(100%-3rem)*0.13)] bg-gradient-to-r from-transparent via-[#C9A76A]/35 to-[#C9A76A]/70" />
          <span data-port="" className="absolute bottom-6 left-[calc(1.5rem+(100%-3rem)*0.87)] h-[9px] w-[22px] -translate-x-1/2 translate-y-1/2 rounded-[2px] border border-[#6F4C29] bg-[#15110A]" />
        </div>
        {/* powered-on illumination centred on the slot region - the page's
            light source, locating the focal point before any word is read */}
        {/* desktop only: at phone widths the radial freezes into a visible
            rectangular smudge in stills - the mobile console is already
            filled, so it simply goes without ambient light */}
        <div aria-hidden data-lumen="" className="pointer-events-none absolute left-[6%] top-[40%] hidden h-[36%] w-[46%] rounded-full bg-[radial-gradient(closest-side,rgba(201,167,106,0.10),rgba(201,167,106,0.035)_55%,transparent_75%)] sm:block" />

        {/* A-REFOCUS: the hero headline is STATIC everywhere. The refocused
            hero holds its whole composition in the first screen, so the
            act-1 plateau no longer teaches anything - and a static headline
            can never occlude the manifest passing by ("aucune plaque ne
            masque le texte"). Acts 2/2b/4 keep their pinned plates: there,
            content genuinely passes beneath a heading mid-read. */}
        <h1 className="z-10 max-w-[15ch] text-[clamp(2.4rem,5.6vw,4.3rem)] font-semibold leading-[1.04] tracking-[-0.04em]">
          <AccentLine text={copy.act1.h} accent={copy.act1.accent} />
        </h1>
        {/* the composition flows: statement, intake slot, note, then the
            path manifest - the console's zones in reading order, the base
            band below them carrying the out-rail and port */}
        <div className="relative flex flex-1 flex-col pb-[calc(var(--v7vh,100vh)*0.12)] pt-[calc(var(--v7vh,100vh)*0.025)] sm:block sm:flex-none sm:pb-16 sm:pt-0">
          <div>
            <p data-v7-sub="" className="max-w-[46ch] text-[clamp(1.02rem,1.55vw,1.22rem)] leading-[1.6] text-[#9AA1AB] sm:mt-5">{copy.act1.sub}</p>
            {/* A2'S POST (A-REFOCUS): the being stands just ABOVE the intake
                box, feet on a hairline deck - A2 and the box form the focal
                pair. This is also the ONE being's dock: the concierge
                launcher lives here in normal flow, and the escort engine
                tracks its document-space home. */}
            <div data-a2-post="" className="relative mt-[calc(var(--v7vh,100vh)*0.035)] flex w-full max-w-[560px] items-end justify-end pr-2 sm:mt-7">
              <span aria-hidden className="absolute bottom-0 left-1 right-1 h-px bg-gradient-to-r from-transparent via-[#C9A76A]/40 to-transparent" />
              {/* the deck continues past the box and fades - the one quiet
                  counterweight the desktop's right wing carries (C's 15%:
                  a subordinate line, never a subject) */}
              <span aria-hidden className="absolute bottom-0 left-full hidden h-px w-[44vw] max-w-[500px] bg-gradient-to-r from-[#C9A76A]/25 to-transparent sm:block" />
              <A2Concierge copy={concierge} />
            </div>
            {/* THE INTAKE SLOT: the request field MILLED into the console -
                machined housing, corner ticks, etched labels, an amber base
                seam that ignites on focus (the machine acknowledging its
                operator). The engine's request anchor stays inside. */}
            <div data-slot="" className="relative mt-2 w-full max-w-[560px] rounded-[8px] border border-[#2A303B] bg-[#14171D] shadow-[0_2px_28px_rgba(0,0,0,0.45)] transition-colors sm:mt-2">
              <span aria-hidden data-tick="" className="absolute -left-px -top-px h-2.5 w-2.5 rounded-tl-[8px] border-l border-t border-[#4A5160] transition-colors" />
              <span aria-hidden data-tick="" className="absolute -right-px -top-px h-2.5 w-2.5 rounded-tr-[8px] border-r border-t border-[#4A5160] transition-colors" />
              <span aria-hidden data-tick="" className="absolute -bottom-px -left-px h-2.5 w-2.5 rounded-bl-[8px] border-b border-l border-[#4A5160] transition-colors" />
              <span aria-hidden data-tick="" className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-br-[8px] border-b border-r border-[#4A5160] transition-colors" />
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 pb-2 pt-2.5">
                <span className={`${mono} whitespace-nowrap text-[#77808C]`}>{copy.instrument.intake}</span>
                {/* one status, no label swap: a "receiving" claim would
                    contradict the trust note directly beneath it. Focus is
                    acknowledged by the seam and ticks igniting instead. */}
                <span data-await="" className={`${mono} whitespace-nowrap text-[#C9A76A] transition-opacity`}>{copy.instrument.awaiting}</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span aria-hidden className="text-[#C9A76A]">▍</span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={copy.act1.placeholder}
                  aria-label={copy.act1.placeholder}
                  className="w-full min-w-0 overflow-hidden bg-transparent text-[15px] text-[#F7F6F3] outline-none [text-overflow:ellipsis] placeholder:text-[#8A929D]"
                />
                <span data-v7-anchor="request" className="h-px w-px" />
                {/* THE REAL DOOR: the hero's one conversion affordance -
                    the intake's action key routes to the actual request
                    flow, resolving both the missing-CTA dead end and the
                    "does typing submit?" ambiguity (it visibly does not:
                    the door is this key, and the note below says so). */}
                <Link
                  href="/register"
                  aria-label={copy.act4.cta}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[6px] border border-[#6F4C29] text-[16px] text-[#C9A76A] no-underline transition-colors hover:bg-[#C9A76A] hover:text-[#14161A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C486]"
                >
                  →
                </Link>
              </div>
              {/* the small amber line under the box: A's signature, held at
                  a readable-but-quiet level; focus takes it to full */}
              <span aria-hidden data-slotseam="" className="pointer-events-none absolute inset-[-1px] overflow-hidden rounded-[9px] opacity-70">
                <i
                  data-await-sweep=""
                  className="absolute inset-[-100%] block bg-[conic-gradient(from_0turn,transparent_0_52%,rgba(216,117,38,0.20)_58%,rgba(216,117,38,0.95)_76%,rgba(216,117,38,0.20)_92%,transparent_98%)]"
                />
              </span>
            </div>
            {/* the reduced-motion artifact sits WITH the note it explains -
                anchored to the slot's zone, never stranded in open space */}
            <div className="mt-3 flex items-center gap-4">
              <p data-v7-note="" className="font-mono text-[10.5px] text-[#78808B]">{copy.act1.note}</p>
              {reduced && <StaticArtifact state="request" className="shrink-0" />}
            </div>
          </div>
          {/* THE PATH MANIFEST, DEMOTED (A-REFOCUS): the visitor must
              understand ENDVERA before seeing details, so this is a quiet
              secondary line - smaller, dimmer, pushed below the first
              mobile screen. Same derived lane-rule width cap. */}
          {/* quiet but LEGIBLE: a whisper is still content - the red-team
              measured the previous step as an effective contrast failure */}
          <div data-v7-manifest="" className="relative mt-[calc(var(--v7vh,100vh)*0.12)] max-w-[calc(87%-72px)] sm:mt-12 sm:max-w-[640px]">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#7A828E]">{copy.instrument.manifestTitle}</p>
            <ol className="mt-2 flex list-none flex-col gap-1.5 p-0 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
              {copy.instrument.manifest.map((m, i) => (
                <li key={m} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A929D] sm:text-[10.5px]">
                  <span aria-hidden className="text-[9px] text-[#7A6440]">0{i + 1}</span>
                  <span aria-hidden className="h-[2px] w-[2px] rounded-[1px] bg-[#C9A76A]/70" />
                  {m}
                </li>
              ))}
            </ol>
          </div>
        </div>
        {/* the drop: from the console port straight down out of the act -
            act 2's reserved escort column continues the same line */}
        <span aria-hidden data-rail="" className="absolute bottom-0 left-[calc(1.5rem+(100%-3rem)*0.87)] h-[calc(var(--v7vh,100vh)*0.05)] w-px origin-top -translate-x-1/2 bg-gradient-to-b from-[#C9A76A]/70 to-[#C9A76A]/15" />
      </section>

      {/* ── ACT 2 — the gauntlet, child-simple, bounded grid ─────────── */}
      <section data-act="2" data-v7-sem="problem" className="relative mx-auto flex min-h-[calc(var(--v7vh,100vh)*1.26)] w-full max-w-[1180px] flex-col px-6 pt-[calc(var(--v7vh,100vh)*0.13)] sm:block sm:min-h-0 sm:py-[7vh]">
        {/* the execution datum, drawn: the same derived x as the anchors
            (87% of the padded content box) - this hairline IS the reserved
            escort column made visible, continuing the console's out-rail */}
        <span aria-hidden data-lane-line="" className="pointer-events-none absolute inset-y-0 left-[calc(1.5rem+(100%-3rem)*0.87)] w-px -translate-x-1/2 bg-gradient-to-b from-[#C9A76A]/15 via-[#C9A76A]/25 to-[#C9A76A]/15" />
        {/* THE TRANSPORT LANE, RESERVED IN THE LAYOUT ITSELF.
            This headline is STICKY and the content under it FLOWS, so any
            vertical gap between the two necessarily closes as the reader
            scrolls - no spacing rule can hold one open. A COLUMN is the only
            reservation that survives scrolling, so the headline simply stops
            short of the escort's column instead.
            The bound is derived, not chosen: the escort rides its anchor at
            87% of this same content box and reaches 54px to its left, so text
            may run to 87% - 54px, less the 18px the engine already demands as
            clearance. One rule, expressed in the anchor's own units - it
            therefore holds at every width and in every language, with no
            breakpoint test, no language test, and nothing tuned to a
            screenshot. Desktop keeps its measure: there the acts are not a
            single narrow column and the escort does not ride beside them. */}
        <h2 className="sticky top-[10vh] z-10 -mx-3 max-w-[calc(87%-72px)] rounded-[8px] bg-[#0B0D12] px-3 py-2 text-[clamp(1.4rem,3vw,2.1rem)] font-semibold leading-[1.18] tracking-[-0.03em] shadow-[0_10px_28px_rgba(8,9,11,0.5)] sm:static sm:m-0 sm:max-w-[22ch] sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none">
          <AccentLine text={copy.act2.h} accent={copy.act2.accent} />
        </h2>
        {/* SCENE 2 (NARRATIVE): the problem stated, then SHOWN - six
            DISCONNECTED graphite pieces, not five buttons. Competent
            fragments that do not join: staggered model drafts, a stalled
            browser task, a raw tool export, an unassigned handoff, an
            unanswered review, one uncertainty. Stub connectors deliberately
            fail to meet; the --g drift the act already owns pushes them
            gently OUT of alignment as the reader scrolls. The flex-wrap
            container keeps the engine's obstacle registration intact. */}
        <div className="flex flex-1 flex-col pb-[calc(var(--v7vh,100vh)*0.05)] pt-0 sm:mt-8 sm:block sm:flex-none sm:pb-0">
          <p data-v7-s2sub="" className="mt-3 max-w-[42ch] text-[clamp(0.95rem,1.4vw,1.08rem)] leading-[1.6] text-[#9AA1AB]">{copy.act2.sub}</p>
          <div aria-hidden className="relative mt-1 h-px sm:h-6">
            <span data-v7-anchor="problem" className="absolute left-[87%] top-0 h-px w-px sm:top-3" />
          </div>
          <div aria-hidden className="grid max-w-[calc(87%-72px)] flex-1 flex-wrap content-center gap-2.5 py-5 sm:mt-5 sm:max-w-[78%] sm:flex-none sm:grid-cols-2 sm:gap-3 sm:py-0">
            {copy.act2.fragments.map((f, i) => (
              <span
                key={f.label + f.meta}
                data-fragment=""
                className={`relative min-h-[58px] w-full rounded-[6px] border bg-[linear-gradient(135deg,#15181E,#0E1116)] px-3.5 py-2.5 ${
                  i === 5 ? "border-[#6F4C29]" : "border-[#2A303B]"
                }`}
              >
                <span aria-hidden className="absolute inset-y-2.5 left-0 w-px bg-gradient-to-b from-transparent via-[#D87526]/70 to-transparent" />
                <span className="flex items-center gap-2">
                  <i className={`${mono} not-italic text-[#6F7681]`}>{String(i + 1).padStart(2, "0")}</i>
                  <b className={`${mono} block font-semibold ${i === 5 ? "text-[#D87526]" : "text-[#A6ADB8]"}`}>{f.label}</b>
                </span>
                <span className="mt-1 block pl-[30px] text-[11px] leading-[1.35] text-[#7F8793]">{f.meta}</span>
              </span>
            ))}
          </div>
          {reduced && <StaticArtifact state="request" className="mt-4" />}
        </div>
      </section>

      {/* ── SOLUTION — Endvera takes the request ───────────────────── */}
      <section data-act="2b" data-v7-sem="solution" className="relative mx-auto flex min-h-[calc(var(--v7vh,100vh)*0.95)] w-full max-w-[1180px] flex-col px-6 pt-[calc(var(--v7vh,100vh)*0.12)] sm:min-h-0 sm:justify-start sm:py-[9vh]">
        {/* the datum continues through the handover act */}
        <span aria-hidden data-lane-line="" className="pointer-events-none absolute inset-y-0 left-[calc(1.5rem+(100%-3rem)*0.87)] w-px -translate-x-1/2 bg-gradient-to-b from-[#C9A76A]/15 via-[#C9A76A]/25 to-[#C9A76A]/15" />
        {/* the same reserved column: this sticky headline is the wall the
            escort was teleporting over, because it swept up through exactly
            the height the story wants the pair to occupy. Held out of the
            column, its vertical travel no longer touches the escort at all. */}
        <h2 className="sticky top-[10vh] z-10 -mx-3 max-w-[calc(87%-72px)] rounded-[8px] bg-[#0B0D12] px-3 py-2 text-[clamp(1.5rem,3.2vw,2.3rem)] font-semibold leading-[1.16] tracking-[-0.03em] shadow-[0_10px_28px_rgba(8,9,11,0.5)] sm:static sm:m-0 sm:max-w-[24ch] sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none">
          <span className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#D87526]">{copy.solution.eyebrow}</span>
          <AccentLine text={copy.solution.h} accent={copy.solution.accent} />
        </h2>
        {/* SCENE 3 (NARRATIVE): the coordination engine, introduced as a
            physical object. The casing is a graphite housing of six stacked
            module slices threaded by the amber line, with an intake port on
            its lane side - the REAL slip (already carried by A2 through
            this zone: yCarryStart lives here) is what enters it. The
            handover keeps the R2.1/R2.2 escort mechanics untouched. */}
        <div className="flex flex-1 flex-col justify-between pb-[calc(var(--v7vh,100vh)*0.06)] pt-[calc(var(--v7vh,100vh)*0.035)] sm:mt-9 sm:grid sm:flex-none sm:grid-cols-[minmax(0,0.78fr)_minmax(380px,1.22fr)] sm:items-start sm:gap-10 sm:pb-0 sm:pt-0">
          <p className="max-w-[calc(87%-80px)] text-[clamp(1rem,1.5vw,1.15rem)] leading-[1.6] text-[#9AA1AB] sm:max-w-[44ch] sm:pt-2">{copy.solution.sub}</p>
          <div data-casing="" className="relative mt-[calc(var(--v7vh,100vh)*0.045)] max-w-[calc(87%-72px)] rounded-[10px] border border-[#232830] bg-[linear-gradient(180deg,#15181E,#0E1116)] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.5)] sm:mt-0 sm:max-w-none sm:p-4">
            <p className={`${mono} mb-2.5 text-[#7A828E]`}>{copy.engine.title}</p>
            <div className="relative flex flex-col gap-1.5">
              {/* the thread: one amber line stitching the six slices */}
              <span aria-hidden className="absolute bottom-2 left-[11px] top-2 w-px bg-gradient-to-b from-[#C9A76A]/60 via-[#C9A76A]/35 to-[#C9A76A]/60" />
              {copy.act3.stations.map((s) => (
                <div key={s.name} className="relative grid min-w-0 grid-cols-[7px_minmax(0,0.42fr)_minmax(0,1fr)] items-center gap-2.5 rounded-[5px] border border-[#262B35] bg-[#12151B] py-2 pl-2 pr-3">
                  <span aria-hidden className="relative z-[1] h-[7px] w-[7px] shrink-0 rounded-[2px] border border-[#6F4C29] bg-[#1A150D]" />
                  <span className={`${mono} min-w-0 text-[#A6ADB8]`}>{s.name}</span>
                  <span className="min-w-0 text-[10px] leading-[1.35] text-[#737B87]">{s.truth}</span>
                </div>
              ))}
            </div>
            {/* (the desktop stub that once reached toward the lane ended in
                open space and read as unfinished wiring - the casing's
                internal thread and the handover itself carry the story) */}
          </div>
          <div aria-hidden className="relative mt-[calc(var(--v7vh,100vh)*0.02)] h-[64px] sm:col-span-2 sm:mt-7">
            <span data-v7-anchor="solution" className="absolute left-[87%] top-[30px] h-px w-px" />
            {reduced && <StaticArtifact state="request" className="absolute left-[38%] top-0" />}
          </div>
        </div>
      </section>

      {/* ── ACT 3 — the walk (sticky, continuous) ────────────────────── */}
      {/* The datum lane comes FIRST inside the sticky: the escort arrives
          from above through chip decor only, and while the section is
          pinned the pair rides a stable corridor that no headline or
          station text ever enters. */}
      <section data-act="3" data-v7-sem="how" className={reduced ? "relative" : "relative h-[calc(var(--v7vh,100vh)*1.8)] sm:h-[170vh]"}>
        {/* the HOW plateau: its heading stays with its own stations for the
            whole act, exactly like the other mobile plateaus */}
        <div data-v7-stage="" className={reduced ? "" : "sticky top-0 flex min-h-[calc(var(--v7vh,100vh)*0.88)] flex-col justify-center sm:min-h-screen"}>
          <div className={`mx-auto w-full max-w-[1180px] px-6 ${reduced ? "py-[6vh]" : "flex min-h-[calc(var(--v7vh,100vh)*0.88)] flex-col justify-center gap-[calc(var(--v7vh,100vh)*0.045)] pb-[6vh] pt-[6vh] sm:min-h-screen sm:gap-[6vh] sm:pb-[8vh] sm:pt-[8vh]"}`}>
            <h2 className="max-w-[14ch] text-[clamp(1.15rem,3vw,2.1rem)] font-semibold leading-[1.2] tracking-[-0.03em] sm:max-w-[72%]">
              <AccentLine text={copy.act3.h} accent={copy.act3.accent} />
            </h2>
            <div data-v7-lane="" className="relative h-[120px] sm:h-[44px]">
              <div className="absolute inset-x-0 top-[22px] h-px bg-gradient-to-r from-transparent via-[#6F4C29]/45 to-transparent">
                <span
                  aria-hidden
                  data-v7-trail=""
                  className="absolute inset-0 origin-left bg-gradient-to-r from-transparent via-[#D87526] to-[#D87526]/25 opacity-80 shadow-[0_0_10px_rgba(216,117,38,0.42)] will-change-transform"
                  style={reduced ? undefined : { transform: "scaleX(var(--walk, 0))" }}
                />
                <span data-v7-anchor="walk-start" className="absolute right-[10%] top-0 h-px w-px" />
                <span data-v7-anchor="walk-end" className="absolute right-[12%] top-0 h-px w-px sm:right-[6%]" />
              </div>
              {reduced && <StaticArtifact state="locked" className="absolute left-[58%] top-[-12px]" />}
            </div>
            {/* SCENE 4 (NARRATIVE): six stations on the datum. Each is a
                physical module - rod, name plate, role line - whose
                illumination is a pure function of --walk (A2's own
                position IS a function of --walk, so light travels WITH the
                being): rises as A2 approaches its centre, peaks in
                passage, then settles and HOLDS at 60% behind it - lit
                once, remembering the run, fully reversible. No clock.
                Reduced motion renders every station lit (base = final). */}
            {/* the stations are PHYSICAL MODULES on a shared platform - a
                graphite body each, the rod rising to the datum, name plate
                and role line inside. Substance, not thin text columns. */}
            {/* the platform stops at the SAME derived lane bound as every
                other surface (87% of the content box minus the escort's
                72px reach): at pin-exit the slip descends through this
                zone, and R2.2 proved a column is the only reservation
                that survives scrolling. */}
            <div className="relative max-w-[calc(87%-72px)] rounded-[10px] border border-[#1E232B] bg-[#0D1015]/80 p-2.5 sm:max-w-[78%] sm:p-3">
              {/* ONE column on mobile: at pin-exit the slip descends through
                  this block's rows, and a second column would put station
                  text inside the descent footprint (measured: the 128px
                  jump over "Verification"). Desktop keeps three columns -
                  its corridor never crosses the grid. */}
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2.5">
                {/* name ABOVE role on mobile: a side-by-side row starves the
                    role column and long Spanish/Tagalog words then OVERFLOW
                    their box straight into the escort corridor (measured:
                    fragments painted to x=245 from a box ending at 201).
                    Stacked, the role owns the platform's full width and
                    nothing can escape the reserved bound. */}
                {copy.act3.stations.map((s, i) => (
                  <div
                    key={s.name}
                    data-station=""
                    className="min-w-0 rounded-[6px] border border-[#262B35] bg-[#12151B] px-2.5 py-1.5 sm:px-3 sm:pb-2.5 sm:pt-2"
                    style={reduced ? undefined : ({ "--c": `${((i + 0.5) / 6).toFixed(3)}` } as React.CSSProperties)}
                  >
                    <span aria-hidden data-strod="" className="hidden h-8 w-px bg-[#C9A76A] sm:mb-2 sm:block" />
                    <p data-stname="" className={`${mono} flex items-center gap-1.5 text-[#E2C486]`}>
                      <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-[1px] bg-[#C9A76A] sm:hidden" />
                      {s.name}
                    </p>
                    <p data-sttruth="" className="mt-0.5 min-w-0 break-words font-mono text-[9.5px] leading-[1.45] text-[#8A929D] sm:mt-1 sm:text-[10.5px]">{s.truth}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ACT 4 — SCENES 5 + 6: the human check, then the sealed result.
          --seal drives both: 0 -> 0.5 the review resolves (exception fixed,
          the human mark lands, amber turns verified green - green is the
          palette's "passed" state and nothing else), 0.5 -> 1 the artifact
          seals and its frame closes. Defaults are 1, so no-JS and reduced
          readers always see the finished, checked scene. ─────────────── */}
      <section data-act="4" data-v7-sem="example-intro" className="relative mx-auto flex min-h-[calc(var(--v7vh,100vh)*1.45)] w-full max-w-[1180px] flex-col px-6 pt-[calc(var(--v7vh,100vh)*0.02)] sm:min-h-[110vh] sm:justify-center sm:pb-16 sm:pt-6">
        {/* SCENE 5 — the review moment */}
        <h2 className="sticky top-[8vh] z-10 -mx-3 w-[calc(87%-68px)] rounded-[8px] bg-[#0B0D12] px-3 py-2 text-[clamp(1.4rem,3vw,2.1rem)] font-semibold leading-[1.18] tracking-[-0.03em] shadow-[0_10px_28px_rgba(8,9,11,0.5)] sm:static sm:m-0 sm:w-auto sm:max-w-[26ch] sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none">
          <span className="block max-w-[14ch] sm:max-w-none">
            <AccentLine text={copy.review.h} accent={copy.review.accent} />
          </span>
        </h2>
        <div className="flex flex-1 flex-col pb-[calc(var(--v7vh,100vh)*0.05)] pt-[calc(var(--v7vh,100vh)*0.02)] sm:grid sm:max-w-[calc(87%-72px)] sm:flex-none sm:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] sm:items-start sm:gap-x-8 sm:gap-y-6 sm:pb-0 sm:pt-0">
          <p className="mt-2 max-w-[calc(87%-80px)] text-[clamp(0.95rem,1.4vw,1.1rem)] leading-[1.6] text-[#9AA1AB] sm:col-span-2 sm:mt-4 sm:max-w-[44ch]">{copy.review.sub}</p>
          {/* the review table: draft + standard + evidence, one exception
              resolved, the human mark - all left of the escort column */}
          <div className="mt-5 flex max-w-[calc(87%-72px)] flex-wrap items-stretch gap-2.5 sm:mt-3 sm:grid sm:max-w-none sm:grid-cols-2 sm:gap-3">
            <div className="rounded-md border border-[#2A303B] bg-[#12151B] px-3.5 py-2.5">
              <p className={`${mono} text-[#7A828E]`}>{copy.review.draft}</p>
              <span aria-hidden className="mt-2 flex flex-col gap-[3px]">
                <i className="block h-[2px] w-[72px] rounded bg-[#78808B]" />
                <i className="block h-[2px] w-[54px] rounded bg-[#78808B]" />
                <i className="block h-[2px] w-[63px] rounded bg-[#78808B]" />
              </span>
            </div>
            <div className="rounded-md border border-[#6F4C29] bg-[#15110A] px-3.5 py-2.5">
              <p className={`${mono} text-[#C9A76A]`}>{copy.review.standard}</p>
              <span aria-hidden className="mt-2 flex flex-col gap-[3px]">
                <i className="block h-[2px] w-[68px] rounded bg-[#8A6F45]" />
                <i className="block h-[2px] w-[68px] rounded bg-[#8A6F45]" />
              </span>
            </div>
            <div className="rounded-md border border-[#2A303B] bg-[#12151B] px-3.5 py-2.5">
              <p className={`${mono} text-[#7A828E]`}>{copy.review.evidence}</p>
              <span aria-hidden className="mt-2 flex items-end gap-[3px]">
                <i className="block h-[8px] w-[5px] rounded-[1px] bg-[#4A5160]" />
                <i className="block h-[12px] w-[5px] rounded-[1px] bg-[#4A5160]" />
                <i className="block h-[6px] w-[5px] rounded-[1px] bg-[#4A5160]" />
              </span>
            </div>
            {/* the exception, resolved as the seal progresses */}
            <div data-exception="" className="flex items-center gap-2 rounded-md border border-[#2A303B] bg-[#12151B] px-3.5 py-2.5">
              <span aria-hidden data-exwarn="" className={`${mono} text-[#C9A76A]`}>⚠</span>
              <span aria-hidden data-exok="" className={`${mono} text-[#1E7F5C]`}>✓</span>
              <p className={`${mono} text-[#8A929D]`}>{copy.review.exception}</p>
            </div>
            {/* the human mark: amber while checking, green once passed */}
            <div data-mark="" className="flex items-center gap-2 rounded-md border px-3.5 py-2.5">
              <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full border border-current font-mono text-[11px] font-bold">✓</span>
              <p className={`${mono}`}>{copy.review.mark}</p>
            </div>
          </div>

          {/* SCENE 6 — the sealed artifact: the payoff of the scroll */}
          <div className="sm:col-start-2 sm:row-start-2">
            <p data-v7-s6h="" className="mt-[calc(var(--v7vh,100vh)*0.06)] max-w-[calc(87%-72px)] text-[clamp(1.25rem,2.4vw,1.8rem)] font-semibold leading-[1.2] tracking-[-0.03em] text-[#F7F6F3] sm:mt-3 sm:max-w-[24ch]" role="heading" aria-level={2}>
              <AccentLine text={copy.sealed.h} accent={copy.sealed.accent} />
            </p>
            <div className="mt-4 flex flex-wrap items-start gap-5 sm:mt-5">
            <div
              data-sealed-card=""
              className="relative min-h-[220px] w-full max-w-[320px] rounded-md border-2 bg-[#F7F6F3] p-5 text-[#14161A] sm:max-w-none"
              style={reduced ? undefined : { opacity: "calc(0.15 + 0.85 * var(--seal, 1))" }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b5d3f]">{copy.sealed.seal}</p>
              <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {copy.sealed.chips.map((c, i) => (
                  <p key={c} className="flex items-center gap-1.5 text-[13px] font-semibold leading-[1.35]">
                    <span aria-hidden className={i === 1 ? "text-[#166049]" : "text-[#6b5d3f]"}>{i === 1 ? "✓" : "·"}</span>
                    {c}
                  </p>
                ))}
              </div>
              <span data-v7-anchor="result" className="absolute right-4 top-4 h-px w-px" />
              {reduced && <StaticArtifact state="checked" className="mt-3" />}
            </div>
            </div>
          </div>

          {/* the bridge into the real example: A2 presents it here */}
          <div className="mt-8 pt-[calc(var(--v7vh,100vh)*0.02)] sm:col-span-2 sm:mt-4 sm:pt-0">
            <p className={`${mono} text-[#E2C486]`}>{copy.exampleIntro}</p>
            <span data-v7-anchor="example" aria-hidden className="relative left-[65%] top-3 block h-px w-px sm:left-[87%]" />
            {reduced && <StaticArtifact state="checked" className="mt-4" />}
          </div>
        </div>
      </section>

      {/* the ONE being lives inside this tree, at its hero post above the
          intake box - scoped ownership, rendered inside act 1 */}
    </div>
  );
}

function StaticArtifact({ state, className = "" }: { state: "request" | "locked" | "checked"; className?: string }) {
  /* the same machined plate, frozen at one state for reduced motion */
  const checked = state === "checked";
  const locked = state === "locked";
  return (
    <span
      aria-hidden
      data-v7-static-artifact=""
      className={`relative inline-block h-[34px] w-[52px] rounded-[3px] border shadow-[0_2px_10px_rgba(0,0,0,0.5)] ${checked ? "border-[#C9A76A] bg-[#F7F6F3]" : locked ? "border-[#C9A76A] bg-[#14171d]" : "border-[#3a4150] bg-[#14171d]"} ${className}`}
    >
      <i className="absolute inset-y-[3px] left-[3px] w-[2px] rounded-full bg-[#C9A76A]" />
      {locked && <i className="absolute inset-x-[9px] top-[4px] h-[4px] rounded-sm bg-[#C9A76A]" />}
      {!checked && (
        <i className={`absolute bottom-[7px] left-[11px] right-[7px] flex flex-col gap-[4px] ${locked ? "opacity-55" : ""}`}>
          <i className="block h-[2px] w-[82%] rounded bg-[#78808B]" />
          <i className="block h-[2px] w-[58%] rounded bg-[#78808B]" />
          <i className="block h-[2px] w-[70%] rounded bg-[#78808B]" />
        </i>
      )}
      {checked && <i className="absolute inset-0 grid place-items-center pl-[4px] font-mono text-[17px] font-bold not-italic leading-none text-[#14161A]">✓</i>}
    </span>
  );
}
