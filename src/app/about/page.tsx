import Link from "next/link";
import { cookies } from "next/headers";
import { Reveal } from "@/components/reveal";
import { TrustLinks } from "@/components/trust-links";
import { LangSwitch } from "@/components/lang-switch";
import { SITE_LANGS, langAlternates } from "@/lib/i18n/langs";
import { ABOUT_I18N, docLangOf } from "@/lib/i18n/docs";

/* ─────────────────────────────────────────────────────────────────────────
   ABOUT US — the origin story, told in the company's own "we" voice.

   Deliberately corporate, not confessional: no first person, no "I noticed",
   no founder photo, no name anywhere on the site right now. A company can
   be small and still speak as "we" — most one-person companies do.

   It carries the SAME type ladder as /how-it-works, because the two pages
   are the same kind of object: a document. One opening statement several
   times body size, movement rules instead of a hairline under every row,
   and the three commitments numbered and set large. What it does NOT carry
   is the protocol's drawing — this page has no process to draw, and a
   decorative diagram here would be exactly the flatness-with-extra-steps
   the redesign exists to remove.

   Four languages, like every other public page: the story of why Filipino
   specialists get treated badly is the last story that should only be
   readable in English.
   ───────────────────────────────────────────────────────────────────────── */

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
  const t = ABOUT_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/about", sp.lang),
  };
}

