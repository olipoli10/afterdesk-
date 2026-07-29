"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * App-nav item with the "current page" state the shell never had: a 2px ink
 * rule sitting on the header's hairline, like the open tab of a paper file.
 * Longest-match logic so /admin doesn't stay lit while on /admin/pricing.
 */
export function NavLink({
  href,
  label,
  badge,
  exactSiblings,
}: {
  href: string;
  label: string;
  badge?: number;
  /** All nav hrefs — used so only the LONGEST matching item lights up. */
  exactSiblings: string[];
}) {
  const pathname = usePathname();
  const matches = (h: string) => pathname === h || pathname.startsWith(h + "/");
  const longestMatch = exactSiblings
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];
  const active = matches(href) && href === longestMatch;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={badge !== undefined && badge > 0 ? `${label}, ${badge} waiting` : undefined}
      className={`relative flex h-14 shrink-0 items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#14161A] ${
        active
          ? "text-[#14161A] shadow-[inset_0_-2px_0_#14161A]"
          : "text-[#5B6069] hover:text-[#14161A]"
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 ? (
        <span
          aria-hidden
          className="rounded-[3px] bg-[#14161A] px-1.5 py-[3px] font-mono text-[10px] leading-none tabular-nums text-[#F7F6F3]"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
