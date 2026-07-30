import Link from "next/link";
import type { ReactNode } from "react";
import { NavLink } from "@/components/nav-link";
import { SignOutButton } from "@/components/sign-out";

/**
 * The paper desk every logged-in app sits on. The wordmark is the same mono
 * uppercase treatment as both homepage navs — one brand, three rooms.
 */
export function AppShell({
  areaLabel,
  nav,
  userName,
  notificationCount = 0,
  children,
  width = "default",
}: {
  areaLabel: string;
  nav: { href: string; label: string; badge?: number }[];
  userName: string;
  notificationCount?: number;
  children: ReactNode;
  /** "wide" for the admin console — the densest surface earns more columns. */
  width?: "default" | "wide";
}) {
  const container = width === "wide" ? "max-w-[1220px]" : "max-w-6xl";
  const hrefs = nav.map((n) => n.href);

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="sticky top-0 z-40 border-b border-[#14161A]/10 bg-[#F7F6F3]/90 backdrop-blur-sm">
        <div className={`mx-auto flex h-14 w-full ${container} items-center justify-between gap-4 px-5`}>
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex shrink-0 items-center gap-3">
              <Link
                href="/"
                className="whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.22em] text-[#14161A]"
              >
                Second Shift
              </Link>
              <span className="rounded-[3px] border border-[#14161A]/20 px-1.5 py-[3px] font-mono text-[9px] uppercase leading-none tracking-[0.14em] text-[#5B6069]">
                {areaLabel}
              </span>
            </div>
            <nav className="flex items-center gap-1 overflow-x-auto">
              {nav.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  badge={item.badge}
                  exactSiblings={hrefs}
                />
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/notifications"
              className="relative inline-flex min-h-11 items-center rounded px-2 text-[12px] font-medium text-[#5B6069] transition-colors hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]"
            >
              Updates
              {notificationCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-[#A82318] px-1.5 py-0.5 font-mono text-[10px] leading-none text-white">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              ) : null}
            </Link>
            <span className="hidden font-mono text-[12px] text-[#5B6069] sm:block">{userName}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full ${container} px-5 py-7`}>{children}</main>
    </div>
  );
}
