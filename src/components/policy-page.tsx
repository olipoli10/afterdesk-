import Link from "next/link";
import type { ReactNode } from "react";
import { TrustLinks } from "@/components/trust-links";

export function PolicyPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#14161A]">
      <header className="border-b border-black/10">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5">
          <Link href="/" className="font-mono text-xs uppercase tracking-[0.2em]">
            Second Shift
          </Link>
          <Link href="/how-it-works" className="text-sm text-[#5B6069] hover:text-[#14161A]">
            How it works
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#5B6069]">
          Trust center · Updated July 30, 2026
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-[#5B6069]">{intro}</p>
        <div className="prose-policy mt-10 space-y-9 text-[15px] leading-7 text-[#30343A]">
          {children}
        </div>
      </main>
      <footer className="border-t border-black/10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-sm">
          <TrustLinks />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#5B6069]">
            <span>Operated by Olivier Robert</span>
            <a href="mailto:support@secondshift.co" className="hover:text-[#14161A]">
              support@secondshift.co
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

