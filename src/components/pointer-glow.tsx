"use client";

import { useEffect, useRef } from "react";

/**
 * A dusk halo that drifts toward the pointer over the hero — atmosphere that
 * answers the visitor's hand. Mouse-only (pointer:fine), reduced-motion
 * gated, and cheap by construction: a flat radial gradient (never a blur()
 * filter) moved by transform only, updated at most once per frame via rAF.
 */
export function PointerGlow() {
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

    let raf = 0;
    let x = 0;
    let y = 0;

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      x = e.clientX - r.left - 280;
      y = e.clientY - r.top - 280;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.opacity = "1";
          el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        });
      }
    };
    const onLeave = () => {
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
      className="glow-dusk pointer-events-none absolute left-0 top-0 h-[560px] w-[560px] opacity-0"
      style={{
        transition: "opacity 700ms ease, transform 900ms cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "transform, opacity",
      }}
    />
  );
}
