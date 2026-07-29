"use client";

import { useEffect } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   Wheel damping. A mouse wheel on Windows fires ~100px per notch, so a page
   built out of large calm plates flies past in three flicks. CSS cannot fix
   this; only the input can be shaped.

   TWO BUGS THIS FILE EXISTS TO NOT HAVE, both learned the hard way:

   1. NEVER clamp the target to `scrollHeight - innerHeight`. The looping
      artifacts on these pages change layout by a pixel or two as they play,
      so that ceiling wobbles — and a target clamped against a momentarily
      shorter document gets pulled BACKWARDS, which the visitor sees as the
      page bouncing back up as they scroll down. `window.scrollTo` already
      clamps at the bottom; we clamp only at 0.

   2. NEVER keep glancing at `window.scrollY` as the source of truth while
      also writing to it. If anything else moves the page — an anchor, the
      keyboard, the scrollbar, the browser's own scroll anchoring — the two
      fight. We remember what we last wrote; if reality has drifted from it,
      something else is in charge and we surrender immediately.

   Deliberately narrow, because hijacking scroll is a dark pattern when done
   greedily: mouse wheels only (trackpads emit small continuous deltas and
   are already smooth — left completely native), never touch, keyboard,
   scrollbar drags, find-in-page, anchor jumps or ctrl+wheel zoom, never
   inside a genuinely scrollable child, and off entirely under
   prefers-reduced-motion.
   ───────────────────────────────────────────────────────────────────────── */

/* THE TWO KNOBS. If it feels wrong, these are the only numbers to touch. */
/** Fraction of the OS delta actually applied. 1 = native, lower = slower. */
const FACTOR = 0.3;
/** Per-frame approach rate toward the target. Higher = snappier, less glide. */
const EASE = 0.16;
/** How far reality may drift from our last write before we hand over. */
const DRIFT_PX = 3;

function insideScrollable(start: EventTarget | null): boolean {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const s = getComputedStyle(el);
    if (
      /(auto|scroll|overlay)/.test(s.overflowY) &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return true;
    }
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

    let target = window.scrollY; // where the wheel says we should end up
    let written = window.scrollY; // the last value WE put on the document
    let raf = 0;

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const loop = () => {
      const current = window.scrollY;

      // Someone else is driving — let go, and take their position as ours.
      if (Math.abs(current - written) > DRIFT_PX) {
        target = current;
        raf = 0;
        return;
      }

      const delta = target - current;
      if (Math.abs(delta) < 0.5) {
        raf = 0;
        return;
      }

      window.scrollTo(0, current + delta * EASE);
      written = window.scrollY; // scrollTo clamps at both ends; trust it
      raf = requestAnimationFrame(loop);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.defaultPrevented) return;
      // deltaMode 1/2 are line/page wheels — the multiplier would be wrong.
      if (e.deltaMode !== 0) return;
      /* Every pixel delta is damped, precision touchpads included. An
         earlier version skipped small deltas to "leave trackpads native",
         which quietly meant laptop visitors got no damping at all — and the
         founder kept reporting the page was still too fast. */
      if (e.deltaY === 0) return;
      if (insideScrollable(e.target)) return;

      e.preventDefault();

      // A fresh gesture (or one that drifted) starts from where we actually
      // are. Only the floor is clamped — see bug 1 above.
      if (!raf || Math.abs(window.scrollY - written) > DRIFT_PX) {
        target = window.scrollY;
        written = window.scrollY;
      }
      target = Math.max(0, target + e.deltaY * FACTOR);

      if (!raf) raf = requestAnimationFrame(loop);
    };

    // Any other input wins outright.
    const surrender = () => {
      stop();
      target = window.scrollY;
      written = window.scrollY;
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", surrender);
    window.addEventListener("touchstart", surrender, { passive: true });
    window.addEventListener("mousedown", surrender);
    return () => {
      stop();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", surrender);
      window.removeEventListener("touchstart", surrender);
      window.removeEventListener("mousedown", surrender);
    };
  }, []);

  return null;
}
