"use client";

/* ---------------------------------------------------------------------------
   A2 - the Endvera concierge (Phase 1.4B integration).

   The being is the FROZEN original A2 (Phase 1.3F FAMILY.A2); every frame
   below derives from that skeleton by INTEGER offsets only, exactly the
   approved Phase 1.4A motion language. Nothing here redraws or "improves"
   the character.

   This release is a STATIC site guide: approved corpus-grounded answers
   with citations to real routes, an honest unknown, and a fail-closed
   unavailable state. No model, no API, no fetch, no storage, no cookies.

   SINGLE-BEING INVARIANT: exactly one A2 exists. It lives in the launcher,
   travels, and re-arrives inside the panel - one location state renders one
   sprite, and assertSingleA2() throws (dev) / reports (prod) if the DOM
   ever contains two beings mid-transfer.
   ------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import styles from "./a2-concierge.module.css";

const AM = "#d87526", ON = "#0d1015", GR = "#343a46";
type Rect = [number, number, number, number, string];
type Pose = Partial<{
  dx: number; dy: number; hy: number; hdx: number; hdy: number;
  ex: number; ey: number; lid: number; tx: number; ty: number;
  bfx: number; bfy: number; ffx: number; ffy: number; sq: number;
}>;

/* Frozen skeleton - byte-identical to FAMILY.A2 at rest (pose {}). */
export function a2pose(p: Pose = {}): Rect[] {
  const { dx = 0, dy = 0, hy = 0, hdx = 0, hdy = 0, ex = 0, ey = 0, lid = 0,
          tx = 0, ty = 0, bfx = 0, bfy = 0, ffx = 0, ffy = 0, sq = 0 } = p;
  return [
    [9 + dx, 9 + dy + hy + sq, 9, 6, AM],
    [12 + dx + hdx, 13 + dy + hdy + sq, 13, 6, AM],
    [10 + dx, 18 + dy, 14, 8, AM],
    [16 + dx + hdx + ex, 15 + dy + hdy + sq + ey, 2, 2 - lid, ON],
    [20 + dx + hdx + ex, 15 + dy + hdy + sq + ey, 2, 2 - lid, ON],
    [7 + dx + tx, 21 + dy + ty, 3, 3, AM],
    [12 + dx + bfx, 25 + dy + bfy, 4, 3, GR],
    [19 + dx + ffx, 26 + dy + ffy, 4, 2, GR],
  ];
}
export const A2_REST: Rect[] = a2pose();

/* Approved 1.4A sequences (10 fps whole frames; each returns to rest). */
export const SEQ: Record<string, Pose[]> = {
  arrival: [
    { dx: 14, sq: 1 }, { dx: 11, sq: 1 }, { dx: 8, sq: 1 }, { dx: 5, sq: 1 },
    { dx: 3, sq: 1 }, { dx: 1, sq: 1 }, { dx: 0, sq: 1 }, { dx: 0 },
    { ex: -1 }, { ex: -1 }, {},
  ],
  listening: [
    { hy: -1, hdy: -1 }, { hy: -1, hdy: -1, ex: -1 }, { hy: -1, hdy: -1, ex: -1, ffx: -1 },
    { hy: -1, hdy: -1, ex: -1, ffx: -1 }, { hy: -1, hdy: -1, ex: -1 }, { hy: -1, hdy: -1 }, {},
  ],
  verified: [
    { hy: -1, hdy: -1 }, { hy: -1, hdy: -1, ffy: -1 }, { hy: -1, hdy: -1, ffy: -1 },
    { hy: -1, hdy: -1, ffy: -1 }, { hy: -1, hdy: -1 }, { hy: -1, hdy: -1, ffy: -1 }, {},
  ],
  unknown: [
    { hdx: -1 }, { hdx: -2, ty: 1 }, { hdx: -2, ex: -1, ey: 1, ty: 1 },
    { hdx: -2, ey: 1, ty: 1 }, { hdx: -2, ex: 1, ey: 1, ty: 1 },
    { hdx: -1, hdy: 1 }, { hdy: 1 }, {},
  ],
  unavailable: [
    { dx: 1 }, { dx: 2, dy: 1, sq: 1 }, { dx: 3, dy: 1, sq: 1, lid: 1 }, { dx: 3, dy: 1, sq: 1, lid: 1 },
  ],
};
const IDLE: Pose[][] = [
  [{ bfy: -1 }, { bfy: -1 }, {}],
  [{ ex: -1 }, { ex: -1 }, {}],
  [{ hy: -1 }, {}],
];

