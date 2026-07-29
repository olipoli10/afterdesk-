"use client";

import { useEffect, useRef } from "react";

/**
 * A light that FOLLOWS the pointer over the hero. Smooth-follow is done by
 * lerping toward the cursor in a persistent rAF loop — never a CSS transform
 * transition (a long transition restarting on every move leaves the glow
 * permanently lagging behind the hand, which reads as broken).
 * Flat gradient (no blur() filter), transform-only: pure compositor work.
 * Mouse-only, reduced-motion gated.
 */
export function PointerGlow({ tone = "night" }: { tone?: "night" | "paper" }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;

    const ok =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches &&
      window.matchMedia("(pointer: fine)").matches;
    if (!ok) return;

    const HALF = 320; // half of the 640px glow
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    let active = false;

    const loop = () => {
      x += (targetX - x) * 0.16;
      y += (targetY - y) * 0.16;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (active || Math.abs(targetX - x) + Math.abs(targetY - y) > 0.5) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
      }
    };

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      targetX = e.clientX - r.left - HALF;
      targetY = e.clientY - r.top - HALF;
      if (!active) {
        active = true;
        // First contact: appear AT the cursor, no cross-screen swoop.
        x = targetX;
        y = targetY;
        el.style.opacity = "1";
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const onLeave = () => {
      active = false;
      el.style.opacity = "0";
    };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`${tone === "paper" ? "glow-cursor--paper" : "glow-cursor"} pointer-events-none absolute left-0 top-0 h-[640px] w-[640px] opacity-0`}
      style={{ transition: "opacity 500ms ease", willChange: "transform, opacity" }}
    />
  );
}
