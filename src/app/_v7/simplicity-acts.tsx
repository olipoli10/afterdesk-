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

type MotionScene = keyof ConciergeCopy["guide"];
type MotionSnapshot = {
  scene: MotionScene;
  sceneP: number;
  engineP: number;
  release: number;
  power: { intake: number; problem: number; engine: number; run: number; release: number; beat: number };
};

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

/* THE ATTACHED DIALOGUE WINDOW. One compact window per beat, living in a
   RESERVED in-flow band so it can never cover protected content, opened by
   the scroll authority exactly while A2 stands beside it (data-v7-beat),
   folded before he walks again. The tether visibly reaches the being. */
function A2Dialogue({ beat, label, line, align }: {
  beat: "probleme" | "perimetre" | "moteur" | "jugement" | "resultat";
  label: string;
  line: string;
  align?: "drop" | "flush";
}) {
  return (
    <div data-a2-beat={beat} className="pointer-events-none relative flex min-h-[92px] items-start justify-end">
      {/* the step marker: always drawn, so the reserved band reads as a
          waiting station on the route, never as a hole. The window unfolds
          from it when A2 arrives. */}
      <span aria-hidden data-beat-marker="" className={`absolute top-[38px] flex items-center gap-1.5 ${align === "flush" ? "right-2" : "right-[calc(13%+76px)]"}`}>
        <i className="h-px w-10 bg-gradient-to-l from-[#6F4C29]/70 to-transparent" />
        <i className="h-[7px] w-[7px] rotate-45 border border-[#6F4C29] bg-[#15110A]" />
      </span>
      <aside
        data-a2-dialog={beat}
        className={`relative mt-2 max-w-[min(46ch,calc(87%-96px))] rounded-[7px] border border-[#49331F] bg-[#0B0D11]/97 px-3 py-2.5 shadow-[0_12px_34px_rgba(0,0,0,0.42)] ${
          align === "drop"
            ? /* the drop corridor at the centre stays text-free: the window
                 sits fully LEFT of it, tethered right toward the pair */
              "mr-[calc(13%+76px)] sm:mr-[calc(50%+40px)] sm:max-w-[min(44ch,calc(50%-64px))]"
            : align === "flush" ? "mr-2 max-w-[min(46ch,calc(100%-40px))]" : "mr-[calc(13%+76px)]"
        }`}
      >
        <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#D87526]">
          <span aria-hidden data-a2-note-speaker="" className="relative h-[10px] w-[13px] shrink-0 bg-[#D87526] shadow-[0_0_8px_rgba(216,117,38,0.58)]">
            <i className="absolute left-[3px] top-[3px] h-[2px] w-[2px] bg-[#08090B]" />
            <i className="absolute right-[3px] top-[3px] h-[2px] w-[2px] bg-[#08090B]" />
            <i className="absolute -bottom-[2px] left-[2px] h-[2px] w-[9px] bg-[#3A3F49]" />
          </span>
          {label}
        </p>
        <p className="mt-1 text-[12px] leading-[1.45] text-[#E8D9B8] sm:text-[13px]">{line}</p>
        <span aria-hidden data-a2-note-tether="" className={`absolute left-full top-1/2 h-px w-[68px] bg-gradient-to-r from-[#D87526]/80 to-[#C9A76A]/35 ${align === "drop" ? "sm:top-auto sm:-bottom-3 sm:left-1/2 sm:h-3 sm:w-px sm:bg-gradient-to-b" : ""}`}>
          <i className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border border-[#D87526] bg-[#111318]" />
        </span>
      </aside>
    </div>
  );
}

const ANCHOR_NAMES = ["request", "problem", "solution", "walk-start", "walk-end", "result", "example"] as const;

export function SimplicityActs({ copy, concierge, children }: {
  copy: V7ActsCopy;
  concierge: ConciergeCopy;
  children?: React.ReactNode;
}) {
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
    let handoffStart = 0, handoffEnd = 0;
    let exampleSceneY = Number.POSITIVE_INFINITY, finalSceneY = Number.POSITIVE_INFINITY, releaseY = Number.POSITIVE_INFINITY, freeFixY = Number.POSITIVE_INFINITY;
    let narrativeVh = 1, lastWidth = 0, adjusting = false, pageMaxY = Number.POSITIVE_INFINITY, endZoneChecked = false;
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
    let railX = 0;
    /* THE PAINTED PATH (founder repair). One polyline of measured, painted
       segments owns every A2 position: the 87% column through acts 1-2b,
       the datum excursion inside the pinned stage, the service bay through
       the engine, the 87% column again through act 4, the result. The
       request plate shares it until the port, then descends the drop alone.
       Every coordinate below comes from a painted element's own geometry. */
    let colX = 0;              /* the 87% conductor (acts 2/2b/4) */
    let dropXm = 0;            /* where the drop leaves the datum (stage x) */
    let deckY = 0;             /* the release deck A2 walks to his free post */
    let portOffsetY = 0;       /* the engine's top port, stage-relative */
    let frameBottomOffset = 0; /* engine frame bottom, stage-relative */
    /* beat bands: reserved in-flow layout slots where one attached dialogue
       window opens while A2 pauses beside it. Document-space tops. */
    type BeatName = "probleme" | "perimetre" | "moteur" | "jugement" | "resultat";
    let beatBands: Partial<Record<BeatName, { y: number; h: number }>> = {};
    /* Everything the escort must never land on. Each surface carries the
       rule needed to place it at the current scroll, so a pinned heading is
       judged where it is really drawn; its COLUMN, so it only counts when it
       is actually in the pair's way; and the stretch of story where it is an
       obstacle at all - the request field is where the pair begins and the
       sealed card is where it is set down, and neither blocks the moment the
       story deliberately puts the pair there. */
    type Plane = { mode: "flow" | "pinned" | "stage"; top: number; h: number; stickyTop: number; pinStart: number; pinEnd: number; left: number; right: number; fromY: number; untilY: number };
    let planes: Plane[] = [];
    type DockMode = "home" | "escort" | "free";
    let dockMode: DockMode = "home";
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
      const wasFree = dock.getAttribute("data-a2-free") === "on";
      const prev = dock.style.transform;
      if (wasFree) dock.removeAttribute("data-a2-free");
      dock.style.transform = "";
      const btn = dock.querySelector<HTMLElement>("button") ?? dock;
      dockHomeDoc = { x: docLeft(btn), y: docTop(btn) };
      dock.style.transform = prev;
      if (wasFree) dock.setAttribute("data-a2-free", "on");
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
        const rail = root.querySelector<HTMLElement>("[data-engine-escort-rail]");
        if (rail) out.railX = docLeft(rail) + rail.offsetWidth / 2;
        /* the 87% conductor: A2's highway. Its centre x is the painted law
           every vertical leg reuses. */
        const col = root.querySelector<HTMLElement>('section[data-act="2"] [data-lane-line]');
        if (col) out.colX = docLeft(col) + col.offsetWidth / 2;
        /* the engine's top port (the request receiver) and the frame the
           service bay runs through, all stage-relative */
        const port = root.querySelector<HTMLElement>("[data-engine-feed-joint]");
        if (port) { out.portX = docLeft(port) + port.offsetWidth / 2; out.portY = docTop(port) + port.offsetHeight / 2; }
        const frameEl = root.querySelector<HTMLElement>("[data-living-engine]");
        if (frameEl) { out.frameTop = docTop(frameEl); out.frameBottom = docTop(frameEl) + frameEl.offsetHeight; }
        const deck = root.querySelector<HTMLElement>("[data-release-deck]");
        if (deck) out.deckY = docTop(deck);
        for (const band of root.querySelectorAll<HTMLElement>("[data-a2-beat]")) {
          out["beat:" + band.getAttribute("data-a2-beat")] = docTop(band);
          out["beatH:" + band.getAttribute("data-a2-beat")] = band.offsetHeight;
        }
        for (const sel of ['section[data-act="1"] h1', 'section[data-act="2"] h2', 'section[data-act="2b"] h2', 'section[data-act="3"] h2', 'section[data-act="4"] h2']) {
          const el = root.querySelector<HTMLElement>(sel);
          if (el) out["plane:" + sel] = docTop(el);
        }
        const exampleGuide = root.querySelector<HTMLElement>('[data-a2-guide="example"]');
        const finalGuide = root.querySelector<HTMLElement>('[data-a2-guide="final"]');
        if (exampleGuide) out.exampleGuideTop = docTop(exampleGuide);
        if (finalGuide) out.finalGuideTop = docTop(finalGuide);
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
        colX = natural.colX ?? wsX;
        dropXm = natural.portX ?? weX;
        railX = natural.railX ?? colX;
        portOffsetY = (natural.portY ?? (stageTopDoc + laneOffset)) - stageTopDoc;
        frameBottomOffset = (natural.frameBottom ?? (stageTopDoc + laneOffset)) - stageTopDoc;
        /* the bay's exit stub spans the measured distance from the frame's
           bottom to the stage's end, so it MEETS the act-4 jog in every
           language instead of guessing with a viewport fraction */
        root.style.setProperty("--bay-exit-h", `${Math.max(8, Math.round(inner.offsetHeight - frameBottomOffset + 2))}px`);
        beatBands = {};
        for (const name of ["probleme", "perimetre", "moteur", "jugement", "resultat"] as const) {
          const y = natural["beat:" + name];
          if (y !== undefined) beatBands[name] = { y, h: natural["beatH:" + name] ?? 80 };
        }
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
        /* Long translations need enough scroll distance to remain locomotion,
           not a fast zip. Filipino at 360px leaves only 20px naturally; keep
           at least 5% of the stable narrative unit before the pin begins. */
        const naturalSolutionY = A.solution.y - narrativeVh * 0.5;
        const minApproach = narrativeVh * 0.05;
        /* the scene must OWN its dialogue stop: the perimetre window has to
           open inside the solution scene, so the scene starts no later than
           that window does */
        let solutionCap = naturalSolutionY;
        const periB = beatBands.perimetre;
        if (periB) {
          const wL = window.innerWidth < 640 ? Math.max(narrativeVh * 0.48, 640) : narrativeVh * 0.48;
          const periW0 = periB.y + periB.h * 0.55 - narrativeVh * 0.10 - wL;
          solutionCap = Math.min(naturalSolutionY, periW0 - narrativeVh * 0.04);
        }
        ySolution = Math.max(yProblem + 1, Math.min(solutionCap, pinStart - minApproach));
        /* WHAT and PROBLEM already have their own complete visual evidence.
           A2 enters only as SOLUTION approaches, through the reserved carry
           column, and is fully present before that heading reaches the
           ownership zone. The entrance is scroll-driven, never timed. */
        yCarryStart = Math.max(yAppear, yProblem - narrativeVh * 0.28);
        const minJunctionRunway = narrativeVh * 0.05;
        yApproachEnd = Math.max(ySolution + 1, pinStart - minJunctionRunway);
        /* THE CHOREOGRAPHY MAP inside the pin. Each moment owns real scroll
           so no single gesture can swallow the whole handoff: stations tour,
           arrival pause + port opens, plate descends the drop, port closes +
           ignition, A2's return walk and bay descent. Fractions of the pin
           span; the span itself was widened in the layout so each moment
           survives one normal gesture. */
        const pinSpan = Math.max(1, pinEnd - pinStart);
        handoffStart = pinStart + pinSpan * 0.38; /* plate leaves the datum */
        handoffEnd = pinStart + pinSpan * 0.60;   /* plate inside the port */
        yExample = A.example.y - narrativeVh * 0.78;
        exampleSceneY = (natural.exampleGuideTop ?? A.example.y) - narrativeVh * 0.42;
        finalSceneY = (natural.finalGuideTop ?? root.offsetHeight + blockTop) - narrativeVh * 0.72;
        /* the release moment is derived FROM the deck: A2 finishes his walk
           exactly where the free post will be painted, so the role change
           happens at zero displacement - never a teleport under a fade */
        deckY = natural.deckY ?? A.result.y + narrativeVh * 0.4;
        /* the release must come AFTER the resultat plateau plus the walk
           itself; the deck's layout reserve makes the coincidence term the
           normal winner, so the flip stays a zero-displacement role change */
        const resB = beatBands.resultat;
        const resPlateauEnd = resB ? resB.y + resB.h * 0.55 - narrativeVh * 0.14 : yExample + narrativeVh * 0.3;
        releaseY = Math.max(yExample + narrativeVh * 0.5, resPlateauEnd + narrativeVh * 0.34);
        /* the launcher takes its fixed corner only once the released being
           has scrolled fully out of view: the role change moves nothing in
           front of the reader - never a jump, never a fade over distance */
        freeFixY = releaseY + narrativeVh * 0.85;
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
      pageMaxY = Math.max(0, document.documentElement.scrollHeight - narrativeVh);
      measureDockHome();
      buildLegs();
      buildLane();
      lastY = -1; /* force a recompute on the next frame */
    };

    const setDockMode = (next: DockMode) => {
      if (!dock || dockMode === next) return;
      dockMode = next;
      if (exitTimer) { window.clearTimeout(exitTimer); exitTimer = 0; }
      root.setAttribute("data-v7-escort", next === "escort" ? "on" : "off");
      if (next === "escort") {
        dock.removeAttribute("data-a2-free");
        dock.setAttribute("data-v7-escorting", "on");
        dock.style.transition = "none";
        dock.style.opacity = "1";
      } else {
        /* One existing transition moves the SAME being between roles. At
           release it fades at the result, becomes a fixed clickable guide,
           then returns alone: the artifact continues without a clone. */
        dock.style.transition = "opacity 140ms linear";
        dock.style.opacity = "0";
        exitTimer = window.setTimeout(() => {
          exitTimer = 0;
          dock.style.transition = "none";
          dock.style.transform = "translate3d(0,0,0)";
          dock.removeAttribute("data-v7-escorting");
          dock.removeAttribute("data-a2-gait");
          dock.style.removeProperty("--a2-travel-y");
          if (next === "free") dock.setAttribute("data-a2-free", "on");
          else dock.removeAttribute("data-a2-free");
          requestAnimationFrame(() => {
            dock.style.transition = "opacity 180ms linear";
            dock.style.opacity = "1";
          });
        }, 160);
      }
    };

    let raf = 0, lastY = -1;
    /* THE LEG TABLE. A2's whole journey is a sequence of straight painted
       legs and standing plateaus, each owning a scroll interval. Positions
       are DOCUMENT points for the normal-flow acts and STAGE points inside
       the pinned act (evaluated against the live sticky offset), so one
       pure function of scroll yields the same route in both directions.
       Corners are traced as quarter-arcs at the joints, never cut. */
    type Leg = {
      y0: number; y1: number;               /* scroll interval */
      space: "doc" | "stage";
      x0: number; py0: number; x1: number; py1: number; /* path endpoints */
      plateau?: boolean;                     /* standing beside a dialogue */
    };
    let legs: Leg[] = [];
    let legArc: number[] = [];               /* cumulative arc length before leg i */
    /* ONE source of truth for every dialogue window: computed with the legs
       so a window can never open before its plateau exists */
    let beatWindows: Partial<Record<BeatName | "moteur", [number, number]>> = {};
    const buildLegs = () => {
      legs = [];
      legArc = [];
      if (!A || !dockHomeDoc) return;
      const u = narrativeVh;
      const homeX = dockHomeDoc.x + 60, homeY = dockHomeDoc.y + 35;
      const cx = colX - 16;                  /* body left of the line, plate on it */
      const laneStageY = laneOffset;         /* datum, stage-relative */
      const S = Math.max(1, pinEnd - pinStart);
      const p = (f: number) => pinStart + S * f;
      const push = (y0: number, y1: number, space: Leg["space"], x0: number, py0: number, x1: number, py1: number, plateau?: boolean) => {
        if (y1 <= y0) return;
        legs.push({ y0, y1, space, x0, py0, x1, py1, plateau });
      };
      /* plateau window beside an in-flow band: while the band crosses the
         comfortable reading zone, A2 stands at its side. A plateau must
         outlast one whole normal gesture (wheel ~360px, phone swipe
         ~600px), and can never begin before the leg that DELIVERS him -
         language-dependent layouts shift both, so the floor is explicit. */
      beatWindows = {};
      const L = window.innerWidth < 640 ? Math.max(u * 0.48, 640) : u * 0.48;
      const bandStop = (name: BeatName, fallbackY: number, notBefore?: number) => {
        const b = beatBands[name];
        const centerDoc = b ? b.y + b.h * 0.55 : fallbackY;
        let w1 = centerDoc - u * 0.10;
        let w0 = w1 - L;
        if (notBefore !== undefined && w0 < notBefore) { const shift = notBefore - w0; w0 += shift; w1 += shift; }
        beatWindows[name] = [w0 + u * 0.02, w1 - u * 0.03];
        return { w0, w1, py: centerDoc - 3 };
      };
      const sProb = bandStop("probleme", A.problem.y);
      const sPeri = bandStop("perimetre", A.solution.y, sProb.w1 + u * 0.06);
      /* hero: along the deck to the column, then down the column with two
         plateaus, arriving on the datum exactly when the stage pins */
      const joinEnd = yCarryStart + u * 0.20;
      push(yCarryStart, joinEnd, "doc", homeX, homeY, cx, homeY);
      push(joinEnd, sProb.w0, "doc", cx, homeY, cx, sProb.py);
      push(sProb.w0, sProb.w1, "doc", cx, sProb.py, cx, sProb.py, true);
      push(sProb.w1, sPeri.w0, "doc", cx, sProb.py, cx, sPeri.py);
      push(sPeri.w0, sPeri.w1, "doc", cx, sPeri.py, cx, sPeri.py, true);
      /* approach the elbow: the descent ends ON the datum at the column x.
         Pre-pin the stage rests at its natural top, so the datum has one
         document position until the pin takes over. */
      const datumDocY = stageTopDoc + laneOffset;
      push(sPeri.w1, pinStart, "doc", cx, sPeri.py, cx, datumDocY);
      /* the pinned choreography (stage space) */
      push(p(0), p(0.30), "stage", cx, laneStageY, dropXm, laneStageY);          /* station tour with the plate */
      push(p(0.30), p(0.70), "stage", dropXm, laneStageY, dropXm, laneStageY, true); /* supervises the entry */
      push(p(0.70), p(0.88), "stage", dropXm, laneStageY, railX, laneStageY);    /* return walk on the datum */
      /* he holds at the datum through the port's close and the ignition,
         watching the machine light - then rides the service bay down in
         DOCUMENT space at slope one: the stage is parked after the pin, so
         he descends beside the dashboard exactly as fast as it scrolls,
         never leaving the reader's view. Works identically on the phone's
         taller-than-viewport frame. */
      push(p(0.88), p(1), "stage", railX, laneStageY, railX, laneStageY, true);
      /* the moteur window gets the same one-gesture floor, clamped inside
         the standing hold so it always folds before the return walk */
      beatWindows.moteur = [
        pinStart + S * 0.31,
        Math.min(pinStart + S * 0.68, Math.max(pinStart + S * 0.62, pinStart + S * 0.31 + L)),
      ];
      const bayTopDoc = stageBottomDoc + laneOffset;
      const bayBotDoc = stageBottomDoc + frameBottomOffset + 16;
      const bayEnd = pinEnd + Math.max(1, bayBotDoc - bayTopDoc);
      push(pinEnd, bayEnd, "doc", railX, bayTopDoc, railX, bayBotDoc);
      const jogEnd = bayEnd + Math.max(1, Math.abs(railX - cx)) * 1.2;
      push(bayEnd, jogEnd, "doc", railX, bayBotDoc, cx, bayBotDoc);
      /* language-dependent layouts move both the bands and the bay's
         length: the stops are floored AFTER the legs that deliver him */
      const jugFallback = pinEnd + u * 0.9;
      const sJug = bandStop("jugement", jugFallback, jogEnd + u * 0.06);
      const sRes = bandStop("resultat", yExample + u * 0.15, sJug.w1 + u * 0.06);
      /* a shifted resultat stop pushes the release with it */
      releaseY = Math.max(releaseY, sRes.w1 + u * 0.30);
      freeFixY = releaseY + u * 0.85;
      push(jogEnd, sJug.w0, "doc", cx, bayBotDoc, cx, sJug.py);
      push(sJug.w0, sJug.w1, "doc", cx, sJug.py, cx, sJug.py, true);
      push(sJug.w1, sRes.w0, "doc", cx, sJug.py, cx, sRes.py);
      push(sRes.w0, sRes.w1, "doc", cx, sRes.py, cx, sRes.py, true);
      /* the release: down the column to the painted deck, then along the
         deck to the exact point where the free post is painted - the role
         change happens standing still, never as a jump */
      const rampTurn = Math.max(sRes.w1 + 1, releaseY - u * 0.28);
      const freeX = window.innerWidth - 36;
      push(sRes.w1, rampTurn, "doc", cx, sRes.py, cx, deckY - 3);
      push(rampTurn, releaseY, "doc", cx, deckY - 3, freeX, deckY - 3);
      /* released: he stands at the deck's end and leaves the frame with the
         page; the corner post takes over only once he is out of view */
      push(releaseY, freeFixY, "doc", freeX, deckY - 3, freeX, deckY - 3, true);
      /* arc prefix for distance-true gait */
      let acc = 0;
      legArc = legs.map((L) => { const a = acc; acc += Math.hypot(L.x1 - L.x0, L.py1 - L.py0); return a; });
    };
    /* WHERE A2 IS at a given scroll: evaluate the leg table. Also reports
       the distance walked so the gait is tied to ground actually covered. */
    const a2At = (y: number) => {
      const sx = window.scrollX;
      const itv = y < pinStart ? stageTopDoc - y : y <= pinEnd ? stickyTop : stageBottomDoc - y;
      const carryOpacity = clamp01((y - yCarryStart) / Math.max(1, narrativeVh * 0.08));
      if (!A || !legs.length) return { vx: 0, vy: vh * 0.5, so: 0, arc: 0, moving: false };
      let L = legs[0];
      if (y <= L.y0) {
        const px = L.space === "stage" ? L.x0 - sx : L.x0 - sx;
        const py = L.space === "stage" ? itv + L.py0 : L.py0 - y;
        return { vx: px, vy: py, so: carryOpacity, arc: 0, moving: false };
      }
      for (let i = 0; i < legs.length; i++) {
        L = legs[i];
        if (y <= L.y1 || i === legs.length - 1) {
          const t = clamp01((y - L.y0) / Math.max(1, L.y1 - L.y0));
          const x = lerp(L.x0, L.x1, t);
          const py = lerp(L.py0, L.py1, t);
          const arc = legArc[i] + Math.hypot(L.x1 - L.x0, L.py1 - L.py0) * t;
          const vy = L.space === "stage" ? itv + py : py - y;
          return { vx: x - sx, vy, so: carryOpacity, arc, moving: !L.plateau && t < 1 };
        }
      }
      return { vx: 0, vy: vh * 0.5, so: 0, arc: 0, moving: false };
    };
    /* the projector's narrative input (safety net): the desired viewport
       height of the composition on the doc legs */
    const desire = (y: number) => {
      const a = a2At(y);
      return { vx: a.vx, vy: a.vy, so: a.so };
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

    /* THE ROUTE. A2 evaluates his leg table; the plate rides at his side
       until the drop, then descends the painted drop ALONE - a straight
       vertical on the drop's own x, entering the visible port. It never
       crosses a readable line: the drop column is reserved by the layout.
       The projector (safety net) still guards the document-space legs. */
    const routeAt = (y: number) => {
      const sx = window.scrollX;
      const a = a2At(y);
      /* the reserved bands make the lane equal the narrative byte-for-byte;
         the projector only ever differs if a layout regression appears */
      const a2Y = y < pinStart ? laneAt(y) : a.vy;
      const itv = y < pinStart ? stageTopDoc - y : y <= pinEnd ? stickyTop : stageBottomDoc - y;
      const S = Math.max(1, pinEnd - pinStart);
      const pinP = clamp01((y - pinStart) / S);
      /* choreography phases (all pure functions of scroll) */
      const gate = Math.min(clamp01((pinP - 0.30) / 0.08), 1 - clamp01((pinP - 0.60) / 0.06));
      const plateP = clamp01((y - handoffStart) / Math.max(1, handoffEnd - handoffStart));
      const entry = clamp01((pinP - 0.60) / 0.12);
      /* the plate: joined to A2 before the drop, then its own vertical */
      let plate: { x: number; y: number; opacity: number };
      if (y < handoffStart) {
        /* vertical travel: the plate rides CENTRED on the line, A2 walks
           at its left. On the datum the pair keeps the proven side-carry. */
        const vertical = y < pinStart;
        plate = vertical
          ? { x: a.vx - 10, y: a2Y + 6, opacity: a.so }
          : { x: a.vx + 16, y: a2Y, opacity: a.so };
      } else {
        const py = lerp(laneOffset, portOffsetY - 8, plateP);
        /* it disappears INSIDE the port mouth, never in open air */
        const inPort = clamp01((plateP - 0.86) / 0.14);
        plate = { x: dropXm - sx - 26, y: itv + py - 17, opacity: a.so * (1 - inPort) };
      }
      return {
        handoff: plateP,
        gate,
        entry,
        pinP,
        escortOpacity: a.so,
        arc: a.arc,
        movingLeg: a.moving,
        artifact: plate,
        a2: { x: a.vx, y: a2Y },
      };
    };
    /* which dialogue window is open at this scroll: the ONE window table
       built with the legs - a window exists strictly inside its plateau,
       so it always folds before A2 walks again */
    const beatAt = (y: number): string => {
      for (const name of ["probleme", "perimetre", "moteur", "jugement", "resultat"] as const) {
        const w = beatWindows[name];
        if (w && y >= w[0] && y <= w[1]) return name;
      }
      return "";
    };

    /* ONE semantic snapshot drives the character, conductor and core. It is
       pure: the same scroll position always yields the same scene and the
       same machine state, forward or backward. */
    const snapshotAt = (y: number): MotionSnapshot => {
      const between = (from: number, to: number) => clamp01((y - from) / Math.max(1, to - from));
      let scene: MotionScene = "hero";
      let sceneP = between(blockTop, yCarryStart);
      if (y >= yCarryStart && y < ySolution) { scene = "problem"; sceneP = between(yCarryStart, ySolution); }
      else if (y >= ySolution && y < yApproachEnd) { scene = "solution"; sceneP = between(ySolution, yApproachEnd); }
      else if (y >= yApproachEnd && y <= pinEnd) { scene = "run"; sceneP = between(yApproachEnd, pinEnd); }
      else if (y > pinEnd && y < yExample) { scene = "review"; sceneP = between(pinEnd, yExample); }
      else if (y >= yExample && y < exampleSceneY) { scene = "outcome"; sceneP = between(yExample, exampleSceneY); }
      else if (y >= exampleSceneY && y < finalSceneY) { scene = "example"; sceneP = between(exampleSceneY, finalSceneY); }
      else if (y >= finalSceneY) { scene = "final"; sceneP = 1; }
      const engineVisualEnd = yApproachEnd + (pinEnd - yApproachEnd) * 0.45;
      const engineP = between(ySolution, Math.max(ySolution + 1, engineVisualEnd));
      const release = between(yExample, releaseY);
      return {
        scene,
        sceneP,
        engineP,
        release,
        power: {
          intake: between(blockTop, yCarryStart),
          problem: between(yCarryStart, ySolution),
          engine: between(ySolution, yApproachEnd),
          run: between(yApproachEnd, Math.max(yApproachEnd + 1, pinEnd)),
          release,
          /* a pulse sampled from scroll distance, never wall-clock time */
          beat: 0.42 + Math.abs(Math.sin(y / 42)) * 0.58,
        },
      };
    };

    const frame = () => {
      raf = 0;
      const y = window.scrollY;
      if (y === lastY) return;
      lastY = y;
      if (!A) return; /* disarmed loudly; guards catch data-v7-engine */
      const g = clamp01((y - blockTop) / blockHeight);
      const snapshot = snapshotAt(y);
      root.style.setProperty("--g", g.toFixed(4));
      /* far-fabric parallax: written by THIS same frame on the same rAF -
         depth without a second clock, compositor-only (transform) */
      root.style.setProperty("--par", (-(y * 0.05)).toFixed(1) + "px");
      const centre = y + vh * 0.5;
      for (const b of actBoxes) {
        if (b.h > 0 && centre >= b.top && centre < b.top + b.h) { anchor = { id: b.id, f: (y - b.top) / b.h }; break; }
      }
      /* the station tour owns the FIRST stretch of the pin; the rest of the
         pin belongs to the entry choreography, so the walk completes before
         the plate ever leaves the datum */
      const pinP0 = pinEnd > pinStart ? clamp01((y - pinStart) / (pinEnd - pinStart)) : 0;
      const walk = clamp01(pinP0 / 0.3);
      root.style.setProperty("--walk", walk.toFixed(4));
      /* the whole choreography's clock: module groups read it directly */
      root.style.setProperty("--run", pinP0.toFixed(4));
      root.style.setProperty("--seal", clamp01((y - pinEnd) / (narrativeVh * 0.4)).toFixed(4));
      root.style.setProperty("--scene-p", snapshot.sceneP.toFixed(4));
      root.style.setProperty("--engine-p", snapshot.engineP.toFixed(4));
      root.style.setProperty("--release", snapshot.release.toFixed(4));
      root.style.setProperty("--power-intake", snapshot.power.intake.toFixed(4));
      root.style.setProperty("--power-problem", snapshot.power.problem.toFixed(4));
      root.style.setProperty("--power-engine", snapshot.power.engine.toFixed(4));
      root.style.setProperty("--power-run", snapshot.power.run.toFixed(4));
      root.style.setProperty("--power-release", snapshot.power.release.toFixed(4));
      root.style.setProperty("--power-beat", snapshot.power.beat.toFixed(4));
      if (root.getAttribute("data-v7-scene") !== snapshot.scene) root.setAttribute("data-v7-scene", snapshot.scene);

      /* WHERE THE PAIR IS. The lane already answered this question for every
         scroll position, from the real layout: it is clear of headline type,
         station lines, the request field, the gauntlet chips, the sealed
         card and the launcher, it is smooth, and it is the same in both
         reading directions. Nothing here has to dodge anything. */
      const route = routeAt(y);
      const vx = route.a2.x;
      const vy = route.a2.y;
      const so = route.artifact.opacity;
      const storyActive = route.escortOpacity > 0.01 && y >= yCarryStart && y < freeFixY;
      const freeActive = y >= freeFixY;

      root.style.setProperty("--handoff", route.handoff.toFixed(4));
      root.style.setProperty("--gate", route.gate.toFixed(4));
      root.style.setProperty("--entry", route.entry.toFixed(4));
      if (root.getAttribute("data-v7-handed-off") !== (route.handoff >= 1 ? "on" : "off")) {
        root.setAttribute("data-v7-handed-off", route.handoff >= 1 ? "on" : "off");
      }
      /* the one attached dialogue window: opens when A2 arrives at a step,
         folds before he walks again - all from the same scroll authority */
      const beat = beatAt(y);
      if (root.getAttribute("data-v7-beat") !== beat) root.setAttribute("data-v7-beat", beat);
      /* end-of-page stop: on phones the conclusion opens only here, where
         the footer's reserve keeps the corner column clear by construction.
         The page can grow after the last measure (the machine settles its
         own height), so the boundary is re-read ONCE when the reader first
         enters the end zone - never per frame. */
      if (!endZoneChecked && y > pageMaxY - vh * 1.5) {
        endZoneChecked = true;
        pageMaxY = Math.max(pageMaxY, document.documentElement.scrollHeight - narrativeVh);
      } else if (endZoneChecked && y < pageMaxY - vh * 2.5) {
        endZoneChecked = false;
      }
      const end = y >= pageMaxY - 24 ? "on" : "off";
      if (root.getAttribute("data-v7-end") !== end) root.setAttribute("data-v7-end", end);
      slip.style.transform = `translate3d(${route.artifact.x.toFixed(1)}px, ${route.artifact.y.toFixed(1)}px, 0)`;
      slip.style.opacity = so.toFixed(3);

      /* the artifact's machined states: request while carried, locked from
         the arrival pause (the scope freezes as the port opens). The checked
         story belongs to the delivered result surface, not to this plate. */
      const artState = route.pinP < 0.3 ? "request" : "locked";
      if (slip.getAttribute("data-v7-artifact") !== artState) {
        slip.setAttribute("data-v7-artifact", artState);
        slip.setAttribute("aria-label", artCopyRef.current[artState]);
      }

      if (dock && dockHomeDoc) {
        setDockMode(freeActive ? "free" : storyActive ? "escort" : "home");
        if (dock.getAttribute("data-a2-scene") !== snapshot.scene) dock.setAttribute("data-a2-scene", snapshot.scene);
        if (storyActive) {
          /* A2's walk is driven by the SAME scroll authority as the route.
             Four integer compositor positions form a quiet step cycle; when
             scroll stops, the being stops. Reverse scroll plays it backward.
             Scene attributes change only at narrative boundaries and let the
             existing sprite player spend one short reaction there. */
          /* legs tied to ground actually covered: the gait phase advances
             with the route's own arc length, so A2 can never walk in place
             and never glides with frozen feet */
          const phase = route.movingLeg ? Math.abs(Math.floor(route.arc / 28)) % 4 : 0;
          dock.setAttribute("data-a2-gait", String(phase));
          /* The route already moves the whole being continuously. A second
             body bob made that continuous motion read as scroll jitter on
             phones, so locomotion now lives in the feet only. */
          dock.style.setProperty("--a2-travel-y", "0px");
          /* integer-pixel escort, trailing beside the slip, never covering.
             The being keeps its painted 64px and the SAME clearances the
             R2.2 lane was proven against (left edge vx-54, feet vy+36);
             the home is document-space now, so the current scroll is
             subtracted to land the same viewport target. */
          const sx = window.scrollX;
          const tx = Math.round(vx - 60 - (dockHomeDoc.x - sx));
          const ty = Math.round(vy - 35 - (dockHomeDoc.y - y));
          dock.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
          dock.style.opacity = "1";
        } else if (freeActive) {
          dock.removeAttribute("data-a2-gait");
          dock.style.removeProperty("--a2-travel-y");
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
        dock.removeAttribute("data-a2-free");
        dock.removeAttribute("data-a2-scene");
        dock.removeAttribute("data-a2-gait");
      }
      slip.style.opacity = "0";
      /* the armed marker must not survive a flip to reduced motion */
      root.removeAttribute("data-v7-engine");
      root.removeAttribute("data-v7-escort");
      root.removeAttribute("data-v7-scene");
      root.removeAttribute("data-v7-beat");
    };
  }, [reduced]);

  const mono = "font-mono text-[11px] uppercase tracking-[0.16em]";

  return (
    <div ref={rootRef} data-v7-acts="" className="relative overflow-x-clip bg-[#08090B] text-[#F7F6F3]">
      {/* while the being escorts the slip, its launcher hail stays silent -
          the affordance belongs to the resting dock, not to the story.
          P8.1: during the story the being doubles (integer scale, feet
          planted, anatomy untouched) and the launcher chrome steps back so
          only the character carries. The artifact plate switches its three
          machined states by attribute. */}
      <style>{`
        [data-a2-dock][data-v7-escorting="on"] > span[data-a2-whisper="guide"],
        [data-a2-dock][data-v7-escorting="on"] > span[data-a2-whisper="ask"] { display: none; }
        /* the being now rests at 64px natively (integer 2x sprite), so the
           escort no longer rescales it: the PAINTED escort is byte-identical
           to the R2.2-proven geometry - same 64px being, same clearances. */
        [data-a2-dock][data-v7-escorting="on"] [data-a2-being] { transform: translate3d(0, var(--a2-travel-y, 0px), 0) scale(1); transform-origin: 50% 100%; }
        [data-a2-dock][data-v7-escorting="on"] [data-a2-part] { transform-box: fill-box; transform-origin: 50% 100%; }
        [data-a2-dock][data-v7-escorting="on"][data-a2-gait="1"] [data-a2-part="front-foot"] { transform: translate(1px, -1px); }
        [data-a2-dock][data-v7-escorting="on"][data-a2-gait="3"] [data-a2-part="back-foot"] { transform: translate(-1px, -1px); }
        [data-a2-dock][data-v7-escorting="on"] button { background: transparent; border-color: transparent; box-shadow: none; overflow: visible; }
        @media (prefers-reduced-motion: reduce) {
          [data-a2-dock][data-v7-escorting="on"] [data-a2-part] { transform: none !important; }
        }
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
          [data-v7-acts] { animation: v7pulse 5.2s linear infinite; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-v7-acts] { animation: none; --energy-p: 0.52; --heart-p: 0.28; --frame-p: 0.12; --packet-o: 0.72; }
          [data-await-sweep] { transform: rotate(0.12turn); }
          [data-energy-packet] { opacity: 0.72; transform: none !important; }
        }
        @property --energy-p { syntax: "<number>"; inherits: true; initial-value: 0; }
        @property --heart-p { syntax: "<number>"; inherits: true; initial-value: 0; }
        @property --frame-p { syntax: "<number>"; inherits: true; initial-value: 0.08; }
        @property --packet-o { syntax: "<number>"; inherits: true; initial-value: 0.18; }
        /* One inherited phase becomes one travelling current. Each physical
           segment owns a short overlapping window of that phase, so energy
           reaches the core in order instead of every pipe flashing at once. */
        [data-flow-step] {
          --packet-p: clamp(0, calc((var(--energy-p) - var(--flow-start)) * var(--flow-scale)), 1);
          --packet-enter: clamp(0, calc((var(--energy-p) - var(--flow-start)) * 80), 1);
          --packet-leave: clamp(0, calc((var(--flow-end) - var(--energy-p)) * 80), 1);
          --packet-visible: min(var(--packet-enter), var(--packet-leave));
        }
        [data-flow-step="origin"] { --flow-start: 0; --flow-end: 0.12; --flow-scale: 8.333; }
        [data-flow-step="burden"] { --flow-start: 0.10; --flow-end: 0.22; --flow-scale: 8.333; }
        [data-flow-step="handoff"] { --flow-start: 0.20; --flow-end: 0.32; --flow-scale: 8.333; }
        [data-flow-step="approach"] { --flow-start: 0.30; --flow-end: 0.44; --flow-scale: 7.143; }
        [data-flow-step="curve"] { --flow-start: 0.42; --flow-end: 0.58; --flow-scale: 6.25; }
        [data-flow-step="intake"] { --flow-start: 0.56; --flow-end: 0.70; --flow-scale: 7.143; }
        [data-flow-step="output"] { --flow-start: 0.68; --flow-end: 0.84; --flow-scale: 6.25; }
        [data-flow-step="release"] { --flow-start: 0.82; --flow-end: 1; --flow-scale: 5.556; }
        /* One continuous vein. Scroll owns which sections are energized;
           ONE inherited ambient phase moves through every visible vessel.
           The accepted dashboard stays untouched inside: energy reaches it
           through ports and grid gaps, never through a line over its copy. */
        [data-main-vein] {
          --vein-size: clamp(2px, 0.28vw, 3px);
          border: 1px solid rgba(111, 76, 41, 0.82);
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(18, 12, 7, 0.98), rgba(65, 42, 20, 0.92));
          box-shadow: inset 0 0 0 1px rgba(255, 210, 142, 0.08), 0 0 8px rgba(216, 117, 38, 0.18);
          opacity: 1 !important;
        }
        [data-main-vein][data-vein-axis="y"] { width: var(--vein-size) !important; }
        [data-main-vein][data-vein-axis="x"] { height: var(--vein-size) !important; }
        [data-main-vein]::before,
        [data-main-vein]::after {
          content: "";
          position: absolute;
          z-index: 1;
          pointer-events: none;
          background: rgba(201, 167, 106, 0.42);
        }
        [data-main-vein][data-vein-axis="x"]::before { inset: 1px 4px auto; height: 1px; }
        [data-main-vein][data-vein-axis="x"]::after { inset: auto 4px 1px; height: 1px; }
        [data-main-vein][data-vein-axis="y"]::before { inset: 4px auto 4px 1px; width: 1px; }
        [data-main-vein][data-vein-axis="y"]::after { inset: 4px 1px 4px auto; width: 1px; }
        :is([data-heart-feed], [data-heart-drop], [data-heart-output-desktop], [data-heart-output-mobile], [data-result-feed]) {
          border-color: rgba(216, 117, 38, 0.8);
          box-shadow: inset 0 0 0 1px rgba(255, 210, 142, 0.16), 0 0 14px rgba(216, 117, 38, 0.3);
        }
        [data-heart-drop] { z-index: 2; }
        [data-main-vein] > [data-vein-channel] {
          position: absolute;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(216,117,38,0.58), #F0A14A, rgba(201,167,106,0.62));
          box-shadow: 0 0 7px rgba(216,117,38,0.34);
        }
        /* the current needs a REAL body: a two-pixel channel with a bright
           head reads in normal video where a hairline vanished */
        [data-main-vein][data-vein-axis="x"] > [data-vein-channel] {
          inset: auto 0 !important;
          top: calc(50% - 1px) !important;
          height: 2px !important;
        }
        [data-main-vein][data-vein-axis="y"] > [data-vein-channel] {
          inset: 0 auto !important;
          left: calc(50% - 1px) !important;
          width: 2px !important;
        }
        [data-energy-packet] {
          position: absolute;
          z-index: 3;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent 0%, #F0A14A 22%, #FFD28E 42%, rgba(216,117,38,0.52) 56%, #F0A14A 72%, transparent 100%);
          box-shadow: 0 0 10px rgba(216,117,38,0.58), 0 0 18px rgba(216,117,38,0.22);
          opacity: calc(var(--packet-o) * var(--packet-visible, 1));
          will-change: transform, opacity;
        }
        [data-main-vein][data-vein-axis="x"] > [data-energy-packet] {
          inset-block: 0;
          left: 0;
          width: 22%;
          transform: translate3d(calc(var(--packet-p, var(--energy-p)) * 355%), 0, 0);
        }
        [data-main-vein][data-vein-axis="y"] > [data-energy-packet] {
          inset-inline: 0;
          top: 0;
          height: 18%;
          background: linear-gradient(180deg, transparent 0%, #F0A14A 22%, #FFD28E 42%, rgba(216,117,38,0.52) 56%, #F0A14A 72%, transparent 100%);
          transform: translate3d(0, calc(var(--packet-p, var(--energy-p)) * 455%), 0);
        }
        [data-await-sweep] { transform: rotate(calc(var(--energy-p) * 1turn)); }
        [data-engine-vein-lane] { isolation: isolate; }
        [data-engine-vein-bed] {
          fill: none;
          stroke: rgba(72, 48, 24, 0.92);
          stroke-width: 7;
          stroke-linecap: round;
          vector-effect: non-scaling-stroke;
        }
        [data-engine-vein] {
          fill: none;
          stroke: #D87526;
          stroke-width: 3;
          stroke-linecap: round;
          vector-effect: non-scaling-stroke;
          opacity: 0.82;
        }
        [data-engine-vein-energy] {
          fill: none;
          stroke: #FFD28E;
          stroke-width: 3;
          stroke-linecap: round;
          stroke-dasharray: 8 92;
          stroke-dashoffset: calc(var(--packet-p, var(--energy-p)) * -100);
          vector-effect: non-scaling-stroke;
          opacity: calc(0.4 + var(--heart-p) * 0.6);
        }
        [data-engine-escort-rail], [data-engine-escort-branch] {
          border-color: rgba(216, 117, 38, 0.92);
          box-shadow: inset 0 0 0 1px rgba(255, 210, 142, 0.14), 0 0 12px rgba(216, 117, 38, 0.28);
        }
        /* THE RECEIVER'S CHOREOGRAPHY, all from scroll: lids slide open on
           --gate, the inner glow answers the plate (--handoff) and the
           entry wash (--entry), then the lids close behind it. The port is
           ALWAYS drawn - a closed door is a visible state, not absence. */
        [data-artifact-receiver] { box-shadow: 0 0 calc(5px + var(--gate, 0) * 10px + var(--entry, 0) * 6px) rgba(216, 117, 38, calc(0.35 + var(--gate, 0) * 0.3)); }
        [data-artifact-receiver] [data-port-glow=""] { opacity: calc(0.14 + var(--gate, 0) * 0.36 + var(--handoff, 0) * 0.3 + var(--entry, 0) * 0.2); }
        [data-artifact-receiver] [data-port-lid="left"] { transform: translateX(calc(var(--gate, 0) * -8px)); }
        [data-artifact-receiver] [data-port-lid="right"] { transform: translateX(calc(var(--gate, 0) * 8px)); }
        /* the entry wash: the instant the port closes, the intake chain
           visibly carries the received energy to the heart - scroll-owned,
           reversible, layered over the ambient current */
        [data-v7-acts] { --entry-glow: calc(var(--entry, 0) * 0.85); }
        :is([data-engine-header-feed], [data-mobile-vein-link], [data-mobile-heart-bridge], [data-heart-neck]) > [data-vein-channel] {
          box-shadow: 0 0 calc(7px + var(--entry-glow, 0) * 9px) rgba(240, 161, 74, calc(0.34 + var(--entry-glow, 0) * 0.5));
        }
        [data-engine-vein-energy] { opacity: calc(0.4 + var(--heart-p) * 0.4 + var(--entry-glow, 0) * 0.5); }
        /* THE ATTACHED DIALOGUE WINDOWS: folded (scaled shut) until the
           scroll authority opens exactly one; the fold happens before A2
           walks again because each window lives strictly inside a plateau */
        [data-a2-dialog] {
          opacity: 0;
          visibility: hidden;
          transform: scale(0.94) translateY(4px);
          transform-origin: 100% 100%;
          transition: opacity 160ms linear, transform 160ms ease-out, visibility 0s linear 160ms;
        }
        [data-v7-beat="probleme"] [data-a2-dialog="probleme"],
        [data-v7-beat="perimetre"] [data-a2-dialog="perimetre"],
        [data-v7-beat="moteur"] [data-a2-dialog="moteur"],
        [data-v7-beat="jugement"] [data-a2-dialog="jugement"],
        [data-v7-beat="resultat"] [data-a2-dialog="resultat"] {
          opacity: 1;
          visibility: visible;
          transform: none;
          transition: opacity 160ms linear, transform 160ms ease-out, visibility 0s;
        }
        [data-power-fill] {
          opacity: calc(0.48 + var(--power-beat, 0.5) * 0.52);
          will-change: transform, opacity;
        }
        /* The accepted three-zone coordination dashboard. One capability is
           active at a time; completed modules keep a low amber memory. */
        [data-engine-module] {
          --ep: var(--run, 1);
          --pre: clamp(0, calc((var(--ep) - var(--m, 0)) * 9), 1);
          --post: clamp(0, calc(((var(--m, 0) + 0.2) - var(--ep)) * 9), 1);
          --active: min(var(--pre), var(--post));
          --done: clamp(0, calc((var(--ep) - (var(--m, 0) + 0.1)) * 8), 1);
          opacity: calc(0.55 + 0.45 * max(var(--active), var(--done)));
          border-color: color-mix(in srgb, #262B35, #D87526 calc(var(--active) * 100%));
          /* activation must survive normal video: the whole card takes a
             warm lift, then keeps a lower amber memory once passed */
          background: color-mix(in srgb, #12151B, #46331B calc(max(var(--active), var(--done) * 0.4) * 100%));
          transform: translateX(calc((1 - var(--active)) * 2px));
        }
        [data-engine-module] > p:first-child > span {
          background: color-mix(in srgb, #1A150D, #D87526 calc(var(--active) * 100%));
          box-shadow: 0 0 calc(10px * var(--active)) rgba(216,117,38,0.65);
        }
        /* The accepted dashboard stays geometrically fixed. A separate
           overlay gives its perimeter one very slow breath while the actual
           double beat remains inside the central ENDVERA core. */
        [data-engine-frame-pulse] {
          opacity: var(--frame-p);
          box-shadow: inset 0 0 9px rgba(216,117,38,0.18), 0 0 12px rgba(216,117,38,0.1);
        }
        /* THE LIVING HEART. The double beat must survive normal video: the
           masses tighten one pixel, the seam flares wide, the aura breathes
           and the interior itself takes one warm breath of light. All from
           the ONE inherited ambient phase - no second clock. */
        [data-core-heart] {
          isolation: isolate;
          background: color-mix(in srgb, #0C0F14, #2E2413 calc(var(--heart-p) * 100%));
        }
        [data-heart-shell] { transition: none; }
        [data-heart-shell="left"] { transform: translateX(calc(var(--heart-p) * -1px)); }
        [data-heart-shell="right"] { transform: translateX(calc(var(--heart-p) * 1px)); }
        [data-heart-shell] { opacity: calc(1 - var(--heart-p) * 0.38); }
        [data-heart-aura] {
          opacity: calc(0.4 + var(--heart-p) * 0.6);
          border-color: color-mix(in srgb, #4A3A26, #FFD28E calc(var(--heart-p) * 92%));
          box-shadow: inset 0 0 calc(8px + var(--heart-p) * 34px) rgba(240,161,74,calc(0.07 + var(--heart-p) * 0.4)), 0 0 calc(6px + var(--heart-p) * 22px) rgba(216,117,38,calc(var(--heart-p) * 0.4));
        }
        [data-heart-seam] {
          opacity: calc(0.48 + var(--heart-p) * 0.52);
          background: linear-gradient(180deg, rgba(111,76,41,calc(0.2 + var(--heart-p) * 0.8)), #FFD28E, rgba(111,76,41,calc(0.2 + var(--heart-p) * 0.8)));
          box-shadow: 0 0 calc(4px + var(--heart-p) * 20px) calc(var(--heart-p) * 5px) rgba(255,210,142,calc(0.2 + var(--heart-p) * 0.6));
        }
        [data-heart-node] {
          opacity: calc(0.62 + var(--heart-p) * 0.38);
          transform: translateX(-50%) rotate(45deg) scale(calc(0.84 + var(--heart-p) * 0.28));
          box-shadow: 0 0 calc(4px + var(--heart-p) * 13px) rgba(240,161,74,calc(0.28 + var(--heart-p) * 0.48));
        }
        [data-heart-inlet] {
          border-color: color-mix(in srgb, #6F4C29, #FFD28E calc(var(--heart-p) * 78%));
          box-shadow: inset 0 0 calc(3px + var(--heart-p) * 7px) rgba(240,161,74,0.66), 0 0 calc(4px + var(--heart-p) * 9px) rgba(216,117,38,0.35);
        }
        [data-engine-evidence] { opacity: calc(0.25 + 0.75 * var(--engine-p, 1)); }
        [data-engine-verification] { opacity: calc(0.45 + 0.55 * var(--release, 1)); }
        [data-engine-result] {
          opacity: calc(0.28 + 0.72 * var(--release, 1));
          transform: translateX(calc((1 - var(--release, 1)) * -5px));
        }
        @media (prefers-reduced-motion: reduce) {
          [data-engine-module], [data-engine-verification], [data-engine-result], [data-power-fill], [data-heart-shell] {
            opacity: 1;
            transform: none !important;
          }
          [data-engine-vein-energy] { stroke-dashoffset: -92; opacity: 0.78; }
          [data-heart-aura], [data-heart-seam], [data-heart-inlet], [data-heart-node] { opacity: 0.72; }
          [data-heart-node] { transform: translateX(-50%) rotate(45deg); }
          [data-engine-frame-pulse] { opacity: 0.12; }
          /* the complete static composition: the heart lit but still, the
             receiver drawn, and every dialogue window open and readable */
          [data-core-heart] { background: color-mix(in srgb, #0C0F14, #2E2413 40%); }
          [data-artifact-receiver] [data-port-glow=""] { opacity: 0.42; }
          [data-a2-dialog] { opacity: 1; visibility: visible; transform: none; transition: none; }
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
        /* the double beat holds its peaks long enough for a 30fps video to
           keep several bright frames: rise, first beat held, short dip,
           second beat held, decay - roughly 1.1s of the 5.2s cycle */
        @keyframes v7pulse {
          0% { --energy-p: 0; --heart-p: 0; --frame-p: 0.08; --packet-o: 0.35; }
          34% { --energy-p: 0.34; --heart-p: 0; --frame-p: 0.12; --packet-o: 0.9; }
          56% { --energy-p: 0.56; --heart-p: 0; --frame-p: 0.16; --packet-o: 1; }
          60% { --energy-p: 0.6; --heart-p: 0.15; --frame-p: 0.2; --packet-o: 1; }
          63% { --energy-p: 0.63; --heart-p: 1; --frame-p: 0.24; --packet-o: 1; }
          66% { --energy-p: 0.66; --heart-p: 0.92; --frame-p: 0.24; --packet-o: 1; }
          68% { --energy-p: 0.68; --heart-p: 0.3; --frame-p: 0.2; --packet-o: 0.98; }
          71% { --energy-p: 0.71; --heart-p: 0.95; --frame-p: 0.22; --packet-o: 0.96; }
          74% { --energy-p: 0.74; --heart-p: 0.85; --frame-p: 0.22; --packet-o: 0.94; }
          80% { --energy-p: 0.8; --heart-p: 0; --frame-p: 0.14; --packet-o: 0.88; }
          92% { --energy-p: 0.92; --heart-p: 0; --frame-p: 0.1; --packet-o: 0.64; }
          100% { --energy-p: 1; --heart-p: 0; --frame-p: 0.08; --packet-o: 0.35; }
        }
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
            {/* phones reserve the whisper's room INSIDE the post row, so the
                arrival hail can open above the being without touching the
                statement that precedes it */}
            <div data-a2-post="" className="relative mt-[calc(var(--v7vh,100vh)*0.02)] flex w-full max-w-[560px] items-end justify-end pr-2 pt-[60px] sm:mt-7 sm:pt-0">
              {/* the deck A2 walks from his post to the column: a REGISTERED
                  conductor, so the route's first leg rides painted ground */}
              <span aria-hidden data-a2-rail="" className="absolute bottom-0 left-1 right-1 h-px bg-gradient-to-r from-transparent via-[#C9A76A]/40 to-transparent" />
              {/* the deck continues past the box and fades - the one quiet
                  counterweight the desktop's right wing carries (C's 15%:
                  a subordinate line, never a subject) */}
              <span aria-hidden data-a2-rail="" className="absolute bottom-0 left-full hidden h-px w-[44vw] max-w-[500px] bg-gradient-to-r from-[#C9A76A]/25 to-transparent sm:block" />
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
        <span aria-hidden data-rail="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="origin" data-conductor-segment="intake" className="absolute bottom-0 left-[calc(1.5rem+(100%-3rem)*0.87)] h-[calc(var(--v7vh,100vh)*0.05)] w-px origin-top -translate-x-1/2 overflow-hidden bg-[#C9A76A]/15">
          <i data-power-fill="" data-vein-channel="" className="absolute inset-0 origin-top bg-gradient-to-b from-[#D87526] to-[#C9A76A]/45 shadow-[0_0_8px_rgba(216,117,38,0.5)]" style={{ transform: "scaleY(var(--power-intake, 0))" }} />
          <i data-energy-packet="" />
        </span>
      </section>

      {/* ── ACT 2 — the gauntlet, child-simple, bounded grid ─────────── */}
      <section data-act="2" data-v7-sem="problem" className="relative mx-auto flex min-h-[calc(var(--v7vh,100vh)*1.26)] w-full max-w-[1180px] flex-col px-6 pt-[calc(var(--v7vh,100vh)*0.13)] sm:block sm:min-h-0 sm:py-[5vh]">
        {/* the execution datum, drawn: the same derived x as the anchors
            (87% of the padded content box) - this hairline IS the reserved
            escort column made visible, continuing the console's out-rail */}
        <span aria-hidden data-lane-line="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="burden" data-conductor-segment="problem" className="pointer-events-none absolute inset-y-0 left-[calc(1.5rem+(100%-3rem)*0.87)] w-px -translate-x-1/2 overflow-hidden bg-[#C9A76A]/15">
          <i data-power-fill="" data-vein-channel="" className="absolute inset-0 origin-top bg-gradient-to-b from-[#D87526]/20 via-[#D87526] to-[#C9A76A]/25 shadow-[0_0_8px_rgba(216,117,38,0.45)]" style={{ transform: "scaleY(var(--power-problem, 0))" }} />
          <i data-energy-packet="" />
        </span>
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
          {/* the reserved band where A2 pauses and his window opens: real
              layout space, so the dialogue can never cover the fragments */}
          <A2Dialogue beat="probleme" label={copy.engine.supervisor} line={concierge.guide.problem} />
          {reduced && <StaticArtifact state="request" className="mt-4" />}
        </div>
      </section>

      {/* ── SOLUTION — Endvera takes the request ───────────────────── */}
      <section data-act="2b" data-v7-sem="solution" className="relative mx-auto flex min-h-[calc(var(--v7vh,100vh)*0.95)] w-full max-w-[1180px] flex-col px-6 pt-[calc(var(--v7vh,100vh)*0.12)] sm:min-h-0 sm:justify-start sm:py-[5vh]">
        {/* the datum continues through the handover act */}
        <span aria-hidden data-lane-line="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="handoff" data-conductor-segment="engine" className="pointer-events-none absolute inset-y-0 left-[calc(1.5rem+(100%-3rem)*0.87)] w-px -translate-x-1/2 overflow-hidden bg-[#C9A76A]/15">
          <i data-power-fill="" data-vein-channel="" className="absolute inset-0 origin-top bg-gradient-to-b from-[#D87526]/20 via-[#D87526] to-[#C9A76A]/25 shadow-[0_0_8px_rgba(216,117,38,0.45)]" style={{ transform: "scaleY(var(--power-engine, 0))" }} />
          <i data-energy-packet="" />
        </span>
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
          <div data-engine-handoff="" className="relative mt-[calc(var(--v7vh,100vh)*0.045)] max-w-[calc(87%-72px)] overflow-hidden rounded-[10px] border border-[#3A3020] bg-[linear-gradient(180deg,#17150F,#0E1116)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.5)] sm:mt-0 sm:max-w-none sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`${mono} text-[#D7B879]`}>{copy.artifact.request}</p>
                <p className="mt-2 max-w-[30ch] text-[14px] leading-[1.5] text-[#C8CDD5]">{copy.engine.handoff}</p>
              </div>
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-[#D87526]">01 · {copy.artifact.locked}</span>
            </div>
            <div aria-hidden className="relative mt-5 flex items-center gap-3">
              <span className="grid h-8 w-12 place-items-center rounded-[4px] border border-[#6F4C29] bg-[#15110B] font-mono text-[9px] text-[#C9A76A]">IN</span>
              <span data-main-vein="" data-vein-vessel="" data-vein-axis="x" data-flow-step="handoff" className="relative h-px flex-1 overflow-hidden bg-[#3A3020]">
                <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-r from-[#D87526] via-[#F0A14A] to-[#C9A76A]" />
                <i data-energy-packet="" />
              </span>
              <span data-port="" className="relative h-9 w-9 rounded-[5px] border border-[#6F4C29] bg-[#0D1015] shadow-[inset_0_0_0_3px_#171A20]">
                <i className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-[#D87526]" />
              </span>
              <span data-heart-feed="" data-main-vein="" data-vein-vessel="" data-vein-axis="x" data-flow-step="approach" className="absolute left-full top-1/2 h-px w-[90px] -translate-y-1/2 overflow-hidden sm:w-16">
                <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-r from-[#D87526] via-[#F0A14A] to-[#C9A76A]" />
                <i data-energy-packet="" />
              </span>
            </div>
            <p className="mt-3 border-t border-[#292E38] pt-2 font-mono text-[9px] uppercase tracking-[0.11em] text-[#8C7A58]">→ {copy.engine.title}</p>
            <span aria-hidden className="absolute bottom-0 left-4 right-0 h-px bg-gradient-to-r from-[#D87526] via-[#C9A76A]/60 to-transparent" />
          </div>
          <div aria-hidden className="relative mt-[calc(var(--v7vh,100vh)*0.02)] h-[10px] sm:col-span-2 sm:mt-4">
            <span data-v7-anchor="solution" className="absolute left-[87%] top-[6px] h-px w-px" />
            {reduced && <StaticArtifact state="request" className="absolute left-[38%] top-0" />}
          </div>
          <div className="sm:col-span-2">
            <A2Dialogue beat="perimetre" label={copy.engine.supervisor} line={concierge.guide.solution} />
          </div>
        </div>
      </section>

      {/* ── ACT 3 — the walk (sticky, continuous) ────────────────────── */}
      {/* The datum lane comes FIRST inside the sticky: the escort arrives
          from above through chip decor only, and while the section is
          pinned the pair rides a stable corridor that no headline or
          station text ever enters. */}
      {/* the act owns enough scroll that the station tour, the arrival
          pause, the plate's descent, the port closing and A2's bay descent
          each survive at least one whole normal gesture */}
      <section data-act="3" data-v7-sem="how" className={reduced ? "relative" : "relative h-[calc(var(--v7vh,100vh)*3.1)] sm:h-[230vh]"}>
        {/* the HOW plateau: its heading stays with its own stations for the
            whole act, exactly like the other mobile plateaus */}
        <div data-v7-stage="" className={reduced ? "" : "sticky top-0 flex min-h-[calc(var(--v7vh,100vh)*0.88)] flex-col justify-center sm:min-h-screen"}>
          <div className={`relative mx-auto w-full max-w-[1180px] px-6 ${reduced ? "py-[6vh]" : "flex min-h-[calc(var(--v7vh,100vh)*0.88)] flex-col justify-center gap-[calc(var(--v7vh,100vh)*0.025)] pb-[4vh] pt-[4vh] sm:min-h-screen sm:gap-[3.5vh] sm:pb-[6vh] sm:pt-[6vh]"}`}>
            <h2 className="max-w-[14ch] text-[clamp(1.15rem,3vw,2.1rem)] font-semibold leading-[1.2] tracking-[-0.03em] sm:max-w-[72%]">
              <AccentLine text={copy.act3.h} accent={copy.act3.accent} />
            </h2>
            <A2Dialogue beat="moteur" align="drop" label={copy.engine.supervisor} line={concierge.guide.run} />
            <div data-v7-lane="" className="relative h-[76px] sm:h-[44px]">
              <div className="absolute inset-x-0 top-[22px] h-px bg-gradient-to-r from-transparent via-[#6F4C29]/45 to-transparent">
                <span
                  aria-hidden
                  data-v7-trail=""
                  data-main-vein=""
                  data-vein-vessel=""
                  data-vein-axis="x"
                  data-flow-step="approach"
                  data-conductor-segment="run"
                  className="absolute inset-0 origin-left bg-gradient-to-r from-transparent via-[#D87526] to-[#D87526]/25 opacity-80 shadow-[0_0_10px_rgba(216,117,38,0.42)] will-change-transform"
                >
                  <i data-power-fill="" data-vein-channel="" className="absolute inset-0 origin-left bg-[#F0A14A] shadow-[0_0_12px_rgba(216,117,38,0.65)]" style={reduced ? undefined : { transform: "scaleX(var(--walk, 0))" }} />
                  <i data-energy-packet="" />
                </span>
                <span data-v7-anchor="walk-start" className="absolute right-[10%] top-0 h-px w-px" />
                <span data-v7-anchor="walk-end" className="absolute right-[13%] top-0 h-px w-px sm:left-1/2 sm:right-auto" />
              </div>
              <span aria-hidden data-heart-drop="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="approach" className="pointer-events-none absolute right-[13%] top-[22px] z-[1] h-[calc(100%-22px+var(--v7vh,100vh)*0.045)] overflow-hidden sm:left-1/2 sm:right-auto sm:h-[calc(100%-22px+6vh)] sm:-translate-x-1/2">
                <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-b from-[#D87526] via-[#F0A14A] to-[#C9A76A]" />
                <i data-energy-packet="" />
              </span>
              {/* the incoming conductor: the 87% column arrives ON the datum
                  from above, overflowing the stage top so it visually joins
                  the act-2b line across the section seam - and the painted
                  elbow at the joint takes the turn as a curve */}
              <span aria-hidden data-vein-inbound="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="curve" className="pointer-events-none absolute bottom-[calc(100%-22px)] right-[13%] z-0 h-[calc(var(--v7vh,100vh)*1.2)] w-px translate-x-1/2 overflow-hidden bg-[#C9A76A]/15">
                <i data-power-fill="" data-vein-channel="" className="absolute inset-0 origin-top bg-gradient-to-b from-[#D87526]/30 via-[#D87526] to-[#C9A76A]/30 shadow-[0_0_8px_rgba(216,117,38,0.45)]" style={{ transform: "scaleY(var(--power-engine, 0))" }} />
                <i data-energy-packet="" />
              </span>
              {/* desktop only: on phones the column and the drop share one x
                  and the line simply continues straight through the datum */}
              <span aria-hidden data-vein-elbow="" className="pointer-events-none absolute right-[13%] top-[23px] z-[2] hidden h-[14px] w-[14px] -translate-y-full rounded-br-[12px] border-b-2 border-r-2 border-[#D87526]/85 shadow-[2px_2px_8px_rgba(216,117,38,0.25)] sm:block" />
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
            {/* RESTORED 8a4d66c DASHBOARD. The accepted three-zone heart is
                the visual authority. The living vein is grafted only into
                reserved gaps and ports; it never crosses readable content. */}
            <div data-living-engine="" data-heart-beat="" className="relative w-full rounded-[12px] border border-[#2A303B] bg-[linear-gradient(150deg,#15181E,#0A0C10_72%)] p-2.5 shadow-[0_24px_70px_rgba(0,0,0,0.58)] sm:p-4">
              <span aria-hidden data-engine-frame-pulse="" className="pointer-events-none absolute inset-0 z-[5] rounded-[11px] border border-[#D87526]/45" />
              {/* A2's service bay approach: the painted rail he rides from
                  the datum down through the frame's own gate notch into the
                  interior bay (desktop; on phones he follows the drop) */}
              <span aria-hidden data-bay-approach="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="output" className="pointer-events-none absolute right-[53px] top-[calc(-3.5vh-22px)] z-[1] hidden h-[calc(3.5vh+22px+128px)] w-px overflow-hidden sm:block">
                <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-b from-[#C9A76A]/60 via-[#D87526]/70 to-[#C9A76A]/50" />
                <i data-energy-packet="" />
              </span>
              <span aria-hidden data-bay-gate="" className="pointer-events-none absolute right-[47px] top-[-4px] z-[6] hidden h-[7px] w-[13px] rounded-[2px] border border-[#6F4C29] bg-[#15110A] sm:block" />
              {/* the bay's exit: A2 leaves the machine by its bottom edge and
                  the jog in act 4 returns him to the column */}
              <span aria-hidden data-bay-exit="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="output" className="pointer-events-none absolute bottom-[calc(0px-var(--bay-exit-h,6vh))] right-[53px] z-[1] hidden h-[var(--bay-exit-h,6vh)] w-px overflow-hidden sm:block">
                <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-b from-[#D87526]/70 to-[#C9A76A]/70" />
                <i data-energy-packet="" />
              </span>
              <div data-engine-intake-zone="" className="relative -mx-2.5 sm:-mx-4">
                <span aria-hidden data-engine-header-feed="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="curve" className="absolute -top-2.5 bottom-8 left-[87%] z-[2] -translate-x-1/2 overflow-hidden sm:-top-4 sm:left-1/2">
                  <i data-vein-channel="" />
                  <i data-energy-packet="" />
                </span>
                {/* THE REQUEST RECEIVER: a machined port on the frame's top
                    edge. Its two lids are CLOSED at rest, open as the plate
                    arrives (--gate), swallow it, and close behind it - all
                    commanded by scroll, reversible, drawn before the plate
                    ever moves so the reader sees a closed door first. */}
                <span aria-hidden data-engine-feed-joint="" data-artifact-receiver="" className="absolute -top-[13px] left-[87%] z-[6] h-[14px] w-[26px] -translate-x-1/2 rounded-[3px] border border-[#6F4C29] bg-[#15110A] shadow-[0_0_9px_rgba(216,117,38,0.4)] sm:-top-[19px] sm:left-1/2">
                  <i data-port-glow="" className="absolute inset-[2px] rounded-[2px] bg-gradient-to-b from-[#FFD28E]/80 to-[#D87526]/60" />
                  <i data-port-lid="left" className="absolute inset-y-[2px] left-[2px] w-[10px] rounded-l-[2px] border-r border-[#3A3020] bg-[#1B1610]" />
                  <i data-port-lid="right" className="absolute inset-y-[2px] right-[2px] w-[10px] rounded-r-[2px] border-l border-[#3A3020] bg-[#1B1610]" />
                </span>
                <div className="relative mx-2.5 flex min-h-[72px] items-start justify-between gap-3 border-b border-[#252A33] pb-2.5 pr-[72px] sm:mx-4 sm:min-h-0 sm:items-center sm:pr-0">
                  <p className={`${mono} max-w-[22ch] text-[#C9A76A]`}>{copy.engine.title}</p>
                  <span className="hidden shrink-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#7F8793] sm:mr-[52px] sm:flex"><i aria-hidden className="h-1.5 w-1.5 rounded-[2px] bg-[#D87526] shadow-[0_0_10px_rgba(216,117,38,0.7)]" />live</span>
                </div>
                <div data-engine-vein-lane="" aria-hidden className="relative h-8">
                  <svg className="absolute inset-0 h-full w-full sm:hidden" viewBox="0 0 100 28" preserveAspectRatio="none">
                    <path data-engine-vein-bed="" d="M87 0 C87 14 58 11 36 28" />
                    <path data-engine-vein="" d="M87 0 C87 14 58 11 36 28" />
                    <path data-engine-vein-energy="" data-flow-step="curve" pathLength="100" d="M87 0 C87 14 58 11 36 28" />
                  </svg>
                  {/* The first mobile column has a fixed 86px supervisor rail
                      plus a 10px gap. This link closes the width-dependent
                      distance from the curve to that column's true centre. */}
                  <span
                    aria-hidden
                    data-mobile-vein-link=""
                    data-main-vein=""
                    data-vein-vessel=""
                    data-vein-axis="x"
                    data-flow-step="intake"
                    className="absolute bottom-0 z-[6] -translate-y-1/2 overflow-hidden sm:hidden"
                    style={{ left: "calc((100% - 96px) / 2)", right: "64%" }}
                  >
                    <i data-vein-channel="" />
                    <i data-energy-packet="" />
                  </span>
                  <svg className="absolute inset-0 hidden h-full w-full sm:block" viewBox="0 0 100 28" preserveAspectRatio="none">
                    <path data-engine-vein-bed="" d="M50 0 C50 8 50 18 50 28" />
                    <path data-engine-vein="" d="M50 0 C50 8 50 18 50 28" />
                    <path data-engine-vein-energy="" data-flow-step="curve" pathLength="100" d="M50 0 C50 8 50 18 50 28" />
                  </svg>
                </div>
              </div>
              <div data-coordination-heart="" className="relative grid grid-cols-[minmax(0,1fr)_86px] gap-2.5 sm:grid-cols-[0.8fr_1.5fr_0.8fr] sm:items-stretch sm:px-[88px]">
                <span aria-hidden data-engine-escort-junction="" className="pointer-events-none absolute left-[87%] top-0 z-[7] h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-[#F0A14A] bg-[#17110A] shadow-[0_0_9px_rgba(216,117,38,0.68)] sm:left-auto sm:right-[33px]" />
                <span aria-hidden data-engine-escort-branch="" data-main-vein="" data-vein-vessel="" data-vein-axis="x" data-flow-step="intake" className="pointer-events-none absolute left-1/2 right-[37px] top-0 z-[2] hidden -translate-y-1/2 overflow-hidden sm:block">
                  <i data-vein-channel="" />
                  <i data-energy-packet="" />
                </span>
                <span aria-hidden data-engine-escort-rail="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="intake" className="pointer-events-none absolute bottom-0 left-[87%] top-0 z-[2] -translate-x-1/2 overflow-hidden sm:left-auto sm:right-[37px]">
                  <i data-vein-channel="" />
                  <i data-energy-packet="" />
                </span>
                <div data-engine-boundary="" className="relative col-start-1 row-start-1 overflow-visible rounded-[7px] border border-[#3B3324] bg-[#14130F] p-3 sm:col-auto sm:row-auto">
                  {/* Mobile keeps the truthful boundary-first reading order.
                      A reserved centre vessel continues behind its opaque lock
                      plates, across the grid gap and into the core port. */}
                  <span aria-hidden data-mobile-heart-bridge="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="intake" className="absolute -bottom-[21px] -top-[11px] left-1/2 z-0 -translate-x-1/2 overflow-hidden sm:hidden">
                    <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-b from-[#D87526] via-[#FFD28E] to-[#F0A14A]" />
                    <i data-energy-packet="" />
                  </span>
                  <p className="relative z-[1] inline-block bg-[#14130F] pr-2 font-mono text-[10.5px] uppercase tracking-[0.13em] text-[#8C7A58]">{copy.engine.boundary}</p>
                  <div className="relative z-[1] mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-1">
                    {copy.engine.boundaryItems.map((item) => <p key={item} className="min-w-0 rounded-[4px] border border-[#403622] px-2 py-2 text-[12px] leading-[1.35] text-[#C7AE78] sm:text-[10px]">{item}</p>)}
                  </div>
                </div>
                <div data-engine-core="" className="relative col-start-1 row-start-2 overflow-visible rounded-[9px] border border-[#3A4150] bg-[#0B0E13] p-3 pt-4 sm:col-auto sm:row-auto">
                  <span aria-hidden data-heart-intake="" data-heart-inlet="" data-flow-step="intake" className="absolute left-1/2 top-[-10px] z-[4] h-[18px] w-[18px] -translate-x-1/2 overflow-hidden rounded-[4px] border border-[#D87526] bg-[#17110A]">
                    <i data-vein-channel="" className="absolute inset-x-[7px] inset-y-[2px] bg-gradient-to-b from-[#FFD28E] via-[#F0A14A] to-[#D87526]" />
                    <i data-energy-packet="" className="absolute inset-x-[5px] top-[2px] h-[6px] rounded-full bg-[#FFD28E]" />
                  </span>
                  <span aria-hidden data-heart-neck="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="intake" className="absolute left-1/2 top-[8px] z-[3] h-2 -translate-x-1/2 overflow-hidden">
                    <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-b from-[#FFD28E] to-[#F0A14A]" />
                    <i data-energy-packet="" />
                  </span>
                  <div data-core-heart="" className="relative z-[2] grid min-h-[104px] place-items-center overflow-hidden rounded-[7px] border border-[#6F4C29] bg-[#0C0F14] px-2 py-3 text-center sm:min-h-[96px]">
                    <span aria-hidden data-heart-shell="left" className="pointer-events-none absolute inset-y-0 left-0 z-0 w-[49.5%] bg-[linear-gradient(145deg,#20242D,#11151B_78%)]" />
                    <span aria-hidden data-heart-shell="right" className="pointer-events-none absolute inset-y-0 right-0 z-0 w-[49.5%] bg-[linear-gradient(215deg,#1D2129,#0E1117_78%)]" />
                    <span aria-hidden data-heart-seam="" className="pointer-events-none absolute inset-y-2 left-1/2 z-[1] w-[3px] -translate-x-1/2 bg-gradient-to-b from-[#6F4C29]/20 via-[#FFD28E] to-[#6F4C29]/20" />
                    <span aria-hidden data-heart-aura="" className="pointer-events-none absolute inset-0 z-[1] rounded-[6px] border border-[#6F4C29]/60" />
                    <span aria-hidden data-heart-node="" className="pointer-events-none absolute left-1/2 top-[11px] z-[4] h-[9px] w-[9px] border border-[#F0A14A] bg-[#17110A]" />
                    <div className="relative z-[3] w-[88%] rounded-[5px] border border-[#292E38] bg-[#101319]/95 px-3 py-2">
                      <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-[#8C7A58]">{copy.engine.route}</p>
                      <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[#E2C486]">{copy.engine.core}</p>
                      <p className="mt-1 text-[12px] leading-[1.4] text-[#AAB1BC]">{copy.engine.coreSub}</p>
                    </div>
                  </div>
                  <div data-engine-modules="" className="relative z-[2] mt-2 grid grid-cols-2 gap-1.5">
                    {/* the mandate's grouped activations: models+software+
                        browser light during the station tour, approved
                        systems + human judgment during the plate's entry -
                        two perceptible stops, never one indistinct sweep */}
                    {copy.act3.stations.map((s, i) => i === 5 ? null : (
                      <div
                        key={s.name}
                        data-engine-module=""
                        className={`min-w-0 rounded-[5px] border border-[#262B35] bg-[#12151B] px-2.5 py-2 ${i === 4 ? "col-span-2" : ""}`}
                        style={{ "--m": [0.05, 0.12, 0.19, 0.46, 0.56][i]?.toFixed(2) ?? "0.5" } as React.CSSProperties}
                      >
                        <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#C8CDD5] sm:text-[10px]">
                          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-[2px] border border-[#6F4C29] bg-[#1A150D]" />
                          {s.name}
                        </p>
                        <p className="mt-0.5 break-words text-[12px] leading-[1.35] text-[#929AA6] sm:text-[11px]">{s.truth}</p>
                      </div>
                    ))}
                  </div>
                  <p data-evidence-ledger="" data-engine-evidence="" className="relative z-[2] mt-2 border-t border-[#292E38] pt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#A98B58]">← {copy.engine.evidence}</p>
                  <span aria-hidden data-heart-output-mobile="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="output" className="absolute -bottom-[12px] left-1/2 z-[3] h-3 -translate-x-1/2 overflow-hidden sm:hidden">
                    <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-b from-[#FFD28E] to-[#C9A76A]" />
                    <i data-energy-packet="" />
                  </span>
                  <span aria-hidden data-heart-output-desktop="" data-main-vein="" data-vein-vessel="" data-vein-axis="x" data-flow-step="output" className="absolute -right-[12px] top-1/2 z-[3] hidden w-3 -translate-y-1/2 overflow-hidden sm:block">
                    <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-r from-[#FFD28E] to-[#C9A76A]" />
                    <i data-energy-packet="" />
                  </span>
                </div>
                <div className="relative col-start-1 row-start-3 grid gap-0 sm:col-auto sm:row-auto">
                  <div data-engine-verification="" className="relative rounded-[7px] border border-[#6F4C29] bg-[#15110B] p-3">
                    <span aria-hidden data-verification-inlet="" className="absolute left-1/2 top-[-6px] z-[3] h-[11px] w-[11px] -translate-x-1/2 rotate-45 border border-[#D87526] bg-[#17110A] shadow-[0_0_8px_rgba(216,117,38,0.45)] sm:left-[-6px] sm:top-1/2 sm:-translate-y-1/2" />
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#C9A76A]">{copy.act3.stations[5].name}</p>
                    <p className="mt-1 text-[12px] leading-[1.4] text-[#A6ADB8] sm:text-[11px]">{copy.engine.verification}</p>
                    <span aria-hidden className="mt-2 block h-[2px] origin-left bg-[#1E7F5C]" style={{ transform: "scaleX(var(--release, 0))" }} />
                  </div>
                  <span aria-hidden data-result-feed="" data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="output" className="relative mx-auto h-3 overflow-hidden">
                    <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-b from-[#C9A76A] to-[#1E7F5C]" />
                    <i data-energy-packet="" />
                  </span>
                  <div data-engine-result="" className="relative overflow-visible rounded-[7px] border border-[#C9A76A] bg-[#F3F0E8] p-3 text-[#17191D]">
                    <span aria-hidden data-result-inlet="" className="absolute left-1/2 top-[-6px] z-[3] h-[11px] w-[11px] -translate-x-1/2 rotate-45 border border-[#C9A76A] bg-[#17110A]" />
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] overflow-hidden rounded-l-[6px] bg-[#C9A76A]" />
                    <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#6B5D3F]">ENDVERA · RESULT</p>
                    <p className="mt-1.5 text-[13px] font-semibold">✓ {copy.engine.result}</p>
                  </div>
                </div>
              </div>
              <span aria-hidden data-main-vein="" data-vein-vessel="" data-vein-axis="x" data-flow-step="output" className="absolute bottom-0 left-0 right-0 overflow-hidden bg-[#372C1B]">
                <i data-power-fill="" data-vein-channel="" className="block h-full origin-left bg-gradient-to-r from-[#D87526] via-[#FFD28E] to-[#1E7F5C] shadow-[0_0_12px_rgba(216,117,38,0.55)]" style={{ transform: "scaleX(var(--power-run, 0))" }} />
                <i data-energy-packet="" />
              </span>
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
      {/* the bottom reserve holds the release deck far enough below the
          resultat plateau that A2's walk to his post owns real scroll */}
      <section data-act="4" data-v7-sem="example-intro" className="relative mx-auto flex min-h-[calc(var(--v7vh,100vh)*1.5)] w-full max-w-[1180px] flex-col px-6 pb-[calc(var(--v7vh,100vh)*0.24)] pt-[calc(var(--v7vh,100vh)*0.02)] sm:min-h-[118vh] sm:pb-[24vh] sm:pt-6">
        {/* the release conductor: origin at the engine's exit jog above,
            destination the example port below - never a floating end */}
        <span aria-hidden data-main-vein="" data-vein-vessel="" data-vein-axis="y" data-flow-step="release" data-conductor-segment="release" className="pointer-events-none absolute bottom-[calc(var(--v7vh,100vh)*0.06)] left-[calc(1.5rem+(100%-3rem)*0.87)] top-[calc(var(--v7vh,100vh)*-0.045)] w-px -translate-x-1/2 overflow-hidden bg-[#C9A76A]/15 sm:top-0">
          <i data-power-fill="" data-vein-channel="" className="absolute inset-0 origin-top bg-gradient-to-b from-[#D87526] via-[#C9A76A] to-[#1E7F5C] shadow-[0_0_9px_rgba(216,117,38,0.5)]" style={{ transform: "scaleY(var(--power-release, 0))" }} />
          <i data-energy-packet="" />
        </span>
        {/* the engine's exit: A2's bay leaves the frame bottom and jogs
            back onto the 87% column through two painted elbows */}
        <span aria-hidden data-vein-jog="" data-main-vein="" data-vein-vessel="" data-vein-axis="x" data-flow-step="release" className="pointer-events-none absolute left-[calc(1.5rem+(100%-3rem)*0.87)] right-[77px] top-0 hidden h-px -translate-y-1/2 overflow-hidden sm:block">
          <i data-vein-channel="" className="absolute inset-0 bg-gradient-to-r from-[#C9A76A]/70 to-[#D87526]/70" />
          <i data-energy-packet="" />
        </span>
        <span aria-hidden data-vein-jog-elbow="" className="pointer-events-none absolute right-[70px] top-[1px] hidden h-[12px] w-[12px] -translate-y-full rounded-br-[10px] border-b-2 border-r-2 border-[#D87526]/75 sm:block" />
        <span aria-hidden data-vein-jog-elbow="" className="pointer-events-none absolute left-[calc(1.5rem+(100%-3rem)*0.87)] top-0 hidden h-[12px] w-[12px] -translate-x-1/2 rounded-tl-[10px] border-l-2 border-t-2 border-[#D87526]/75 sm:block" />
        {/* the example port: the released story's destination */}
        <span aria-hidden data-example-port="" className="pointer-events-none absolute bottom-[calc(var(--v7vh,100vh)*0.06-5px)] left-[calc(1.5rem+(100%-3rem)*0.87)] h-[10px] w-[18px] -translate-x-1/2 rounded-[2px] border border-[#6F4C29] bg-[#15110A] shadow-[0_0_8px_rgba(216,117,38,0.3)]" />
        {/* the release deck: the hairline A2 walks from the column to his
            free post at the corner - origin the example port, destination
            the post, role the supervisor's way home */}
        <span aria-hidden data-release-deck="" data-a2-rail="" className="pointer-events-none absolute bottom-[calc(var(--v7vh,100vh)*0.06)] left-[calc(1.5rem+(100%-3rem)*0.87)] right-[calc((100%-100vw)/2+16px)] h-px bg-gradient-to-r from-[#C9A76A]/50 via-[#C9A76A]/25 to-[#C9A76A]/10" />
        {/* SCENE 5 — the review moment */}
        <h2 data-review-heading="" className="relative z-10 -mx-3 w-[calc(87%-68px)] rounded-[8px] bg-[#0B0D12] px-3 py-2 text-[clamp(1.4rem,3vw,2.1rem)] font-semibold leading-[1.18] tracking-[-0.03em] shadow-[0_10px_28px_rgba(8,9,11,0.5)] sm:m-0 sm:w-auto sm:max-w-[26ch] sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none">
          <span className="block max-w-[14ch] sm:max-w-none">
            <AccentLine text={copy.review.h} accent={copy.review.accent} />
          </span>
        </h2>
        <div className="mt-[14vh] sm:mt-[12vh]">
          <A2Dialogue beat="jugement" label={copy.engine.supervisor} line={concierge.guide.review} />
        </div>
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
              className="relative min-h-[220px] w-full max-w-[calc(87%-80px)] rounded-md border-2 bg-[#F7F6F3] p-4 text-[#14161A] sm:max-w-none sm:p-5"
              style={reduced ? undefined : { opacity: "calc(0.15 + 0.85 * var(--seal, 1))" }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b5d3f]">{copy.sealed.seal}</p>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {copy.sealed.chips.map((c, i) => (
                  <p key={c} className="flex items-center gap-1.5 text-[12px] font-semibold leading-[1.3] sm:text-[13px] sm:leading-[1.35]">
                    <span aria-hidden className={i === 1 ? "text-[#166049]" : "text-[#6b5d3f]"}>{i === 1 ? "✓" : "·"}</span>
                    {c}
                  </p>
                ))}
              </div>
              {/* The approved result records one operating standard. This is
                  a first-run deliverable, not a claim that recurring runs are
                  already live. It uses the existing release scroll authority. */}
              <div data-engine-standard="" className="mt-3 border-t border-[#C9A76A]/35 pt-3 sm:mt-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#766645] sm:text-[10px]">
                  {copy.engine.standardStatus}
                </p>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  {copy.engine.continuity.map((stage, i) => (
                    <p key={stage} className="min-w-0 border-l border-[#B9985E] py-0.5 pl-2 text-[12px] font-semibold leading-[1.3] text-[#282A2F] sm:py-0 sm:pl-1.5 sm:text-[11px]">
                      <span className="mr-1.5 font-mono text-[10px] text-[#846C43]">0{i + 1}</span>{stage}
                    </p>
                  ))}
                </div>
                <span aria-hidden className="mt-2.5 block h-px overflow-hidden bg-[#C9A76A]/25">
                  <i
                    data-power-fill=""
                    className="block h-px origin-left bg-gradient-to-r from-[#D87526] via-[#C9A76A] to-[#1E7F5C]"
                    style={reduced ? undefined : { transform: "scaleX(var(--power-release, 0))" }}
                  />
                </span>
                <p className="mt-2 text-[12px] leading-[1.45] text-[#555A63]">{copy.engine.continuitySub}</p>
              </div>
              <span data-v7-anchor="result" className="absolute right-4 top-4 h-px w-px" />
              {reduced && <StaticArtifact state="checked" className="mt-3" />}
            </div>
            </div>
          </div>

          {/* the result separates; A2 confirms it from beside the column.
              This band lives inside the review grid (already capped at the
              corridor), so the window runs flush to the band's edge. */}
          <div className="sm:col-span-2 sm:mt-[10vh]">
            <A2Dialogue beat="resultat" align="flush" label={copy.engine.supervisor} line={concierge.guide.outcome} />
          </div>
          {/* the bridge into the real example: A2 presents it here */}
          <div className="mt-2 pt-[calc(var(--v7vh,100vh)*0.02)] sm:col-span-2 sm:mt-0 sm:pt-0">
            <p className={`${mono} text-[#E2C486]`}>{copy.exampleIntro}</p>
            <span data-v7-anchor="example" aria-hidden className="relative left-[65%] top-3 block h-px w-px sm:left-[87%]" />
            {reduced && <StaticArtifact state="checked" className="mt-4" />}
          </div>
        </div>
      </section>

      {/* the ONE being lives inside this tree, at its hero post above the
          intake box - scoped ownership, rendered inside act 1 */}
      {children}
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
