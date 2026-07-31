import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Wordmark } from "@/components/logo";
import { Reveal } from "@/components/reveal";
import { LangSwitch } from "@/components/lang-switch";
import { publicCourses, academyStats, isPublished } from "@/lib/academy/public";
import { courseLook } from "@/lib/academy/look";
import { ACADEMY_I18N, ACADEMY_LANGS, academyLangOf } from "@/lib/i18n/academy";
import { SITE_URL } from "@/lib/site";
import { TrustLinks } from "@/components/trust-links";

/* ─────────────────────────────────────────────────────────────────────────
   THE PUBLIC ACADEMY — the shareable asset.
   The whole curriculum, visible with no account, so a worker can send the
   link to a friend and the friend sees the real thing instead of a login
   wall. This page is the growth mechanism: free training is only word of
   mouth if the training can be looked at.

   INDEXED on purpose — the only worker-side page besides /workers that is.
   Paper surface: this is a prospectus.

   SAFETY: everything here comes from lib/academy/public.ts, which is the
   narrow projection that cannot carry an exam answer key. Never import
   lib/academy/content.ts into this page.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * The one page on this site with a genuinely winnable search lane: the
 * incumbents on "free virtual assistant training" are small. So the title
 * leads with that exact phrase, and the numbers are the proof that separates
 * it from the course-mill listings around it.
 *
 * openGraph deliberately sets ONLY what differs from the root layout —
 * overriding siteName/type/locale here would drop them from the merge.
 */
export const metadata: Metadata = {
  title: "Free virtual assistant training: 29 courses, real exams, permanent certificates",
  description:
    "Free VA training for Filipino remote workers: 29 courses with written lessons, real exams and a certificate that stays yours. Inbox, calendar, data, research, writing, admin, and the career itself. No paid tier, no certificate fee, ever.",
  alternates: { canonical: "/academy" },
  openGraph: {
    title: "Free virtual assistant training: 29 courses with real exams",
    description:
      "Free VA courses, real exams, certificates that stay yours. Open before you are approved.",
    url: `${SITE_URL}/academy`,
  },
};

