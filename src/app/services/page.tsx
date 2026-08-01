import Link from "next/link";
import { cookies } from "next/headers";
import { Wordmark } from "@/components/logo";
import { LangSwitch } from "@/components/lang-switch";
import { OFFERINGS } from "@/lib/offerings";
import { SITE_LANGS, langAlternates } from "@/lib/i18n/langs";
import { SERVICES_I18N, docLangOf } from "@/lib/i18n/services";

/* Entry point that helps a visitor pick which offering fits, not a
   replacement for either offering's own detailed page (src/app/page.tsx for
   one-off, /services/standing-capacity for the new mode). Built from
   src/lib/offerings.ts so a third offering is one array entry, not a
   restructure — offerings.ts stays the English slug/href source of truth,
   this map only carries the translated copy for each slug. */
const OFFERING_KEY: Record<string, "oneOff" | "standingCapacity"> = {
  "one-off": "oneOff",
  "standing-capacity": "standingCapacity",
};

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
  const t = SERVICES_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/services", sp.lang),
  };
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = SERVICES_I18N[lang];

  return (
    <div lang={lang} className="min-h-screen overflow-x-clip bg-[#0A0B0D]">
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0A0B0D]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-6">
          <Link href="/" className="text-[12px]">
            <Wordmark tone="paper" />
          </Link>
          <div className="flex items-center gap-3 text-[13px] font-medium sm:gap-5">
            <LangSwitch path="/services" current={lang} options={SITE_LANGS} tone="night" />
            <Link href="/login" className="text-[#8A9099] transition-colors hover:text-white">
              {t.header.signIn}
            </Link>
            <Link
              href="/register"
              className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[#14161A] hover:bg-white"
            >
              {t.header.getStarted}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1120px] px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
          {t.eyebrow}
        </p>
        <h1 className="mt-3 max-w-[24ch] text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
          {t.h1}
        </h1>
        <p className="mt-5 max-w-[52ch] text-[17px] leading-[1.5] text-[#9AA1AB]">{t.intro}</p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {OFFERINGS.map((offering) => {
            const copy = t.offerings[OFFERING_KEY[offering.slug]];
            return (
              <Link
                key={offering.slug}
                href={offering.href}
                className="lift group flex flex-col rounded-[10px] border border-white/10 bg-[#111317] p-6 transition-colors hover:border-white/25"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
                  {copy.audience}
                </p>
                <h2 className="mt-2 text-[20px] font-semibold text-white">{copy.title}</h2>
                <p className="mt-2 flex-1 text-[14px] leading-[1.55] text-[#9AA1AB]">
                  {copy.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[#F7F6F3]">
                  {t.learnMore}
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </Link>
            );
          })}
        </div>

        {/* Not another Offering card on purpose — these aren't things a
            client orders, they're what the OTHER side of the platform gets
            for free. Mixing them into the grid above (client-decision
            framing: "For a single task", "For ongoing work") would read as
            an odd, out-of-place item to a client browsing services. A
            separate, clearly-labeled panel says what it is without
            confusing either audience. */}
        <div className="mt-16 border-t border-white/8 pt-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
            {t.forSpecialists.eyebrow}
          </p>
          <h2 className="mt-2 max-w-[36ch] text-[20px] font-semibold text-white">
            {t.forSpecialists.h2}
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Link
              href="/academy"
              className="lift group flex flex-col rounded-[10px] border border-white/10 bg-[#111317] p-6 transition-colors hover:border-white/25"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
                {t.forSpecialists.academy.eyebrow}
              </p>
              <h3 className="mt-2 text-[18px] font-semibold text-white">
                {t.forSpecialists.academy.title}
              </h3>
              <p className="mt-2 flex-1 text-[14px] leading-[1.55] text-[#9AA1AB]">
                {t.forSpecialists.academy.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[#F7F6F3]">
                {t.forSpecialists.academy.cta}
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </Link>
            <Link
              href="/workers"
              className="lift group flex flex-col rounded-[10px] border border-white/10 bg-[#111317] p-6 transition-colors hover:border-white/25"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#767C86]">
                {t.forSpecialists.assistant.eyebrow}
              </p>
              <h3 className="mt-2 text-[18px] font-semibold text-white">
                {t.forSpecialists.assistant.title}
              </h3>
              <p className="mt-2 flex-1 text-[14px] leading-[1.55] text-[#9AA1AB]">
                {t.forSpecialists.assistant.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[#F7F6F3]">
                {t.forSpecialists.assistant.cta}
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
