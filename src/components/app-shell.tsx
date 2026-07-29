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
  children,
  width = "default",
}: {
  areaLabel: string;
  nav: { href: string; label: string; badge?: number }[];
  userName: string;
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
            <span className="hidden font-mono text-[12px] text-[#5B6069] sm:block">{userName}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full ${container} px-5 py-7`}>{children}</main>
    </div>
  );
}
