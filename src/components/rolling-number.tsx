"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Odometer roll: the figure counts up once when it enters the viewport, then
 * holds forever — evidence-layer motion, the only kind the doctrine allows.
 *
 * Fail-safe by construction (same doctrine as Reveal): the final value is the
 * server-rendered default; the roll only arms when motion is wanted and
 * IntersectionObserver exists, and a watchdog forces the final value if
 * requestAnimationFrame never fires (hidden/non-compositing contexts).
 * tabular-nums is required on the parent so digits never jitter.
 */
export function RollingNumber({
  value,
  prefix = "",
  suffix = "",
  durationMs = 900,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0) return;

    const wantsMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (!wantsMotion || typeof IntersectionObserver !== "function") return;

    let raf = 0;
    let started = false;

    const finish = () => {
      cancelAnimationFrame(raf);
      setShown(value);
    };

    const run = () => {
      if (started) return;
      started = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(Math.round(value * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      setShown(0);
      raf = requestAnimationFrame(tick);
      // If rAF never delivers (hidden pane, throttled tab), land on the truth.
      window.setTimeout(finish, durationMs + 600);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            run();
            io.disconnect();
          }
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} suppressHydrationWarning>
      {prefix}
      {shown.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