/* Single-being guard: the DOM may never hold two A2 renders. */
export function assertSingleA2() {
  if (typeof document === "undefined") return;
  const n = document.querySelectorAll("[data-a2-being]").length;
  if (n > 1) {
    const msg = `A2 single-being invariant violated: ${n} beings rendered`;
    if (process.env.NODE_ENV !== "production") throw new Error(msg);
    console.error(msg);
  }
}

function A2Sprite({ rects, px, label }: { rects: Rect[]; px: number; label?: string }) {
  return (
    <svg
      data-a2-being=""
      viewBox="0 0 32 32"
      width={32 * px}
      height={32 * px}
      shapeRendering="crispEdges"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {rects.map(([x, y, w, h, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
      ))}
    </svg>
  );
}

/* One animation slot: plays a sequence at 10fps with whole frames. */
function usePlayer(reduced: boolean) {
  const [rects, setRects] = useState<Rect[]>(A2_REST);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }, []);
  const play = useCallback((frames: Pose[], done?: () => void) => {
    stop();
    if (reduced) {
      setRects(a2pose(frames[frames.length - 1]));
      done?.();
      return;
    }
    let i = 0;
    setRects(a2pose(frames[0]));
    timer.current = setInterval(() => {
      i++;
      if (i >= frames.length) { stop(); done?.(); return; }
      setRects(a2pose(frames[i]));
    }, 100);
  }, [reduced, stop]);
  useEffect(() => stop, [stop]);
  return { rects, play, setRects };
}

export type ConciergeCopy = {
  ask: string; hail: string; title: string; intro: string;
  suggestions: [string, string, string];
  answers: { verified: string; verifiedCite: string; verifiedHref: string;
             unknown: string; unavailable: string };
  close: string;
};

