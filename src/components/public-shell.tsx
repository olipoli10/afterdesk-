/* Phase 1.4C - the ONE public chrome. Every secondary page renders inside
   this shell; the homepage keeps its specialized Assembly nav but shares
   the same token family. Variants: "night" (onyx) and "paper".
   The shell carries the single Wordmark, the page nav, LangSwitch,
   Sign in/Portal, the CTA, the common footer and exactly one A2 concierge. */
import Link from "next/link";
import { LangSwitch } from "@/components/lang-switch";
import { TrustLinks } from "@/components/trust-links";
import { MobileNav } from "@/components/mobile-nav";
import { A2Concierge, type ConciergeCopy } from "@/app/_home/a2-concierge";
import { PUBLIC_SHELL_I18N, type SiteLang } from "@/lib/i18n/public-shell";
import { Wordmark } from "@/components/logo";

const NAV_ROUTES = [
  ["/services", "services"],
  ["/how-it-works", "how"],
  ["/inside", "inside"],
  ["/about", "about"],
  ["/workers", "workers"],
] as const;

export function PublicShell({
  variant,
  lang,
  path,
  portalHref,
  concierge,
  children,
}: {
  variant: "night" | "paper";
  lang: SiteLang;
  path: string;
  portalHref?: string;
  concierge: ConciergeCopy;
  children: React.ReactNode;
}) {
  const t = PUBLIC_SHELL_I18N[lang];
  const night = variant === "night";
  const bg = night ? "bg-[#08090B] text-[#F7F6F3]" : "bg-[#F7F6F3] text-[#14161A]";
  const hairline = night ? "border-white/10" : "border-black/10";
  const dim = night ? "text-[#8a919e]" : "text-[#5B6069]";
  const hover = night ? "hover:text-[#E2C486]" : "hover:text-[#14161A]";
  const active = night ? "text-[#E2C486]" : "text-[#14161A] underline underline-offset-8 decoration-[#C9A76A]";

  return (
    <div lang={lang} className={`min-h-screen overflow-x-clip ${bg}`}>
      {/* the same header family as the homepage: large wordmark at 17px/640,
          mono utilities, anchors right - one visible wordmark, everywhere */}
      <div className={`sticky top-0 z-50 border-b ${hairline} ${night ? "bg-[#08090B]/90" : "bg-[#F7F6F3]/90"} backdrop-blur-md`}>
        <div className="mx-auto flex min-h-16 w-full max-w-[1180px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2 sm:px-6">
          <Link
            href="/"
            className="text-[1.0625rem] font-[640] tracking-[-0.02em] text-inherit no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C486]"
          >
            <Wordmark tone={night ? "paper" : "ink"} />
          </Link>
          <span className={`order-3 flex basis-full items-center gap-4 font-mono text-[11px] uppercase tracking-[0.16em] ${dim} md:order-none md:basis-auto`}>
            {portalHref ? (
              <Link href={portalHref} className={`transition-colors ${hover}`}>{t.portal}</Link>
            ) : (
              <Link href="/login" className={`transition-colors ${hover}`}>{t.signIn}</Link>
            )}
            <LangSwitch path={path} current={lang} options={[
              { code: "en" as SiteLang, label: "EN" },
              { code: "fr" as SiteLang, label: "FR" },
              { code: "es" as SiteLang, label: "ES" },
              { code: "tl" as SiteLang, label: "FIL" },
            ]} tone={night ? "night" : "paper"} />
          </span>
          <nav className="ml-auto flex items-center gap-5" aria-label="Site">
            {NAV_ROUTES.map(([href, key]) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                className={`hidden text-[0.875rem] no-underline transition-colors md:inline ${path === href ? active : `${dim} ${hover}`}`}
              >
                {t.nav[key]}
              </Link>
            ))}
            <MobileNav
              label={t.menu}
              closeLabel={t.closeMenu}
              night={night}
              currentPath={path}
              items={NAV_ROUTES.map(([href, key]) => ({ href, text: t.nav[key] }))}
            />
            <Link
              href="/register"
              className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 font-mono text-[0.71875rem] uppercase tracking-[0.06em] no-underline transition-colors ${
                night
                  ? "border-white/15 text-[#8a919e] hover:border-[#C9A76A] hover:text-[#E2C486]"
                  : "border-black/20 text-[#5B6069] hover:border-[#C9A76A] hover:text-[#14161A]"
              }`}
            >
              <span aria-hidden className="mr-2 inline-block h-1 w-1 rounded-full bg-[#C9A76A]" />
              {t.cta}
            </Link>
          </nav>
        </div>
      </div>

      <main>{children}</main>

      <footer className={`border-t ${hairline}`}>
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 px-6 py-8">
          <p className={`font-mono text-[11px] uppercase tracking-[0.16em] ${dim}`}>{t.footerNote}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
            <TrustLinks tone={night ? "night" : "paper"} lang={lang} />
          </div>
        </div>
      </footer>

      <A2Concierge copy={concierge} />
    </div>
  );
}
