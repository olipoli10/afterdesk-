import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared frame for login / register / VA application. Landing here from the
 * night homepage, the header itself is the sunrise: night nav becomes paper
 * nav, same mono wordmark — stepping INTO the brand, not off a cliff.
 */
export function AuthShell({
  title,
  sub,
  children,
  footer,
  aside,
  asideTone = "paper",
}: {
  title: string;
  sub: string;
  children: ReactNode;
  footer: ReactNode;
  /** Short reassurance list shown beside the form on wide screens. */
  aside?: { title: string; body: string }[];
  /** "night" folds a panel of the night homepage beside the form (client register). */
  asideTone?: "night" | "paper";
}) {
  const hasAside = aside && aside.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F6F3]">
      <header className="border-b border-[#14161A]/10 bg-[#F7F6F3]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5">
          <Link
            href="/"
            className="whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.22em] text-[#14161A]"
          >
            Second Shift
          </Link>
          <Link
            href="/"
            className="text-[13px] font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
          >
            ← Back to site
          </Link>
        </div>
      </header>

      <main
        className={
          hasAside
            ? "mx-auto flex w-full max-w-5xl flex-1 items-center px-5 py-12"
            : "mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 py-12"
        }
      >
        <div
          className={
            hasAside ? "grid w-full gap-10 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-16" : "w-full"
          }
        >
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#14161A]">{title}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[#5B6069]">{sub}</p>
            <div className="mt-6 rounded-lg border border-[#14161A]/10 bg-white p-5 shadow-[0_1px_2px_rgba(20,22,26,0.04)]">
              {children}
            </div>
            <div className="mt-4 text-sm text-[#5B6069]">{footer}</div>
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