export function A2Concierge({ copy }: { copy: ConciergeCopy }) {
  /* SSR-safe media subscription: false on the server snapshot, live after */
  const reduced = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  /* the ONE being's location: launcher -> traveling -> panel and back */
  const [location, setLocation] = useState<"launcher" | "traveling" | "panel">("launcher");
  const [open, setOpen] = useState(false);
  const [hail, setHail] = useState(false);
  const [answer, setAnswer] = useState<"" | "verified" | "unknown" | "unavailable">("");
  const launcher = usePlayer(reduced);
  const panelA2 = usePlayer(reduced);
  const dialogRef = useRef<HTMLDivElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const arrived = useRef(false);
  /* every timer lives in a ref: an event handler's return value is ignored
     by React, so cleanup MUST go through these (open/close/unmount) */
  const travelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAllTimers = useCallback(() => {
    for (const r of [travelTimer, arrivalTimer, hailTimer]) {
      if (r.current) { clearTimeout(r.current); r.current = null; }
    }
  }, []);
  useEffect(() => clearAllTimers, [clearAllTimers]);

  /* Arrival & Hail: once per page view after the world settles. Both the
     arrival delay and the hail dismissal are ref-held so unmount (and
     Strict Mode's double-invoke) really cancels them. */
  useEffect(() => {
    arrivalTimer.current = setTimeout(() => {
      if (arrived.current) return;
      arrived.current = true;
      launcher.play(SEQ.arrival);
      setHail(true);
      hailTimer.current = setTimeout(() => setHail(false), 3200);
    }, 2400);
    return () => {
      if (arrivalTimer.current) { clearTimeout(arrivalTimer.current); arrivalTimer.current = null; }
      if (hailTimer.current) { clearTimeout(hailTimer.current); hailTimer.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* rare idle micro-life while resting in the launcher */
  useEffect(() => {
    if (location !== "launcher" || reduced) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      t = setTimeout(() => {
        if (alive && arrived.current) launcher.play(IDLE[Math.floor(Math.random() * IDLE.length)]);
        if (alive) tick();
      }, 7000 + Math.random() * 8000);
    };
    tick();
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, reduced]);

  /* guard runs after every location/open change - two beings must never
     coexist, including mid-transfer */
  useEffect(() => { assertSingleA2(); }, [location, open]);

  const openRef = useRef(false);
  const openPanel = useCallback(() => {
    openRef.current = true;
    setOpen(true);
    setAnswer("");
    /* the same being leaves the launcher, travels, arrives in the panel;
       any previous travel is cancelled first, and a late callback can
       never resurrect the panel after a fast close */
    if (travelTimer.current) { clearTimeout(travelTimer.current); travelTimer.current = null; }
    setLocation("traveling");
    travelTimer.current = setTimeout(() => {
      travelTimer.current = null;
      if (!openRef.current) return;
      setLocation("panel");
      panelA2.play(SEQ.listening);
    }, reduced ? 0 : 220);
  }, [panelA2, reduced]);

  const closePanel = useCallback(() => {
    openRef.current = false;
    if (travelTimer.current) { clearTimeout(travelTimer.current); travelTimer.current = null; }
    setOpen(false);
    setAnswer("");
    setLocation("launcher");
    launcher.setRects(A2_REST);
    launchRef.current?.focus();
  }, [launcher]);

  /* focus containment + Escape */
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closePanel(); return; }
      if (e.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>("button, a, [tabindex]")].filter(el => !el.hasAttribute("disabled"));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, closePanel]);

  const answerFor = useCallback((kind: "verified" | "unknown" | "unavailable") => {
    setAnswer(kind);
    panelA2.play(SEQ[kind]);
  }, [panelA2]);

  const answerBody = useMemo(() => {
    if (answer === "verified")
      return (
        <p className={styles.ans} role="status">
          {copy.answers.verified}{" "}
          <a className={styles.cite} href={copy.answers.verifiedHref}>{copy.answers.verifiedCite}</a>
        </p>
      );
    if (answer === "unknown")
      return (
        <p className={styles.ans} role="status">
          {copy.answers.unknown} <a className={styles.cite} href="mailto:support@afterdesk.co">support@afterdesk.co</a>
        </p>
      );
    if (answer === "unavailable")
      return <p className={styles.ans} role="status">{copy.answers.unavailable}</p>;
    return null;
  }, [answer, copy]);

  return (
    <>
      {/* launcher: 44x44 semantic button carrying the 32px being */}
      <div className={styles.dock} data-a2-dock="">
        {hail && !open && (
          <span className={styles.hail} aria-hidden="true">{copy.hail}</span>
        )}
        <button
          ref={launchRef}
          type="button"
          className={styles.launch}
          aria-label={copy.ask}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? closePanel() : openPanel())}
          onMouseEnter={() => { if (!open && location === "launcher") setHail(true); }}
          onMouseLeave={() => setHail(false)}
          onFocus={() => { if (!open && location === "launcher") setHail(true); }}
          onBlur={() => setHail(false)}
        >
          {/* the being at MEANINGFUL scale: exactly 2x the frozen 32px
              skeleton - an integer scale, so crispEdges stays crisp and
              the approved anatomy is untouched */}
          {location === "launcher" ? (
            <A2Sprite rects={launcher.rects} px={2} />
          ) : (
            <span className={styles.empty} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* panel: the same being re-arrives here */}
      {open && (
        <div
          ref={dialogRef}
          className={`${styles.panel}${reduced ? " " + styles.reduce : ""}`}
          role="dialog"
          aria-modal="false"
          aria-label={copy.title}
        >
          <div className={styles.head}>
            {location === "panel" ? (
              <A2Sprite rects={panelA2.rects} px={1} label="A2" />
            ) : (
              <span className={styles.empty} aria-hidden="true" />
            )}
            <b>{copy.title}</b>
            <button type="button" className={styles.close} onClick={closePanel} aria-label={copy.close}>
              ×
            </button>
          </div>
          <p className={styles.intro}>{copy.intro}</p>
          <div className={styles.sugg}>
            <button type="button" onClick={() => answerFor("verified")}>{copy.suggestions[0]}</button>
            <button type="button" onClick={() => answerFor("unknown")}>{copy.suggestions[1]}</button>
            <button type="button" onClick={() => answerFor("unavailable")}>{copy.suggestions[2]}</button>
          </div>
          {answerBody}
        </div>
      )}
    </>
  );
}
