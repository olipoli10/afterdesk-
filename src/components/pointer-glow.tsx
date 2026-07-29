"use client";

import { useEffect, useRef } from "react";

/**
 * A dusk halo that drifts toward the pointer over the hero — atmosphere that
 * answers the visitor's hand. Mouse-only (pointer:fine), reduced-motion
 * gated, pure transform (compositor-friendly), and invisible until the first
 * pointer move so touch devices never see a misplaced glow.
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

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      el.style.opacity = "1";
      el.style.transform = `translate(${e.clientX - r.left - 260}px, ${e.clientY - r.top - 260}px)`;
    };
    const onLeave = () => {
      el.style.opacity = "0";
    };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-[#1B2740]/30 opacity-0 blur-[110px] transition-opacity duration-700"
      style={{ transitionProperty: "opacity, transform", transitionDuration: "700ms, 1200ms" }}
    />
  );
}
