import Link from "next/link";
import { cookies } from "next/headers";
import { Wordmark } from "@/components/logo";
import { LangSwitch } from "@/components/lang-switch";
import { TrustLinks } from "@/components/trust-links";
import { SITE_LANGS, langAlternates } from "@/lib/i18n/langs";
import { INSIDE_I18N, insideLangOf } from "@/lib/i18n/inside";

/* ─────────────────────────────────────────────────────────────────────────
   /inside — the operating model, and the public truth registry.

   This page exists so the homepage can stay simple: the category line and
   the Console live there; the full method sentence and the honest split of
   what is live / in development / vision live HERE. It is entirely static —
   a Server Component with no client JavaScript.

   TRUTH BOUNDARY (ADR-022, Brain invariant 18): every AVAILABLE claim on
   this page must be supported by released, customer-visible behavior, not by
   code that merely exists somewhere. Recurring operations appear only under
   VISION. No internal task numbers, branch names or test counts — this page
   is for customers. test/public-site-truth.test.ts pins these rules.

   REGISTRY CHIP LAW (globals.css contrast law): on this night surface,
   green never carries text directly — the AVAILABLE chip is paper text over
   a green underline, the ledger's own "passed" treatment. IN DEVELOPMENT is
   amber text (#D98324 on night passes AA); VISION is muted. Every chip is a
   WORD, so color is never the only carrier.
   ───────────────────────────────────────────────────────────────────────── */

async function resolveLang(sp: { lang?: string }) {
  const jar = await cookies();
  return insideLangOf(sp.lang ?? jar.get("ss-lang-client")?.value);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const t = INSIDE_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/inside", sp.lang),
  };
}

/** One registry group. The chip styles are fixed per status, not per row. */
function RegistryGroup({
  label,
  items,
  chip,
}: {
  label: string;
  items: [string, string][];
  chip: "available" | "building" | "vision";
}) {
  const chipClass =
    chip === "available"
      ? "border-b-2 border-[#1E7F5C] pb-px text-[#F7F6F3]"
      : chip === "building"
        ? "text-[#D98324]"
        : "text-[#8A9099]";
  return (
    <div className="border-t border-white/10 pt-6">
      <h3 className={`inline-block font-mono text-[11px] uppercase tracking-[0.16em] ${chipClass}`}>
        {label}
      </h3>
      <ul className="mt-5 grid gap-5">
        {items.map(([claim, detail]) => (
          <li key={claim} className="grid gap-1 sm:grid-cols-[minmax(0,240px)_1fr] sm:gap-6">
            <p className="text-[14px] font-medium leading-[1.45] text-white">{claim}</p>
            <p className="text-[14px] leading-[1.6] text-[#9AA1AB]">{detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function InsidePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = INSIDE_I18N[lang];

  return (
    <div lang={lang} className="min-h-screen overflow-x-clip bg-[#0A0B0D] text-white">
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0A0B0D]/92 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 w-full max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="AfterDesk home">
            <Wordmark tone="paper" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LangSwitch path="/inside" current={lang} options={SITE_LANGS} tone="night" />
            <Link
              href="/how-it-works"
              className="hidden min-h-11 items-center text-[13px] text-[#9AA1AB] hover:text-white sm:inline-flex"
            >
              {t.header.how}
            </Link>
            <Link
              href="/login"
              className="hidden min-h-11 items-center text-[13px] text-[#9AA1AB] hover:text-white sm:inline-flex"
            >
              {t.header.signIn}
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-4 text-[13px] font-semibold text-[#14161A] hover:bg-white"
            >
              {t.header.start}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-6 pb-24 pt-14 sm:pt-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#767C86]">
          {t.kicker}
        </p>
        <h1 className="mt-5 max-w-[22ch] text-[clamp(2rem,5.2vw,3.4rem)] font-semibold leading-[1.06] tracking-[-0.032em]">
          {t.h1}
        </h1>
        <p className="mt-6 max-w-[64ch] text-[17px] leading-[1.65] text-[#9AA1AB]">{t.lede}</p>

        {/* ── THE OPERATING MODEL ─────────────────────────────────────── */}
        <section className="mt-16">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#767C86]">
            {t.model.h2}
          </h2>
          <ol className="mt-7 grid gap-7">
            {t.model.items.map(([label, body], i) => (
              <li key={label} className="grid grid-cols-[44px_1fr] gap-x-5">
                <span className="pt-0.5 font-mono text-[13px] tabular-nums text-[#5B6069]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[16px] font-medium text-white">{label}</p>
                  <p className="mt-1.5 max-w-[58ch] text-[14px] leading-[1.6] text-[#9AA1AB]">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── THE METHOD ──────────────────────────────────────────────── */}
        <section className="mt-16 border-t border-white/10 pt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#767C86]">
            {t.method.h2}
          </h2>
          <p className="mt-4 max-w-[66ch] text-[15px] leading-[1.7] text-[#C9CDD3]">
            {t.method.body}
          </p>
        </section>

        {/* ── THE TRUTH REGISTRY ──────────────────────────────────────── */}
        <section className="mt-16">
          <h2 className="text-[clamp(1.3rem,2.6vw,1.7rem)] font-semibold tracking-[-0.02em]">
            {t.registry.h2}
          </h2>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-[1.6] text-[#9AA1AB]">
            {t.registry.intro}
          </p>
          <div className="mt-9 grid gap-10">
            <RegistryGroup
              label={t.registry.available.label}
              items={t.registry.available.items}
              chip="available"
            />
            <RegistryGroup
              label={t.registry.building.label}
              items={t.registry.building.items}
              chip="building"
            />
            <RegistryGroup
              label={t.registry.vision.label}
              items={t.registry.vision.items}
              chip="vision"
            />
          </div>
        </section>

        {/* ── BOUNDARIES ──────────────────────────────────────────────── */}
        <section className="mt-16 border-t border-white/10 pt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#767C86]">
            {t.boundaries.h2}
          </h2>
          <p className="mt-4 max-w-[66ch] text-[14px] leading-[1.65] text-[#9AA1AB]">
            {t.boundaries.body}
          </p>
        </section>

        {/* ── CTA ─────────────────────────────────────────────────────── */}
        <section className="mt-16 border-t border-white/10 pt-10">
          <p className="text-[19px] font-medium tracking-[-0.01em] text-white">{t.cta.line}</p>
          <Link
            href="/register"
            className="lift mt-6 inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[15px] font-medium text-[#14161A] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {t.cta.button}
          </Link>
        </section>
      </main>

      <footer className="border-t border-white/8">
        <div className="mx-auto grid w-full max-w-[1120px] gap-4 px-6 py-7 sm:grid-cols-[auto_1fr] sm:items-center">
          <Wordmark tone="paper" />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#8A9099] sm:justify-end">
            <Link href="/" className="inline-flex min-h-11 items-center transition-colors hover:text-white">
              {t.footer.home}
            </Link>
            <Link href="/how-it-works" className="inline-flex min-h-11 items-center transition-colors hover:text-white">
              {t.footer.how}
            </Link>
            <Link href="/about" className="inline-flex min-h-11 items-center transition-colors hover:text-white">
              {t.footer.about}
            </Link>
          </div>
          <div className="text-[12px] sm:col-span-2 sm:border-t sm:border-white/8 sm:pt-4">
            <TrustLinks tone="night" lang={lang} />
          </div>
        </div>
      </footer>
    </div>
  );
}
