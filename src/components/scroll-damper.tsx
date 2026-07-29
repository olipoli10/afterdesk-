"use client";

import { useEffect } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   Wheel damping. A mouse wheel on Windows fires ~100px per notch, so a page
   built out of large calm plates flies past in three flicks — the founder's
   "ça va beaucoup trop vite, ça a aucun sens". CSS cannot fix this; only the
   input can be shaped.

   Deliberately narrow, because hijacking scroll is a dark pattern when done
   greedily:
   - MOUSE WHEELS ONLY. Trackpads emit many small continuous deltas and are
     already smooth; they are left completely native (delta < TRACKPAD_MAX).
   - Touch, keyboard, spacebar, scrollbar drags, find-in-page and anchor
     jumps are never intercepted — they move the document, and the damper
     re-syncs to wherever they left it.
   - Ctrl+wheel (pinch zoom) is never touched.
   - A wheel inside a genuinely scrollable element (the AI chat transcript,
     an overflow-x table) is left alone.
   - prefers-reduced-motion disables the whole thing.
   ───────────────────────────────────────────────────────────────────────── */

/** Fraction of the OS delta actually applied. 1 = native. */
const FACTOR = 0.55;
/** Per-frame approach rate toward the target. Higher = snappier, less glide. */
const EASE = 0.14;
/** Deltas at or below this are treated as a trackpad and left native. */
const TRACKPAD_MAX = 40;

function scrollableAncestor(start: EventTarget | null): boolean {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const s = getComputedStyle(el);
    const canScrollY =
      /(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
    if (canScrollY) return true;
    el = el.parentElement;
  }
  return false;
}

export function ScrollDamper() {
  useEffect(() => {
    if (
      typeof window.matchMedia !== "function" ||
      !window.matchMedia("(prefers-reduced-motion: no-preference)").matches ||
      !window.matchMedia("(pointer: fine)").matches
    ) {
      return;
    }

    let target = window.scrollY;
    let raf = 0;

    const maxScroll = () =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    const loop = () => {
      const current = window.scrollY;
      const delta = target - current;
      if (Math.abs(delta) < 0.5) {
        raf = 0;
        return;
      }
      window.scrollTo(0, current + delta * EASE);
      raf = requestAnimationFrame(loop);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.defaultPrevented) return;
      // deltaMode 1/2 are line/page wheels — rare, and the multiplier would
      // be wrong; leave them native.
      if (e.deltaMode !== 0) return;
      if (Math.abs(e.deltaY) <= TRACKPAD_MAX) return;
      if (scrollableAncestor(e.target)) return;

      e.preventDefault();
      // Re-anchor if anything else moved the page since the last wheel.
      if (!raf || Math.abs(target - window.scrollY) > window.innerHeight) {
        target = window.scrollY;
      }
      target = Math.min(maxScroll(), Math.max(0, target + e.deltaY * FACTOR));
      if (!raf) raf = requestAnimationFrame(loop);
    };

    // Any non-wheel movement wins: drop the glide and adopt the new position.
    const surrender = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      target = window.scrollY;
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", surrender);
    window.addEventListener("touchstart", surrender, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", surrender);
      window.removeEventListener("touchstart", surrender);
    };
  }, []);

  return null;
}