export default async function AcademyPublicPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const lang = academyLangOf(sp.lang ?? cookieStore.get("ss-lang-worker")?.value);
  const t = ACADEMY_I18N[lang];

  const courses = publicCourses();
  const stats = academyStats();

  /* Four groups, in the order a reader should meet them: how the platform
     works, the trade's toolkit, the career itself, then one per kind of work. */
  const groups: { name: string; note: string; list: typeof courses }[] = [
    {
      name: t.curriculum.foundations,
      note: t.curriculum.foundationsNote,
      list: courses.filter((c) => c.track === "foundations"),
    },
    {
      name: t.curriculum.craft,
      note: t.curriculum.craftNote,
      list: courses.filter((c) => c.track === "craft"),
    },
    {
      name: t.curriculum.career,
      note: t.curriculum.careerNote,
      list: courses.filter((c) => c.track === "career"),
    },
    {
      name: t.curriculum.byWork,
      note: t.curriculum.byWorkNote,
      list: courses.filter((c) => c.track === "category"),
    },
  ].filter((g) => g.list.length > 0);

  /* Course titles are the product, so they stay English in every language —
     but a screen reader must not read them in the page's voice locale. */
  const machine = { lang: "en" as const };

  /**
   * An ItemList of Course over the PUBLISHED courses only — Course list is
   * the one Google rich result this site currently qualifies for, and listing
   * a course here that has no page would be a broken promise to the crawler.
   * No aggregateRating, no offers: there are no ratings and there is no price.
   */
  const published = courses.filter((c) => isPublished(c.slug));
  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: published.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Course",
        "@id": `${SITE_URL}/academy/${c.slug}#course`,
        name: c.title,
        description: c.summary,
        url: `${SITE_URL}/academy/${c.slug}`,
        inLanguage: "en",
        isAccessibleForFree: true,
        timeRequired: `PT${c.minutes}M`,
        provider: { "@id": `${SITE_URL}/#organization` },
        hasCourseInstance: [
          { "@type": "CourseInstance", courseMode: "online", courseWorkload: `PT${c.minutes}M` },
        ],
      },
    })),
  };

  return (
    <div lang={lang} className="overflow-x-clip bg-[#F7F6F3]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listJsonLd) }}
      />
      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#F7F6F3]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/workers" className="text-[11px] sm:text-[13px]">
            <Wordmark tone="ink" />
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <LangSwitch path="/academy" current={lang} options={ACADEMY_LANGS} tone="paper" />
            <Link
              href="/login?audience=worker"
              className="hidden text-[13px] font-medium text-[#5B6069] transition-colors hover:text-[#14161A] sm:block"
            >
              {t.nav.signIn}
            </Link>
            <Link
              href="/register/va"
              className="lift inline-flex min-h-11 items-center rounded-full bg-[#14161A] px-3 py-1 text-[12px] font-medium text-[#F7F6F3] hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] sm:px-4 sm:py-1.5 sm:text-[13px]"
            >
              {t.nav.apply}
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-black/8">
        <div aria-hidden className="paper-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="hero-glow glow-paperlight pointer-events-none absolute -top-48 left-[6%] h-[560px] w-[820px]"
        />
        <div className="relative mx-auto w-full max-w-[1120px] px-6 pb-14 pt-16 sm:pt-20">
          <p className="anim-rise font-mono text-[11px] uppercase tracking-[0.16em] text-[#5B6069]">
            {t.hero.kill}
          </p>
          <h1 className="anim-rise d-1 mt-4 max-w-[18ch] text-[clamp(2rem,5.5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-[#14161A]">
            <span className="block">{t.hero.h1a}</span>
            <span className="block text-[#5B6069]">{t.hero.h1b}</span>
          </h1>
          <p className="anim-rise d-2 mt-5 max-w-[52ch] text-[17px] leading-[1.5] text-[#5B6069]">
            {t.hero.sub}
          </p>

          {/* The three real numbers — the scale, checkable against the list below. */}
          <dl className="anim-rise d-3 mt-9 flex flex-wrap gap-x-10 gap-y-5">
            {[
              [stats.courses, t.stats.courses],
              [stats.lessons, t.stats.lessons],
              [stats.questions, t.stats.questions],
            ].map(([n, label]) => (
              <div key={label as string}>
                <dd className="font-mono text-[38px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#14161A]">
                  {n}
                </dd>
                <dt className="mt-2 text-[13px] text-[#5B6069]">{label}</dt>
              </div>
            ))}
          </dl>

          <div className="anim-rise d-4 mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/register/va"
              className="lift inline-flex h-12 items-center rounded-full bg-[#14161A] px-6 text-[15px] font-medium text-[#F7F6F3] hover:bg-black"
            >
              {t.hero.cta}
            </Link>
            <p className="font-mono text-[12px] text-[#5B6069]">{t.hero.micro}</p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1120px] px-6 py-16">
        <Reveal replay>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
            {t.deal.label}
          </p>
          <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
            {t.deal.h2}
          </h2>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-2xl bg-[#14161A]/10 sm:grid-cols-3">
            {t.deal.steps.map(([step, body], i) => (
              <li key={step} className="bg-white p-6">
                <p className="font-mono text-[11px] tabular-nums text-[#5B6069]">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-2 text-[17px] font-medium tracking-[-0.01em] text-[#14161A]">
                  {step}
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-[#5B6069]">{body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      {/* ── THE CATCH — the credibility section, on night ────────────────── */}
      <section className="border-y border-black/8 bg-[#0A0B0D]">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-16">
          <Reveal>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8A9099]">
              {t.why.label}
            </p>
            <h2 className="max-w-[20ch] text-[26px] font-semibold tracking-[-0.02em] text-[#F7F6F3]">
              {t.why.h2}
            </h2>
            <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-[#8A9099]">
              {t.why.body}
            </p>
            <p className="mt-6 inline-block border-l-2 border-[#F7F6F3]/30 pl-4 font-mono text-[12px] leading-relaxed text-[#F7F6F3]">
              {t.why.pledge}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── THE CURRICULUM ──────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1120px] px-6 py-16">
        <Reveal replay>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
            {t.curriculum.label}
          </p>
          <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161A]">
            {t.curriculum.h2}
          </h2>
        </Reveal>

        {groups.map((group) => (
          <div key={group.name} className="mt-10">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[#14161A]/10 pb-2">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#14161A]">
                {group.name}
              </h3>
              <p className="text-[13px] text-[#5B6069]">{group.note}</p>
              <span className="ml-auto font-mono text-[12px] tabular-nums text-[#5B6069]">
                {group.list.length}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {group.list.map((c) => {
                const look = courseLook(c.track, c.slug);
                return (
                  <article
                    key={c.slug}
                    className="flex min-w-0 flex-col rounded-lg border border-[#14161A]/10 bg-white p-5"
                  >
                    <h4
                      {...machine}
                      className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.01em] text-[#14161A]"
                    >
                      <span
                        aria-hidden
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ backgroundColor: look.hue }}
                      />
                      {/* Published courses get a real anchor — before this the
                          29 cards were bare <article> elements and no course
                          anchor existed anywhere on the site. Withheld courses
                          stay listed but unlinked: the curriculum is honest
                          about its own size without publishing the grading
                          spec. */}
                      {isPublished(c.slug) ? (
                        <Link
                          href={`/academy/${c.slug}`}
                          className="min-w-0 underline decoration-[#14161A]/25 underline-offset-[3px] transition-colors hover:decoration-[#14161A]"
                        >
                          {c.title}
                        </Link>
                      ) : (
                        <span className="min-w-0">{c.title}</span>
                      )}
                    </h4>
                    <p {...machine} className="mt-2 text-[14px] leading-relaxed text-[#5B6069]">
                      {c.summary}
                    </p>

                    {/* The lesson list is the proof the course is real. */}
                    <ol
                      {...machine}
                      className="mt-3.5 space-y-1 border-t border-[#14161A]/[0.08] pt-3.5"
                    >
                      {c.lessonTitles.map((title, i) => (
                        <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                          <span
                            aria-hidden
                            className="font-mono text-[11px] tabular-nums text-[#9AA1AB]"
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 text-[#14161A]">{title}</span>
                        </li>
                      ))}
                    </ol>

                    <p className="mt-3.5 flex flex-wrap items-center gap-x-2 border-t border-[#14161A]/[0.08] pt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#5B6069]">
                      <span>
                        {t.curriculum.lessons(c.lessonCount)} · ~{c.minutes} min ·{" "}
                        {t.curriculum.exam}
                      </span>
                      {isPublished(c.slug) ? (
                        <Link
                          href={`/academy/${c.slug}`}
                          className="ml-auto whitespace-nowrap font-semibold text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 transition-colors hover:decoration-[#14161A]"
                        >
                          {t.curriculum.read} →
                        </Link>
                      ) : null}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* ── CLOSING ─────────────────────────────────────────────────────── */}
      <section className="border-t border-black/8 bg-white">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-16">
          <Reveal>
            <h2 className="max-w-[22ch] text-[clamp(1.6rem,3.4vw,2.2rem)] font-semibold leading-[1.15] tracking-[-0.025em] text-[#14161A]">
              {t.closing.h2}
            </h2>
            <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-[#5B6069]">
              {t.closing.body}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/register/va"
                className="lift inline-flex h-12 items-center rounded-full bg-[#14161A] px-6 text-[15px] font-medium text-[#F7F6F3] hover:bg-black"
              >
                {t.closing.cta}
              </Link>
              <p className="text-[13px] text-[#5B6069]">{t.closing.micro}</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-black/8">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-8 text-[13px] text-[#5B6069]">
          <Wordmark tone="ink" className="text-[11px]" />
          <Link href="/workers" className="transition-colors hover:text-[#14161A]">
            {t.footer.workers}
          </Link>
          <Link href="/how-it-works" className="transition-colors hover:text-[#14161A]">
            {t.footer.how}
          </Link>
          <Link href="/login?audience=worker" className="ml-auto transition-colors hover:text-[#14161A]">
            {t.footer.signIn}
          </Link>
          <div className="basis-full border-t border-black/8 pt-4 text-[12px]">
            <TrustLinks lang={lang} />
          </div>
        </div>
      </footer>
    </div>
  );
}
