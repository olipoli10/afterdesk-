import Link from "next/link";
import type { ReactNode } from "react";

/** Shared frame for login / register / VA application. */
export function AuthShell({
  title,
  sub,
  children,
  footer,
  aside,
}: {
  title: string;
  sub: string;
  children: ReactNode;
  footer: ReactNode;
  /** Short reassurance list shown beside the form on wide screens. */
  aside?: { title: string; body: string }[];
}) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5">
          <Link href="/" className="text-[15px] font-semibold tracking-[-0.02em] text-neutral-900">
            Second Shift
          </Link>
          <Link
            href="/"
            className="text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-900"
          >
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-5 py-12">
        <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-16">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.025em] text-neutral-900">{title}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{sub}</p>
            <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">{children}</div>
            <div className="mt-4 text-sm text-neutral-500">{footer}</div>
          </div>

          {aside && aside.length > 0 ? (
            <div className="hidden lg:block">
              <div className="space-y-6 border-l border-neutral-200 pl-8">
                {aside.map((item) => (
                  <div key={item.title}>
                    <h2 className="text-[14px] font-medium text-neutral-900">{item.title}</h2>
                    <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-neutral-500">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
