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
  tone = "paper",
}: {
  href: string;
  label: string;
  badge?: number;
  /** All nav hrefs — used so only the LONGEST matching item lights up. */
  exactSiblings: string[];
  tone?: "paper" | "night";
}) {
  const pathname = usePathname();
  const matches = (h: string) => pathname === h || pathname.startsWith(h + "/");
  const longestMatch = exactSiblings
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];
  const active = matches(href) && href === longestMatch;

  const activeCls =
    tone === "night" ? "text-[#F7F6F3] shadow-[inset_0_-2px_0_#F7F6F3]" : "text-[#14161A] shadow-[inset_0_-2px_0_#14161A]";
  const idleCls = tone === "night" ? "text-[#8A9099] hover:text-[#F7F6F3]" : "text-[#5B6069] hover:text-[#14161A]";
  const ring = tone === "night" ? "focus-visible:ring-white" : "focus-visible:ring-[#14161A]";
  const badgeCls =
    tone === "night" ? "bg-[#F7F6F3] text-[#14161A]" : "bg-[#14161A] text-[#F7F6F3]";

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={badge !== undefined && badge > 0 ? `${label}, ${badge} waiting` : undefined}
      className={`relative flex h-14 shrink-0 items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${ring} ${
        active ? activeCls : idleCls
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 ? (
        <span
          aria-hidden
          className={`rounded-[3px] px-1.5 py-[3px] font-mono text-[10px] leading-none tabular-nums ${badgeCls}`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
