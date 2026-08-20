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
  tone = "paper",
  backLabel = "Back to site",
  utility,
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
  /** Client entry uses the same onyx/graphite/amber room as ENDVERA. */
  tone?: "paper" | "endvera";
  /** Localized exit label and optional language control for client entry. */
  backLabel?: string;
  utility?: ReactNode;
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
  const endvera = tone === "endvera";

  return (
    <div
      data-endvera-auth={endvera ? "" : undefined}
      className={
        endvera
          ? "relative flex min-h-screen flex-col overflow-hidden bg-[#0A0B0D]"
          : "flex min-h-screen flex-col bg-[#F7F6F3]"
      }
    >
      {endvera ? (
        <>
          <div aria-hidden className="night-grid pointer-events-none fixed inset-0" />
          <div aria-hidden className="glow-dusk pointer-events-none fixed -top-48 left-[5%] h-[620px] w-[820px] opacity-60" />
        </>
      ) : null}
      <header className={endvera ? "relative z-10 border-b border-white/[0.08] bg-[#0A0B0D]/75 backdrop-blur-md" : "border-b border-[#14161A]/10 bg-[#F7F6F3]"}>
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5">
          {stuck ? (
            <Wordmark className="text-[12px]" tone={endvera ? "paper" : "ink"} plate={endvera} />
          ) : (
            <Link href="/" className="inline-flex min-h-11 items-center text-[12px]">
              <Wordmark tone={endvera ? "paper" : "ink"} plate={endvera} />
            </Link>
          )}
          <div className="flex items-center gap-2 sm:gap-3">
            {utility}
            {stuck ? (
              <SignOutButton home="/" />
            ) : (
              <Link
                href="/"
                className={
                  endvera
                    ? "inline-flex min-h-11 items-center text-[13px] font-medium text-[#A1A8B3] transition-colors duration-150 hover:text-[#E2C486]"
                    : "text-[13px] font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
                }
              >
                ← {backLabel}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main
        className={
          hasAside
            ? "relative z-10 mx-auto flex w-full max-w-5xl flex-1 items-center px-5 py-10 sm:py-16"
            : "relative z-10 mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-5 py-10 sm:py-16"
        }
      >
        <div
          className={
            hasAside ? "grid w-full gap-10 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-16" : "w-full"
          }
        >
          <div>
            <p className={`font-mono text-[12px] font-medium uppercase tracking-[0.16em] ${endvera ? "text-[#C9A76A]" : "text-[#5B6069]"}`}>
              {kicker}
            </p>
            <h1 className={`mt-2 text-[clamp(1.7rem,5vw,2.2rem)] font-semibold leading-[1.08] tracking-[-0.035em] ${endvera ? "text-[#F7F6F3]" : "text-[#14161A]"}`}>
              {title}
            </h1>
            <p className={`mt-2.5 max-w-[42ch] text-[15px] leading-relaxed ${endvera ? "text-[#A1A8B3]" : "text-[#5B6069]"}`}>{sub}</p>
            <div className={endvera ? "mt-7 overflow-hidden rounded-xl border border-[#6F4C29] bg-[#111317]/90 shadow-[inset_0_1px_0_rgba(226,196,134,0.08),0_24px_60px_-24px_rgba(0,0,0,0.72)] backdrop-blur-xl" : "mt-7 overflow-hidden rounded-xl border border-[#14161A]/10 bg-white shadow-[0_1px_2px_rgba(20,22,26,0.04),0_16px_36px_-24px_rgba(20,22,26,0.22)]"}>
              <div className="p-5 sm:p-6">{children}</div>
              <div className={endvera ? "border-t border-white/[0.08] bg-black/15 px-5 py-3.5 text-[13px] leading-relaxed text-[#A1A8B3] sm:px-6" : "border-t border-[#14161A]/[0.07] bg-[#FBFAF8] px-5 py-3.5 text-[13px] leading-relaxed text-[#5B6069] sm:px-6"}>
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
