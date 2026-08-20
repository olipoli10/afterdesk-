import Link from "next/link";
import type { ReactNode } from "react";
import { NavLink } from "@/components/nav-link";
import { SignOutButton } from "@/components/sign-out";
import { Wordmark } from "@/components/logo";

/**
 * The paper desk every logged-in app sits on. The wordmark is the same mono
 * uppercase treatment as both homepage navs — one brand, three rooms.
 *
 * `tone="night"` is the worker portal's dark variant (src/app/va) — the
 * client and admin desks stay "paper" (the default) unchanged. It reuses
 * the same #0A0B0D / #F7F6F3 / #8A9099 tokens as the marketing night side
 * rather than a fresh palette, and threads through to every child (Wordmark,
 * NavLink, SignOutButton) so nothing here is still hardcoded light-mode.
 *
 * LAYOUT — why the nav wraps to its own row below md:
 * it used to sit inline next to the wordmark inside a shrinkable flex box,
 * with the brand and the account actions both `shrink-0` on either side. At
 * 375px that left the nav a scroll container measuring literally ZERO pixels
 * wide holding 266px of links: every item was off-screen, so a tap either
 * did nothing or landed on the neighbouring item — "Available work" quietly
 * sent you back to the dashboard because you were really hitting "My work".
 * The nav is now `order-last w-full` on phones (its own full-bleed row under
 * a hairline) and only goes inline at md, where all three items provably fit.
 */
export function AppShell({
  areaLabel,
  nav,
  userName,
  notificationCount = 0,
  children,
  width = "default",
  tone = "paper",
  signedOutTo = "/",
  portal = false,
  utility,
  notificationLabel = "Notifications",
  signOutLabel = "Sign out",
  signingOutLabel = "Signing out…",
}: {
  areaLabel: string;
  nav: { href: string; label: string; badge?: number }[];
  userName: string;
  notificationCount?: number;
  children: ReactNode;
  /** "wide" for the admin console — the densest surface earns more columns. */
  width?: "default" | "wide";
  tone?: "paper" | "night";
  /** Client workspace treatment: ENDVERA plate, data hook and wider workbench. */
  portal?: boolean;
  /** Small contextual control such as the client language switcher. */
  utility?: ReactNode;
  notificationLabel?: string;
  signOutLabel?: string;
  signingOutLabel?: string;
  /**
   * Where signing out lands. Signing out should return you to the storefront
   * you came from, not to a login form you didn't ask for — so the worker
   * portal sends you to /workers and everyone else to the client homepage.
   */
  signedOutTo?: string;
}) {
  const container = width === "wide" ? "max-w-[1220px]" : "max-w-6xl";
  const hrefs = nav.map((n) => n.href);
  const night = tone === "night";
  const hairline = night ? "border-white/8" : "border-[#14161A]/10";

  return (
    <div
      data-endvera-portal={portal ? "" : undefined}
      className={night ? "relative min-h-screen overflow-hidden bg-[#0A0B0D]" : "min-h-screen bg-[#F7F6F3]"}
    >
      {/* The grid + glow every glass Card (src/components/ui.tsx) blurs
          against — without something textured behind it, a translucent
          card over a flat #0A0B0D reads almost identically to an opaque
          one. Fixed, not absolute: it has to stay put while the page
          scrolls, the same way the login modal's backdrop does. */}
      {night ? (
        <>
          <div aria-hidden className="night-grid pointer-events-none fixed inset-0" />
          <div
            aria-hidden
            className="glow-dusk pointer-events-none fixed -top-40 left-[8%] h-[560px] w-[760px]"
          />
        </>
      ) : null}
      <header
        className={
          night
            ? "sticky top-0 z-40 border-b border-white/8 bg-[#0A0B0D]/70 backdrop-blur-md"
            : "sticky top-0 z-40 border-b border-[#14161A]/10 bg-[#F7F6F3]/90 backdrop-blur-sm"
        }
      >
        <div className={`mx-auto flex w-full ${container} flex-wrap items-center gap-x-4 gap-y-0 px-5`}>
          <div className="flex h-14 shrink-0 items-center gap-3">
            {/* The wordmark leaves the app. It used to point at nav[0], the
                portal root — which is the page you are standing on every time
                you look at it, so the brand read as broken (a full RSC round
                trip, a loading flash, same route) and the app had no exit at
                all. The portal root keeps its own nav item right below. */}
            <Link href="/" className="inline-flex min-h-11 items-center text-[12px]">
              <Wordmark tone={night ? "paper" : "ink"} plate={portal} />
            </Link>
            {/* The area chip is redundant on a phone — the nav row right
                below already names the room — and it is the 54px that
                decides whether "Notifications" fits beside it. */}
            <span
              className={
                night
                  ? "hidden rounded-[3px] border border-white/20 px-1.5 py-[3px] font-mono text-[12px] uppercase leading-none tracking-[0.14em] text-[#8A9099] md:inline-block"
                  : "hidden rounded-[3px] border border-[#14161A]/20 px-1.5 py-[3px] font-mono text-[12px] uppercase leading-none tracking-[0.14em] text-[#5B6069] md:inline-block"
              }
            >
              {areaLabel}
            </span>
          </div>
          <nav
            className={`order-last -mx-5 flex w-[calc(100%+2.5rem)] items-center gap-1 overflow-x-auto border-t px-3 ${hairline} md:order-none md:mx-0 md:w-auto md:border-t-0 md:px-0`}
          >
            {nav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                badge={item.badge}
                exactSiblings={hrefs}
                tone={tone}
              />
            ))}
          </nav>
          <div className="ml-auto flex h-14 shrink-0 items-center gap-3">
            {utility}
            <Link
              href="/notifications"
              className={
                night
                  ? "relative inline-flex min-h-11 items-center rounded px-2 text-[12px] font-medium text-[#8A9099] transition-colors hover:text-[#F7F6F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  : "relative inline-flex min-h-11 items-center rounded px-2 text-[12px] font-medium text-[#5B6069] transition-colors hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]"
              }
            >
              {notificationLabel}
              {notificationCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-[#A82318] px-1.5 py-0.5 font-mono text-[12px] leading-none text-white">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              ) : null}
            </Link>
            <span
              className={
                night
                  ? "hidden font-mono text-[12px] text-[#8A9099] lg:block"
                  : "hidden font-mono text-[12px] text-[#5B6069] lg:block"
              }
            >
              {userName}
            </span>
            <SignOutButton
              tone={tone}
              home={signedOutTo}
              label={signOutLabel}
              busyLabel={signingOutLabel}
            />
          </div>
        </div>
      </header>
      <main className={`relative z-10 mx-auto w-full ${container} px-4 py-5 sm:px-5 sm:py-7`}>{children}</main>
    </div>
  );
}
