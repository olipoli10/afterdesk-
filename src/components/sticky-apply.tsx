"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Phone-only apply bar. Most of this audience reads on a mid-tier Android;
 * once they have scrolled past the hero the CTA is gone and coming back
 * costs a decision. Appears after 40% of the page, respects the safe area,
 * and never renders on desktop (the nav CTA is always visible there).
 *
 * Passive scroll listener, rAF-throttled, class-toggle only — no layout work
 * on the scroll thread.
 */
export function StickyApply({ label, href }: { label: string; href: string }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setShown(max > 0 && window.scrollY / max > 0.4);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    check();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-[#14161A]/10 bg-[#F7F6F3]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm transition-transform duration-300 sm:hidden ${
        shown ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <Link
        href={href}
        className="flex h-12 items-center justify-center rounded-full bg-[#14161A] text-[15px] font-medium text-[#F7F6F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
      >
        {label}
      </Link>
    </div>
  );
}
