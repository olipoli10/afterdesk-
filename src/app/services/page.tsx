import Link from "next/link";
import { cookies } from "next/headers";
import { Wordmark } from "@/components/logo";
import { LangSwitch } from "@/components/lang-switch";
import { TrustLinks } from "@/components/trust-links";
import { SpecialistLink } from "@/components/specialist-link";
import { OFFERINGS } from "@/lib/offerings";
import { SITE_LANGS, langAlternates } from "@/lib/i18n/langs";
import { SERVICES_I18N, docLangOf } from "@/lib/i18n/services";

async function resolveLang(sp: { lang?: string }) {
  const jar = await cookies();
  return docLangOf(sp.lang, jar.get("ss-lang-doc")?.value, jar.get("ss-lang-client")?.value, jar.get("ss-lang-worker")?.value);
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const t = SERVICES_I18N[await resolveLang(sp)];
  return { title: t.meta.title, description: t.meta.description, alternates: langAlternates("/services", sp.lang) };
}

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = SERVICES_I18N[lang];

  return (
    <div lang={lang} className="min-h-screen overflow-x-clip bg-[#0A0B0D] text-white">
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0A0B0D]/92 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 w-full max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="AfterDesk home"><Wordmark tone="paper" /></Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LangSwitch path="/services" current={lang} options={SITE_LANGS} tone="night" />
            <Link href="/login" className="hidden min-h-11 items-center text-[13px] text-[#9AA1AB] hover:text-white sm:inline-flex">{t.header.signIn}</Link>
            <Link href="/register" className="inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-4 text-[13px] font-semibold text-[#14161A] hover:bg-white">{t.header.getStarted}</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">{t.eyebrow}</p>
        <h1 className="mt-4 max-w-[21ch] text-[clamp(2.4rem,5.5vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.04em]">{t.h1}</h1>
        <p className="mt-6 max-w-[64ch] text-[17px] leading-[1.65] text-[#A9AFB8]">{t.intro}</p>

        {/*
          Two columns only when there are two offerings. The grid was written
          for the one-off / standing-capacity pair; with standing capacity
          unpublished a fixed two-column grid leaves a half-width card floating
          against dead space. Driven by the list rather than hardcoded, so
          restoring the offer restores the layout.
        */}
        <div
          className={`mt-12 grid gap-6 ${OFFERINGS.length > 1 ? "lg:grid-cols-2" : "max-w-[560px]"}`}
        >
          {OFFERINGS.map((offering, i) => {
            // Index join, not a slug lookup. The tuple type on the dict forces
            // every LANGUAGE to carry four cards, but it cannot force this list
            // to hold four rows: OFFERINGS is Offering[], and indexing a tuple
            // with a plain number types as always-defined while
            // noUncheckedIndexedAccess is off. A fifth row here would still
            // compile and crash at render, so the guard for THAT is the runtime
            // length assertion in test/standing-capacity-unpublished.test.ts.
            const copy = t.offerings[i];
            return (
              <Link key={offering.slug} href={offering.href} className="group flex min-h-[280px] flex-col rounded-xl border border-white/12 bg-[#111317] p-7 transition-transform hover:-translate-y-1 hover:border-white/25">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">{copy.audience}</p>
                <h2 className="mt-3 text-[24px] font-semibold">{copy.title}</h2>
                <p className="mt-4 flex-1 text-[15px] leading-[1.65] text-[#9AA1AB]">{copy.description}</p>
                <span className="mt-7 inline-flex items-center gap-2 text-[14px] font-semibold text-[#F7F6F3]">{t.learnMore}<span aria-hidden className="transition-transform group-hover:translate-x-1">→</span></span>
              </Link>
            );
          })}
        </div>

      </main>

      <footer className="border-t border-white/8">
        <div className="mx-auto grid w-full max-w-[1120px] gap-4 px-6 py-7 sm:grid-cols-[auto_1fr] sm:items-center"><Wordmark tone="paper" /><div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] sm:justify-self-end"><TrustLinks tone="night" lang={lang} /><SpecialistLink lang={lang} tone="night" /></div></div>
      </footer>
    </div>
  );
}
