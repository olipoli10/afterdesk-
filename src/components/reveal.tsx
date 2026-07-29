"use client";

import { useEffect, useRef, type ReactNode } from "react";

const WATCHDOG_MS = 1200;

/**
 * Scroll-reveal container.
 *
 * Fail-safe by construction: the server renders the content plain and visible.
 * Only after mount does JS *arm* the hidden state (.reveal-armed), and only
 * when it has confirmed that motion is wanted and IntersectionObserver exists.
 * A watchdog force-shows anything still hidden after 1.2s, so a browser that
 * never delivers an intersection callback shows the page rather than a blank.
 *
 * Never invert this: putting the hidden state in the server-rendered class
 * means one failed observer hides the section permanently.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  replay = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Re-arm when scrolled out, so the stagger plays again on every entry. */
  replay?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const wantsMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (!wantsMotion || typeof IntersectionObserver !== "function") return;

    el.classList.add("reveal-armed");

    const show = () => el.classList.add("is-visible");

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show();
            if (!replay) io.disconnect();
          } else if (replay && el.classList.contains("is-visible")) {
            // Fully out of view: re-arm for the next pass.
            if (entry.boundingClientRect.top > 0 || entry.boundingClientRect.bottom < 0) {
              el.classList.remove("is-visible");
            }
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);

    // If the callback never arrives (headless/embedded contexts, odd
    // compositing), reveal anyway rather than leave the section blank.
    const watchdog = window.setTimeout(() => {
      if (!el.classList.contains("is-visible")) {
        show();
        io.disconnect();
      }
    }, WATCHDOG_MS);

    return () => {
      window.clearTimeout(watchdog);
      io.disconnect();
    };
  }, [replay]);

  return (
    <div
      ref={ref}
      className={className}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
