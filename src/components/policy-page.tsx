import Link from "next/link";
import type { ReactNode } from "react";
import { TrustLinks } from "@/components/trust-links";
import { Wordmark } from "@/components/logo";
import { LangSwitch } from "@/components/lang-switch";
import { SITE_LANGS } from "@/lib/i18n/langs";
import { POLICY_NAV_HOW, POLICY_TRUST_CENTER, type DocLang } from "@/lib/i18n/legal";

/**
 * Shared shell for the four trust/policy pages (Security, Privacy, Terms,
 * Acceptable use). Until now this rendered English unconditionally — no
 * `lang` prop existed at all — while the footer link that leads here (see
 * TrustLinks) was already translated, so a French or Filipino reader landed
 * on a page that looked like it should be in their language and wasn't.
 *
 * `path` is required so the language switcher can build `${path}?lang=code`
 * links — each of the four pages passes its own route. Shares its cookie
 * (ss-lang-doc) and fallback chain with /about, /how-it-works and /services;
 * see docLangOf in src/lib/i18n/docs.ts and src/proxy.ts.
 */
export function PolicyPage({
  path,
  lang,
  title,
  intro,
  children,
}: {
  path: string;
  lang: DocLang;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div lang={lang} className="min-h-screen bg-[#F7F6F3] text-[#14161A]">
      <header className="border-b border-black/10">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-5">
          <Link href="/" className="text-xs">
            <Wordmark tone="ink" />
          </Link>
          <div className="flex items-center gap-4">
            <LangSwitch path={path} current={lang} options={SITE_LANGS} tone="paper" />
            <Link href="/how-it-works" className="text-sm text-[#5B6069] hover:text-[#14161A]">
              {POLICY_NAV_HOW[lang]}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#5B6069]">
          {POLICY_TRUST_CENTER[lang]}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-[#5B6069]">{intro}</p>
        <div className="prose-policy mt-10 space-y-9 text-[15px] leading-7 text-[#30343A]">
          {children}
        </div>
      </main>
      <footer className="border-t border-black/10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-sm">
          <TrustLinks lang={lang} />
          <a
            href="mailto:support@afterdesk.co"
            className="text-[#5B6069] hover:text-[#14161A]"
          >
            support@afterdesk.co
          </a>
        </div>
      </footer>
    </div>
  );
}
