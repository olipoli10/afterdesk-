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
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-tight text-neutral-900">
                Nightlexicon
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                {areaLabel}
              </span>
            </div>
            <nav className="flex items-center gap-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {item.label}
                  {item.badge !== undefined && item.badge > 0 ? (
                    <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
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
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
