"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/**
 * Replaces what used to be three floating pills (About us, Our Services,
 * Sign in) — measured live on afterdesk.co at 375px: they wrapped onto two
 * rows and cost ~172px of vertical space before any real content (header
 * bottom at y=57, hero h1 at y=229). One compact 44×44 trigger now, same
 * footprint as the language switcher beside it.
 *
 * Same uncontrolled <details>/<summary> + outside-click pattern already
 * proven in LangSwitch (src/components/lang-switch.tsx) — reused rather
 * than reinvented, so this introduces no new state-sync behavior. See that
 * file's own comment for why a controlled `open` prop fights the browser's
 * own toggle event instead of driving it.
 */
export function MobileMenu({
  tone,
  aboutLabel,
  servicesLabel = "Our Services",
  signInLabel,
  signInHref,
  className = "",
}: {
  /** "night" is the client homepage, "paper" the worker one. */
  tone: "night" | "paper";
  aboutLabel: string;
  servicesLabel?: string;
  signInLabel: string;
  /** Where the sign-in link goes when a login form is the wrong answer — a
   *  visitor who is already signed in needs their portal, not a sign-in page. */
  signInHref?: string;
  className?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      const el = detailsRef.current;
      if (el && el.open && !el.contains(e.target as Node)) {
        el.open = false;
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function closeMenu() {
    if (detailsRef.current) detailsRef.current.open = false;
  }

  const trigger =
    tone === "night"
      ? "border-white/[0.14] bg-white/[0.07] text-[#F7F6F3] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_24px_-10px_rgba(0,0,0,0.55)] hover:bg-white/[0.12]"
      : "border-[#14161A]/[0.09] bg-white/70 text-[#14161A] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_24px_-12px_rgba(20,22,26,0.3)] hover:bg-white/90";
  const panel = tone === "night" ? "border-white/15 bg-[#111317]" : "border-black/10 bg-white";
  const item =
    tone === "night" ? "text-[#C9CDD3] hover:text-white" : "text-[#5B6069] hover:text-[#14161A]";

  return (
    <details ref={detailsRef} className={`group relative inline-block sm:hidden ${className}`}>
      <summary
        aria-label="Menu"
        className={`flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-full border backdrop-blur-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 ${trigger} ${
          tone === "night" ? "focus-visible:ring-white/60" : "focus-visible:ring-[#14161A]/40"
        }`}
      >
        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden>
          <path
            d="M2 4.5H14M2 8H14M2 11.5H14"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </summary>
      <nav
        aria-label="More"
        className={`absolute left-0 top-12 z-50 min-w-44 overflow-hidden rounded-md border p-1 shadow-xl ${panel}`}
      >
        <Link
          href="/about"
          onClick={closeMenu}
          className={`flex min-h-11 items-center rounded px-3 text-sm font-medium transition-colors duration-150 ${item}`}
        >
          {aboutLabel}
        </Link>
        <Link
          href="/services"
          onClick={closeMenu}
          className={`flex min-h-11 items-center rounded px-3 text-sm font-medium transition-colors duration-150 ${item}`}
        >
          {servicesLabel}
        </Link>
        <Link
          href={signInHref ?? (tone === "paper" ? "/login?audience=worker" : "/login")}
          onClick={closeMenu}
          className={`flex min-h-11 items-center rounded px-3 text-sm font-medium transition-colors duration-150 ${item}`}
        >
          {signInLabel}
        </Link>
      </nav>
    </details>
  );
}
