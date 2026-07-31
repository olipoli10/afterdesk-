import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out";

/**
 * Shared frame for login / register / VA application. Landing here from the
 * night homepage, the header itself is the sunrise: night nav becomes paper
 * nav, same mono wordmark — stepping INTO the brand, not off a cliff.
 *
 * Same type ladder as /about and /how-it-works: a mono kicker names WHICH
 * door this is, and the heading is set at a size that competes with it
 * instead of sitting at the same 20px every other line of chrome uses. The
 * old version had no kicker and a title barely bigger than the "Back to
 * site" link beside it — every one of these four pages read as the same
 * undifferentiated form.
 */
export function AuthShell({
  kicker,
  title,
  sub,
  children,
  footer,
  aside,
  asideTone = "paper",
  exit = "site",
}: {
  /** Mono eyebrow naming the door — "Sign in" / "Client sign-up" / etc. */
  kicker: string;
  title: string;
  sub: string;
  children: ReactNode;
  footer: ReactNode;
  /** Short reassurance list shown beside the form on wide screens. */
  aside?: { title: string; body: string }[];
  /** "night" folds a panel of the night homepage beside the form (client register). */
  asideTone?: "night" | "paper";
  /**
   * How the header lets you leave. "sign-out" is for a page held open by a
   * signed-in but unverified session (/verify-email): for that session "/" is
   * a dead end — src/app/page.tsx redirects it to the portal and the portal's
   * requireUser bounces it straight back here, so a link home and the wordmark
   * both land on the page they were clicked from. Ending the session is the
   * only exit that goes anywhere, and it lands on the site all the same.
   */
  exit?: "site" | "sign-out";
}) {
  const hasAside = aside && aside.length > 0;
  const stuck = exit === "sign-out";

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F6F3]">
      <header className="border-b border-[#14161A]/10 bg-[#F7F6F3]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5">
          {stuck ? (
            <Wordmark className="text-[12px]" />
          ) : (
            <Link href="/" className="text-[12px]">
              <Wordmark />
            </Link>
          )}
          {stuck ? (
            <SignOutButton home="/" />
          ) : (
            <Link
              href="/"
              className="text-[13px] font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
            >
              ← Back to site
            </Link>
          )}
        </div>
      </header>

      <main
        className={
          hasAside
            ? "mx-auto flex w-full max-w-5xl flex-1 items-center px-5 py-12 sm:py-16"
            : "mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-5 py-12 sm:py-16"
        }
      >
        <div
          className={
            hasAside ? "grid w-full gap-10 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-16" : "w-full"
          }
        >
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#5B6069]">
              {kicker}
            </p>
            <h1 className="mt-2 text-[clamp(1.6rem,5vw,2rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-[#14161A]">
              {title}
            </h1>
            <p className="mt-2.5 max-w-[38ch] text-[15px] leading-relaxed text-[#5B6069]">{sub}</p>
            <div className="mt-7 overflow-hidden rounded-xl border border-[#14161A]/10 bg-white shadow-[0_1px_2px_rgba(20,22,26,0.04),0_16px_36px_-24px_rgba(20,22,26,0.22)]">
              <div className="p-5 sm:p-6">{children}</div>
              <div className="border-t border-[#14161A]/[0.07] bg-[#FBFAF8] px-5 py-3.5 text-[13px] leading-relaxed text-[#5B6069] sm:px-6">
                {footer}
              </div>
            </div>
          </div>

          {hasAside ? (
            asideTone === "night" ? (
              /* The page you just left, folded beside the form. */
              <div className="relative hidden overflow-hidden rounded-lg bg-[#0A0B0D] p-7 lg:block">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-20 left-1/4 h-[260px] w-[380px] rounded-full bg-[#1B2740] blur-[100px]"
                />
                <div className="relative divide-y divide-white/[0.06]">
                  {aside.map((item) => (
                    <div key={item.title} className="py-5 first:pt-0 last:pb-0">
                      <h2 className="text-[14px] font-medium text-[#F7F6F3]">{item.title}</h2>
                      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[#9AA1AB]">
                        {item.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* A payout-slip card — the worker came from the paper homepage. */
              <div className="hidden rounded-lg border border-[#14161A]/10 bg-white p-7 shadow-[0_1px_2px_rgba(20,22,26,0.04)] lg:block">
                <div className="divide-y divide-[#14161A]/[0.06]">
                  {aside.map((item, i) => (
                    <div key={item.title} className="py-5 first:pt-0 last:pb-0">
                      <span className="font-mono text-[10px] tabular-nums text-[#5B6069]">
                        0{i + 1}
                      </span>
                      <h2 className="mt-1 text-[14px] font-medium text-[#14161A]">{item.title}</h2>
                      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[#5B6069]">
                        {item.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : null}
        </div>
      </main>
    </div>
  );
}
