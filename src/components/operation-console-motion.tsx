"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ConsoleMotionCopy } from "@/lib/i18n/client";

/**
 * THE MOTION LAYER — a narrow client island around a server-rendered list.
 *
 * The `<ol>` of seven stations is NOT part of this component. It arrives as
 * `children`, already rendered on the server, which Next.js documents as
 * staying outside the client module graph
 * (docs/01-app/01-getting-started/05-server-and-client-components.md, the
 * "Server Components passed as children" note). So the accessible markup, the
 * copy and all four dictionaries ship as HTML exactly as before, and the only
 * JavaScript added here is a step counter plus two buttons.
 *
 * WHAT THE MOTION SAYS. The frame list is not a loop over 0..6. It is the real
 * shape of a managed operation:
 *
 *   request -> scope -> plan -> work -> ISSUE -> review -> BACK TO WORK
 *           -> review again -> verified
 *
 * The two backward frames are the whole point. A step that is flagged does not
 * quietly continue; it returns to the work station and comes back through
 * review before anything is delivered. An animation that only marched forward
 * would be decoration — this one traces the recovery path that the static copy
 * describes in words.
 *
 * HOW IT DRIVES THE CSS. Two numbers on the wrapper: `--console-seen`, the
 * furthest station reached (monotonic, so going back never hides what was
 * already shown), and `--console-active`, the station being worked on now.
 * Every visual state derives from those two in `globals.css` — no per-station
 * JavaScript, no inline style writes, nothing to keep in sync.
 *
 * THE STATIC PAGE IS THE FALLBACK, NOT A DEGRADED MODE. Before hydration,
 * with JavaScript off, and under `prefers-reduced-motion: reduce`, the wrapper
 * keeps the CSS defaults (`--console-seen: 99`, `--console-active: -1`): every
 * station fully opaque, nothing emphasised, exactly the committed static
 * design. The controls only render after mount and only when motion is
 * allowed, so a no-JS visitor never meets a dead button.
 */

/** Station indices, in the order the operation actually visits them. */
const FRAMES = [0, 1, 2, 3, 4, 5, 3, 5, 6] as const;
const FRAME_MS = 1500;
/** The pause on the flagged step — the beat that makes the return readable. */
const ISSUE_HOLD_MS = 2300;
const ISSUE_FRAME = 4;

export function OperationConsoleMotion({
  children,
  copy,
}: {
  children: ReactNode;
  copy: ConsoleMotionCopy;
}) {
  /** -1 means "no motion": the complete static state. */
  const [frame, setFrame] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reduced motion is a hard stop, not a slower animation: the static state
    // is already complete, so there is nothing to degrade to.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Started from a frame callback rather than synchronously in the effect
    // body: a synchronous setState here cascades an extra render before the
    // browser has painted, which is what react-hooks/set-state-in-effect is
    // warning about. One frame later is invisible and correct.
    const id = requestAnimationFrame(() => {
      setEnabled(true);
      setFrame(0);
      setPlaying(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    // Rest on the verified state rather than looping: one operation, once. The
    // end is expressed by scheduling NOTHING, not by setting state — the only
    // setState below sits inside the timeout callback, where it belongs.
    if (!playing || frame < 0 || frame >= FRAMES.length - 1) return;
    const delay = FRAMES[frame] === ISSUE_FRAME ? ISSUE_HOLD_MS : FRAME_MS;
    const id = window.setTimeout(() => setFrame((f) => f + 1), delay);
    return () => window.clearTimeout(id);
  }, [playing, frame]);

  const replay = useCallback(() => {
    setFrame(0);
    setPlaying(true);
  }, []);

  /**
   * Both numbers are DERIVED from the frame, not accumulated in a ref.
   *
   * The first version kept `seen` in a ref seeded at 99 — the static default —
   * and raised it with Math.max. It could therefore never come down, so every
   * station rendered fully revealed for the whole run and the animation did
   * nothing at all. It looked correct in the source and was only caught by
   * sampling the custom properties in a real browser.
   *
   * Deriving it from FRAMES has no such failure mode: `seen` is simply the
   * furthest station the sequence has reached so far, which is what keeps the
   * two backward frames from hiding what they already showed.
   */
  const active = frame < 0 ? -1 : FRAMES[frame];
  const seen = frame < 0 ? 99 : Math.max(...FRAMES.slice(0, frame + 1));

  /**
   * Paint the decorative state. `frame < 0` means "no motion", and every
   * station is restored to the static appearance — which is also what happens
   * if this effect never runs at all.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stations = root.querySelectorAll<HTMLElement>(".op-station");
    stations.forEach((li, i) => {
      const ring = li.querySelector<HTMLElement>(".op-station-ring");
      if (frame < 0) {
        li.style.opacity = "";
        if (ring) ring.style.opacity = "";
        return;
      }
      li.style.opacity = i <= seen ? "1" : "0.32";
      if (ring) ring.style.opacity = i === active ? "0.6" : "0";
    });
  }, [frame, seen, active]);

  const atEnd = frame >= FRAMES.length - 1;

  return (
    <div
      ref={rootRef}
      className="op-console"
      /* Mirrors the active index for the ring's selectors. The CSS variables
         below still drive the reveal, which is legal arithmetic; the ring is
         selector-driven because its comparison is not. */
      data-active={frame < 0 ? undefined : active}
      data-seen={frame < 0 ? undefined : seen}
    >
      {children}

      {/* Controls exist only when motion does. No JavaScript, reduced motion,
          or pre-hydration: no buttons, and nothing to explain. */}
      {enabled && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => (atEnd ? replay() : setPlaying((p) => !p))}
            className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-4 text-[13px] font-medium text-[#C9CDD3] transition-colors hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {atEnd ? copy.replay : playing ? copy.pause : copy.resume}
          </button>
          {!atEnd && (
            <button
              type="button"
              onClick={replay}
              className="inline-flex min-h-11 items-center rounded-full px-3 text-[13px] text-[#8A9099] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {copy.replay}
            </button>
          )}
          {/* Describes the diagram, not the frame. A live region here would
              announce a decorative state change nine times per run. */}
          <p className="text-[12px] text-[#767C86]">{copy.hint}</p>
        </div>
      )}
    </div>
  );
}
