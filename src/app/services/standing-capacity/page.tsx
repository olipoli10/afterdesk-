import Link from "next/link";
import { cookies } from "next/headers";
import { LangSwitch } from "@/components/lang-switch";
import { Wordmark } from "@/components/logo";
import { TrustLinks } from "@/components/trust-links";
import { SITE_LANGS, langAlternates } from "@/lib/i18n/langs";
import { docLangOf, STANDING_I18N } from "@/lib/i18n/services";
import { getSettings } from "@/lib/settings";

async function resolveLang(sp: { lang?: string }) {
  const jar = await cookies();
  return docLangOf(
    sp.lang,
    jar.get("ss-lang-doc")?.value,
    jar.get("ss-lang-client")?.value,
    jar.get("ss-lang-worker")?.value
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const t = STANDING_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/services/standing-capacity", sp.lang),
  };
}

export default async function StandingCapacityPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = STANDING_I18N[lang];
  // The advertised tiers are the ones accounts are actually opened at
  // (settings.standingCapacityTiers), never a hardcoded copy that can drift
  // when the admin edits the row. The per-tier blurbs are positional; if the
  // admin ever runs more tiers than blurbs, extras render hours-only.
  const hours = (await getSettings()).standingCapacityTiers.map((tier) => tier.hours);

  return (
    <div lang={lang} className="min-h-screen overflow-x-clip bg-[#0A0B0D] text-white">
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0A0B0D]/92 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 w-full max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="AfterDesk home">
            <Wordmark tone="paper" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/services" className="hidden min-h-11 items-center text-[13px] text-[#9AA1AB] hover:text-white md:inline-flex">
              {t.header.services}
            </Link>
            <LangSwitch path="/services/standing-capacity" current={lang} options={SITE_LANGS} tone="night" />
            <Link href="/login" className="hidden min-h-11 items-center text-[13px] text-[#9AA1AB] hover:text-white sm:inline-flex">
              {t.header.signIn}
            </Link>
            <Link href="/register" className="inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-4 text-[13px] font-semibold text-[#14161A] hover:bg-white">
              {t.header.cta}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-[960px] px-6 py-16 sm:py-24">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">{t.eyebrow}</p>
          <h1 className="mt-4 max-w-[19ch] text-[clamp(2.4rem,5.5vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.04em]">{t.h1}</h1>
          <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.65] text-[#A9AFB8]">{t.intro}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/register" className="inline-flex min-h-12 items-center rounded-full bg-[#F7F6F3] px-6 text-[15px] font-semibold text-[#14161A] hover:bg-white">
              {t.header.cta}
            </Link>
            <p className="max-w-[48ch] font-mono text-[12px] leading-[1.55] text-[#767C86]">{t.setup}</p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            {hours.map((tierHours, index) => (
              <article key={tierHours} className="rounded-xl border border-white/10 bg-[#111317] p-6">
                <p className="font-mono text-[30px] font-medium tabular-nums">
                  {tierHours}h<span className="text-[14px] text-[#767C86]">{t.week}</span>
                </p>
                {t.tiers[index] ? (
                  <p className="mt-3 text-[14px] leading-[1.55] text-[#9AA1AB]">{t.tiers[index]}</p>
                ) : null}
              </article>
            ))}
          </div>

          <div className="mt-14 grid gap-8 border-t border-white/8 pt-10 sm:grid-cols-3">
            {t.pillars.map((pillar) => (
              <article key={pillar.title}>
                <h2 className="text-[16px] font-semibold">{pillar.title}</h2>
                <p className="mt-2 text-[14px] leading-[1.6] text-[#9AA1AB]">{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-white/8 bg-[#111317]">
          <div className="mx-auto grid w-full max-w-[960px] gap-10 px-6 py-16 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">{t.fit.eyebrow}</p>
              <h2 className="mt-3 text-[24px] font-semibold">{t.fit.h2}</h2>
              <ul className="mt-5 space-y-3 text-[14px] leading-[1.55] text-[#A9AFB8]">
                {t.fit.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">{t.pricing.eyebrow}</p>
              <h2 className="mt-3 text-[24px] font-semibold">{t.pricing.h2}</h2>
              <p className="mt-5 text-[14px] leading-[1.65] text-[#A9AFB8]">{t.pricing.body}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8">
        <div className="mx-auto grid w-full max-w-[1120px] gap-4 px-6 py-7 sm:grid-cols-[auto_1fr] sm:items-center">
          <Wordmark tone="paper" />
          <div className="text-[12px] sm:justify-self-end"><TrustLinks tone="night" lang={lang} /></div>
        </div>
      </footer>
    </div>
  );
}