export default async function AboutPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = ABOUT_I18N[lang];

  return (
    <div lang={lang} className="min-h-screen overflow-x-clip bg-[#F7F6F3]">
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#F7F6F3]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[900px] items-center justify-between gap-3 px-6">
          <Link
            href="/"
            className="whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.22em] text-[#14161A]"
          >
            Second Shift
          </Link>
          <div className="flex items-center gap-3 text-[13px] font-medium sm:gap-5">
            <LangSwitch path="/about" current={lang} options={SITE_LANGS} tone="paper" />
            <Link
              href="/how-it-works"
              className="text-[#5B6069] transition-colors hover:text-[#14161A]"
            >
              {t.nav.how}
            </Link>
            <Link
              href="/"
              className="hidden text-[#5B6069] transition-colors hover:text-[#14161A] sm:block"
            >
              {t.nav.client}
            </Link>
            <Link
              href="/workers"
              className="hidden text-[#5B6069] transition-colors hover:text-[#14161A] sm:block"
            >
              {t.nav.workers}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-6 pb-24 pt-14 sm:pt-20">
        {/* ── DOCKET ────────────────────────────────────────────────────── */}
        <p className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5B6069]">
          <span className="whitespace-nowrap">{t.kicker}</span>
          <i aria-hidden className="h-px flex-auto bg-[#14161A]/12" />
        </p>

        {/* ── THE OPENING STATEMENT ─────────────────────────────────────── */}
        <h1 className="mt-7 max-w-[18ch] text-[clamp(2.1rem,6vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.032em] text-[#14161A]">
          {t.h1}
        </h1>
        <p className="mt-7 max-w-[52ch] text-[19px] leading-[1.5] text-[#5B6069]">
          {t.lede}
        </p>

        {/* ── MOVEMENT I — the problem, both sides ──────────────────────── */}
        <hr className="mt-16 border-0 border-t border-[#14161A]/12" />
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5B6069]">
          {t.problemHead}
        </p>

        {/* No cards. Each side gets a heading at heading size and its own
            column, so the two problems read as two arguments rather than
            two boxes of the same grey. */}
        <Reveal className="mt-8">
          <div className="grid gap-10 sm:grid-cols-2 sm:gap-12">
            {t.problem.map(([side, body]) => (
              <section key={side}>
                <h2 className="text-[clamp(1.15rem,2.4vw,1.4rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-[#14161A]">
                  {side}
                </h2>
                <p className="mt-3 max-w-[46ch] text-[16px] leading-[1.65] text-[#5B6069]">
                  {body}
                </p>
              </section>
            ))}
          </div>
        </Reveal>

        {/* The turn. Set in ink at reading size — this is the sentence the
            whole page exists to land, and it used to be the same 14px grey
            as everything around it. */}
        <Reveal className="mt-10">
          <p className="max-w-[58ch] border-l-2 border-[#14161A]/25 pl-5 text-[17px] leading-[1.6] text-[#14161A]">
            {t.bridge}
          </p>
        </Reveal>

        {/* ── MOVEMENT II — the solution ────────────────────────────────── */}
        <hr className="mt-16 border-0 border-t border-[#14161A]/12" />
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5B6069]">
          {t.solutionHead}
        </p>
        <p className="mt-6 max-w-[58ch] text-[17px] leading-[1.6] text-[#14161A]">
          {t.solutionLede}
        </p>

        <Reveal className="mt-10">
          <div>
            {t.solution.map(([label, body], i) => (
              <section
                key={label}
                className="mt-10 grid grid-cols-[52px_minmax(0,1fr)] gap-x-4 first:mt-0 sm:grid-cols-[92px_minmax(0,1fr)] sm:gap-x-8"
              >
                <p className="font-mono text-[26px] leading-[0.9] tabular-nums tracking-[-0.02em] text-[#5B6069] sm:text-[44px]">
                  {String(i + 1).padStart(2, "0")}
                  <i className="mt-1.5 block text-[11px] not-italic tracking-[0.14em]">
                    /0{t.solution.length}
                  </i>
                </p>
                <div>
                  <h2 className="text-[clamp(1.35rem,3vw,1.75rem)] font-semibold leading-[1.12] tracking-[-0.025em] text-[#14161A]">
                    {label}
                  </h2>
                  <p className="mt-2.5 max-w-[50ch] text-[16px] leading-[1.6] text-[#5B6069]">
                    {body}
                  </p>
                </div>
              </section>
            ))}
          </div>
        </Reveal>

        {/* ── MOVEMENT III — why the training is real ───────────────────
            Ties into the one asset that proves the problem above is real:
            the scam course, which is free to anyone whether or not they
            ever claim a task here. */}
        <hr className="mt-16 border-0 border-t border-[#14161A]/12" />
        <p className="mt-5 max-w-[46ch] font-mono text-[11px] uppercase tracking-[0.18em] text-[#5B6069]">
          {t.trainingHead}
        </p>
        <Reveal className="mt-6">
          <p className="max-w-[58ch] text-[17px] leading-[1.6] text-[#14161A]">
            {t.trainingA}
            <Link
              href="/academy/spotting-scams"
              className="font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 transition-colors hover:decoration-[#14161A]"
            >
              {t.trainingLink}
            </Link>
            {t.trainingB}
          </p>
        </Reveal>

        {/* ── BOOKEND ───────────────────────────────────────────────────── */}
        <Reveal className="mt-14">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[#0A0B0D] px-6 py-8">
            <p className="text-[18px] font-semibold tracking-[-0.02em]">
              <span className="text-[#767C86]">{t.bookend.dim} </span>
              <span className="text-white">{t.bookend.lit}</span>
            </p>
            <Link
              href="/register"
              className="lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-5 py-2.5 text-[14px] font-medium text-[#14161A] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {t.bookend.cta}
            </Link>
          </div>
        </Reveal>

        <p className="mt-10 font-mono text-[11px] text-[#5B6069]">
          {t.protocolNote}{" "}
          <Link
            href="/how-it-works"
            className="underline decoration-[#5B6069]/40 underline-offset-2 hover:text-[#14161A]"
          >
            {t.protocolLink}
          </Link>
          .
        </p>
      </main>

      <footer className="border-t border-black/8">
        <div className="mx-auto flex w-full max-w-[900px] flex-wrap items-center justify-between gap-4 px-6 py-6 text-[12px]">
          <span className="font-mono uppercase tracking-[0.16em] text-[#14161A]">
            Second Shift
          </span>
          <TrustLinks />
        </div>
      </footer>
    </div>
  );
}
