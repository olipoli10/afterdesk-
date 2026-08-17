"use client";

/* Phase 1.4C corrective gate - the mobile route navigation the shell was
   missing: below md the five destinations were `hidden md:inline` with no
   replacement. One semantic disclosure button (>=44x44, localized name,
   aria-expanded), a compact panel, keyboard open, Escape closes and
   returns focus, outside-click closes, focus moves to the first link on
   open. No package, no portal, no body-scroll change. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function MobileNav({
  label,
  closeLabel,
  items,
  night,
  currentPath,
}: {
  label: string;
  closeLabel: string;
  items: { href: string; text: string }[];
  night: boolean;
  currentPath: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [open]);

  const dim = night ? "text-[#8a919e]" : "text-[#5B6069]";
  const panelGround = night ? "border-white/15 bg-[#111318]" : "border-black/10 bg-white";

  return (
    <div ref={rootRef} className="relative md:hidden" data-mobile-nav="">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? closeLabel : label}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-11 min-w-11 items-center justify-center rounded font-mono text-[11px] uppercase tracking-[0.16em] ${dim} transition-colors hover:text-[#C9A76A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C486]`}
      >
        {/* three machined lines, not a generic hamburger blob */}
        <span aria-hidden className="grid gap-[5px]">
          <span className={`h-px w-5 bg-current transition-transform ${open ? "translate-y-[3px] rotate-45" : ""}`} />
          <span className={`h-px w-5 bg-current ${open ? "opacity-0" : ""}`} />
          <span className={`h-px w-5 bg-current transition-transform ${open ? "-translate-y-[9px] -rotate-45" : ""}`} />
        </span>
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          className={`absolute right-0 top-12 z-50 min-w-52 rounded-sm border p-1.5 shadow-xl ${panelGround}`}
        >
          {items.map((item) => (
            <Link
              key={item.href}
              role="menuitem"
              href={item.href}
              aria-current={currentPath === item.href ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`flex min-h-11 items-center rounded px-3 text-[14px] no-underline ${
                currentPath === item.href
                  ? "text-[#E2C486]"
                  : `${dim} hover:text-[#C9A76A]`
              } focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C486]`}
            >
              {item.text}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
