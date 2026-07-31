"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/**
 * Language switcher for the public pages. The choice IS the URL — each Link
 * still just navigates to `${path}?lang=${code}` and Proxy persists it to a
 * year-long cookie, so a returning visitor lands in their own language.
 *
 * The mobile dropdown is a native <details>/<summary>, left UNCONTROLLED on
 * purpose. A first attempt mirrored `open` into React state via `onToggle`
 * and rendered `<details open={open}>` — the standard "controlled native
 * element" pattern — but a <details> element also fires `toggle` whenever
 * its open state changes for ANY reason, including React setting the prop
 * itself. That produces a feedback loop between the DOM and the state that
 *'s driving it, and in practice the element never actually closed: picking
 * a language fired the handler (confirmed with a console probe) but the
 * attribute stayed. Driving the DOM directly here — `ref.current.open =
 * false` — sidesteps that loop entirely: nothing reads `open` back into
 * React, so there is nothing for the toggle event to fight with.
 *
 * Both pages offer the same four languages (EN/FR/ES/FIL), but each passes
 * its own set and its own path, and the cookies stay separate on purpose: a
 * French client and a Filipino worker are different people reading different
 * pages, and one choosing FIL must not flip the other's page.
 */
export function LangSwitch<T extends string>({
  path,
  current,
  options,
  tone,
}: {
  path: string;
  current: T;
  options: { code: T; label: string }[];
  tone: "night" | "paper";
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

  const active =
    tone === "night" ? "bg-[#F7F6F3] text-[#14161A]" : "bg-[#14161A] text-[#F7F6F3]";
  const idle =
    tone === "night"
      ? "text-[#767C86] hover:text-white"
      : "text-[#5B6069] hover:text-[#14161A]";

  return (
    <>
      <details ref={detailsRef} className="group relative sm:hidden">
        <summary
          aria-label="Choose language"
          className={`flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded font-mono text-[11px] uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${active}`}
        >
          {options.find((option) => option.code === current)?.label ?? current}
        </summary>
        <nav
          aria-label="Language"
          className={`absolute right-0 top-11 z-50 min-w-36 overflow-hidden rounded-md border p-1 shadow-xl ${
            tone === "night"
              ? "border-white/15 bg-[#111317]"
              : "border-black/10 bg-white"
          }`}
        >
          {options.map((option) => (
            <Link
              key={option.code}
              href={`${path}?lang=${option.code}`}
              hrefLang={option.code}
              aria-current={option.code === current ? "true" : undefined}
              onClick={closeMenu}
              className={`flex min-h-11 items-center rounded px-3 font-mono text-xs ${
                option.code === current ? active : idle
              }`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </details>
      <nav
        aria-label="Language"
        className="hidden items-center gap-0.5 font-mono text-[11px] sm:flex"
      >
        {options.map((option) => (
          <Link
            key={option.code}
            href={`${path}?lang=${option.code}`}
            hrefLang={option.code}
            aria-current={option.code === current ? "true" : undefined}
            className={`flex min-h-11 items-center rounded px-2 transition-colors duration-150 ${
              option.code === current ? active : idle
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
