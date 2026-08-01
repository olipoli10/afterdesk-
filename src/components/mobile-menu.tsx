"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * A single pill that widens — not a button plus a separate dropdown panel.
 * Closed, it's a 44×44 circle (rounded-full at 44px width IS a circle);
 * open, the same box is a ~330px stadium with the nav links inside it. Only
 * `max-width` animates, so the background (opaque, never transitioned) and
 * the geometry (fixed height, normal document flow, no `position:absolute`)
 * can't produce a frame where anything behind it shows through, and it
 * can't grow toward the hero title below — it only ever grows sideways.
 *
 * Previously an uncontrolled <details>/<summary> (matching LangSwitch,
 * src/components/lang-switch.tsx) with a <nav> dropping down below it. Two
 * problems forced a rebuild rather than a patch: (1) a page-load entrance
 * animation on the wrapper leaked opacity into the dropdown — fixed
 * separately, but exposed how fragile "trigger and revealed content share
 * one box's opacity" is; (2) the founder asked for the trigger to visibly
 * BECOME the revealed content (morph), not disclose a separate block below
 * it — <details> models the latter, not the former. This is a deliberate,
 * narrow exception: LangSwitch keeps <details>, its dropdown genuinely is
 * a simple vertical reveal with no morph requirement.
 *
 * Labels render at a fixed 11px inside the pill regardless of language —
 * measured directly against real rendered Geist Sans text (not estimated):
 * at the normal 14px/text-sm size, English fits this pill with ~38px to
 * spare at 375px, but French/Spanish/Tagalog ("Qui nous sommes",
 * "Quiénes somos", "Iniciar sesión") overflow it by 42-45px. 11px is the
 * smallest size with a comfortable, reliable margin (~35px) in every
 * language rather than the ~2-4px 12px left for French/Spanish — using one
 * fixed size for every language, instead of sizing per-locale, means this
 * menu doesn't visibly change size when someone switches language.
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Move focus to the first link only once the pill has actually finished
  // widening, not the instant it opens — moving it immediately means a
  // screen reader announces link text while the shape is still visually
  // mid-expansion, which reads as broken.
  useEffect(() => {
    if (!open) return;
    const pill = pillRef.current;
    if (!pill) return;
    function onEnd(e: TransitionEvent) {
      if (e.propertyName === "max-width" && e.target === pill) {
        firstLinkRef.current?.focus();
      }
    }
    pill.addEventListener("transitionend", onEnd);
    // Reduced motion skips the transition entirely, so transitionend never
    // fires — focus immediately in that case instead of waiting forever.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      firstLinkRef.current?.focus();
    }
    return () => pill.removeEventListener("transitionend", onEnd);
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  const pillTone =
    tone === "night"
      ? "border-white/15 bg-[#111317] text-[#F7F6F3] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_24px_-10px_rgba(0,0,0,0.55)]"
      : "border-black/10 bg-white text-[#14161A] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_24px_-12px_rgba(20,22,26,0.3)]";
  const ring = tone === "night" ? "focus-visible:ring-white/60" : "focus-visible:ring-[#14161A]/40";
  const item =
    tone === "night" ? "text-[#C9CDD3] hover:text-white" : "text-[#5B6069] hover:text-[#14161A]";

  return (
    <div ref={rootRef} className={`inline-block sm:hidden ${className}`}>
      <div
        ref={pillRef}
        style={{ maxWidth: open ? "min(330px, calc(100vw - 48px))" : "44px" }}
        className={`flex h-11 items-center overflow-hidden rounded-full border transition-[max-width] duration-[380ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${pillTone}`}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
          className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${ring}`}
        >
          <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden>
            <path
              d="M2 4.5H14M2 8H14M2 11.5H14"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <nav
          aria-label="More"
          inert={!open}
          className="flex items-center gap-1 whitespace-nowrap pr-2"
        >
          <Link
            ref={firstLinkRef}
            href="/about"
            tabIndex={open ? 0 : -1}
            onClick={closeMenu}
            className={`flex min-h-11 items-center rounded px-2 text-[11px] font-medium transition-colors duration-150 ${item}`}
          >
            {aboutLabel}
          </Link>
          <Link
            href="/services"
            tabIndex={open ? 0 : -1}
            onClick={closeMenu}
            className={`flex min-h-11 items-center rounded px-2 text-[11px] font-medium transition-colors duration-150 ${item}`}
          >
            {servicesLabel}
          </Link>
          <Link
            href={signInHref ?? (tone === "paper" ? "/login?audience=worker" : "/login")}
            tabIndex={open ? 0 : -1}
            onClick={closeMenu}
            className={`flex min-h-11 items-center rounded px-2 text-[11px] font-medium transition-colors duration-150 ${item}`}
          >
            {signInLabel}
          </Link>
        </nav>
      </div>
    </div>
  );
}
