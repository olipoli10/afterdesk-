import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out";

export function AppShell({
  areaLabel,
  nav,
  userName,
  children,
}: {
  areaLabel: string;
  nav: { href: string; label: string; badge?: number }[];
  userName: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-7">
            <div className="flex items-baseline gap-2">
              <Link href="/" className="text-[15px] font-semibold tracking-[-0.02em] text-neutral-900">
                Second Shift
              </Link>
              <span className="tracking-label text-[10px] font-semibold uppercase text-neutral-400">
                {areaLabel}
              </span>
            </div>
            <nav className="flex items-center gap-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {item.label}
                  {item.badge !== undefined && item.badge > 0 ? (
                    <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-neutral-500 sm:block">{userName}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-7">{children}</main>
    </div>
  );
}
