import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/logo";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { LangSwitch } from "@/components/lang-switch";
import { TrustLinks } from "@/components/trust-links";
import { publicCourseFull, PUBLISHED_COURSES, academyStats } from "@/lib/academy/public";
import { courseLook } from "@/lib/academy/look";
import { ACADEMY_I18N, ACADEMY_LANGS, academyLangOf } from "@/lib/i18n/academy";
import { SITE_URL } from "@/lib/site";

/* ─────────────────────────────────────────────────────────────────────────
   ONE COURSE, IN FULL, WITH NO ACCOUNT.

   This is the page the whole Academy strategy rests on. An audit found
   105,106 words of written teaching living behind a single URL; these pages
   are the addresses. Each one is a real document — every lesson, every
   section, in the initial HTML — because a course page that shows only titles
   is a listing, and listings do not rank against people who published the
   thing itself.

   WHAT IS AND IS NOT HERE: the exam is not. `publicCourseFull` never reads
   `exam`, so no answer key can reach this page regardless of what is written
   below. Which courses get a page at all is PUBLISHED_COURSES, an allowlist —
   the nine withheld courses are, near enough, the spec the QC queue grades
   against, and a course added tomorrow is withheld until someone names it.

   The lesson bodies stay English in every locale, the same rule the exam
   artifact follows: the courses really are taught in English, and a reader
   deserves to know that before they commit an evening. Only the page's own
   voice translates.
   ───────────────────────────────────────────────────────────────────────── */

export const dynamic = "force-static";

export function generateStaticParams() {
  return PUBLISHED_COURSES.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = publicCourseFull(slug);
  if (!course) return {};
  const stats = academyStats();
  return {
    title: `${course.title}: free course with a certificate`,
    description: `${course.summary} ${course.lessonCount} lessons, about ${course.minutes} minutes, then a ${stats.questionCount}-question exam. Free, with a permanent certificate.`,
    alternates: { canonical: `/academy/${slug}` },
    openGraph: {
      title: `${course.title}: free virtual assistant course`,
      description: course.tagline,
      url: `${SITE_URL}/academy/${slug}`,
    },
  };
}

export default async function CoursePublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ slug }, sp, cookieStore] = await Promise.all([params, searchParams, cookies()]);
  const course = publicCourseFull(slug);
  if (!course) notFound();

  const lang = academyLangOf(sp.lang ?? cookieStore.get("ss-lang-worker")?.value);
  const t = ACADEMY_I18N[lang];
  const stats = academyStats();
  const look = courseLook(course.track, course.slug);
  const machine = { lang: "en" as const };

  /* Course + BreadcrumbList. Everything here is true and checkable: no
     aggregateRating (there are no ratings), no offers (there is no price),
     no availableLanguage list (the teaching is English only). */
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Course",
        "@id": `${SITE_URL}/academy/${slug}#course`,
        name: course.title,
        description: course.summary,
        url: `${SITE_URL}/academy/${slug}`,
        inLanguage: "en",
        isAccessibleForFree: true,
        timeRequired: `PT${course.minutes}M`,
        educationalLevel: "Beginner",
        teaches: course.outcomes,
        provider: { "@id": `${SITE_URL}/#organization` },
        hasCourseInstance: [
          {
            "@type": "CourseInstance",
            courseMode: "online",
            courseWorkload: `PT${course.minutes}M`,
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Academy", item: `${SITE_URL}/academy` },
          { "@type": "ListItem", position: 2, name: course.title },
        ],
      },
    ],
  };

  return (
    <div lang={lang} className="overflow-x-clip bg-[#F7F6F3]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#F7F6F3]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/academy" className="text-[11px] sm:text-[13px]">
            <Wordmark tone="ink" />
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <LangSwitch
              path={`/academy/${slug}`}
              current={lang}
              options={ACADEMY_LANGS}
              tone="paper"
            />
            <Link
              href="/register/va"
              className="lift inline-flex min-h-11 items-center rounded-full bg-[#14161A] px-3 py-1 text-[12px] font-medium text-[#F7F6F3] hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] sm:px-4 sm:py-1.5 sm:text-[13px]"
            >
              {t.nav.apply}
            </Link>
          </div>
        </div>
      </header>

      {/* ── HEAD ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-black/8">
        <div aria-hidden className="paper-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto w-full max-w-[760px] px-6 pb-12 pt-10 sm:pt-14">
          <nav aria-label="Breadcrumb" className="mb-6">
            <Link
              href="/academy"
              className="-mx-2 inline-flex min-h-11 items-center px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#5B6069] transition-colors hover:text-[#14161A]"
            >
              ← {t.curriculum.label}
            </Link>
          </nav>

          <p
            className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: look.hue }}
          >
            <span
              aria-hidden
              className="h-[7px] w-[7px] rounded-full"
              style={{ backgroundColor: look.hue }}
            />
            {look.label}
          </p>
          <h1
            {...machine}
            className="mt-3 max-w-[20ch] text-[clamp(1.9rem,4.6vw,2.9rem)] font-semibold leading-[1.08] tracking-[-0.028em] text-[#14161A]"
          >
            {course.title}
          </h1>
          <p {...machine} className="mt-4 max-w-[58ch] text-[17px] leading-[1.6] text-[#5B6069]">
            {course.summary}
          </p>

          <dl className="mt-7 flex flex-wrap gap-x-9 gap-y-4">
            {[
              [String(course.lessonCount), t.stats.lessons],
              [`~${course.minutes}`, t.stats.minutes],
              [String(stats.questionCount), t.stats.questions],
            ].map(([n, label]) => (
              <div key={label}>
                <dd className="font-mono text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#14161A]">
                  {n}
                </dd>
                <dt className="mt-1.5 text-[12.5px] text-[#5B6069]">{label}</dt>
              </div>
            ))}
          </dl>

          <p className="mt-7 inline-flex flex-wrap items-center gap-x-3 gap-y-2 rounded-full border border-[#14161A]/15 px-4 py-2 font-mono text-[11.5px] uppercase tracking-[0.1em] text-[#5B6069]">
            <span>{t.hero.kill}</span>
          </p>
        </div>
      </section>

      {/* ── OUTCOMES ────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[760px] px-6 pt-12">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5B6069]">
          {t.curriculum.afterThisCourse}
        </h2>
        <ul {...machine} className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {course.outcomes.map((o, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-lg border border-[#14161A]/10 bg-white px-4 py-3 text-[14.5px] leading-relaxed text-[#14161A]"
            >
              <span
                aria-hidden
                className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-[2px] border"
                style={{ borderColor: look.hue }}
              />
              {o}
            </li>
          ))}
        </ul>
      </section>

      {/* ── THE LESSONS, IN FULL ─────────────────────────────────────────
          The whole point of the page. Every section body is in the initial
          HTML — no client JS, no accordion, nothing a crawler has to execute
          to read the teaching. */}
      <section className="mx-auto w-full max-w-[760px] px-6 pb-4 pt-14">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5B6069]">
          {t.curriculum.h2}
        </h2>

        <div className="mt-6 space-y-12">
          {course.lessons.map((lesson, li) => (
            <Reveal key={li} replay>
              <article id={`lesson-${li + 1}`} className="scroll-mt-20">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#14161A]/10 pb-2">
                  <span
                    aria-hidden
                    className="font-mono text-[13px] font-bold tabular-nums"
                    style={{ color: look.hue }}
                  >
                    {String(li + 1).padStart(2, "0")}
                  </span>
                  <h3
                    {...machine}
                    className="text-[20px] font-semibold tracking-[-0.018em] text-[#14161A]"
                  >
                    {lesson.title}
                  </h3>
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-[#5B6069]">
                    ~{lesson.minutes} min
                  </span>
                </div>

                <div {...machine} className="mt-5 space-y-5">
                  {lesson.sections.map((s, si) => (
                    <div key={si}>
                      <h4 className="text-[16px] font-semibold tracking-[-0.01em] text-[#14161A]">
                        {s.heading}
                      </h4>
                      <p className="mt-1.5 text-[15.5px] leading-[1.72] text-[#14161A]/90">
                        {s.body}
                      </p>
                    </div>
                  ))}
                </div>

                <div
                  className="mt-5 rounded-lg px-4 py-3.5"
                  style={{ backgroundColor: look.tint }}
                >
                  <p
                    className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: look.hue }}
                  >
                    {t.remember}
                  </p>
                  <ul {...machine} className="mt-2 space-y-1.5">
                    {lesson.keyPoints.map((k, ki) => (
                      <li
                        key={ki}
                        className="flex gap-2.5 text-[14px] leading-relaxed text-[#14161A]"
                      >
                        <span
                          aria-hidden
                          className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-[2px]"
                          style={{ backgroundColor: look.hue }}
                        />
                        {k}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── THE EXAM, DESCRIBED BUT NOT SHOWN ───────────────────────────── */}
      <section className="border-y border-black/8 bg-[#0A0B0D]">
        <div className="mx-auto w-full max-w-[760px] px-6 py-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8A9099]">
            {t.deal.steps[1]?.[0] ?? "The exam"}
          </p>
          <h2 className="mt-2 max-w-[22ch] text-[26px] font-semibold tracking-[-0.02em] text-[#F7F6F3]">
            {t.closing.h2}
          </h2>
          <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-[#8A9099]">
            {t.deal.steps[1]?.[1]}
          </p>
          <p className="mt-6 inline-block border-l-2 border-[#F7F6F3]/30 pl-4 font-mono text-[12px] leading-relaxed text-[#F7F6F3]">
            {t.why.pledge}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/register/va"
              className="lift inline-flex h-12 items-center rounded-full bg-[#F7F6F3] px-6 text-[15px] font-medium text-[#14161A] hover:bg-white"
            >
              {t.closing.cta}
            </Link>
            <p className="font-mono text-[12px] text-[#8A9099]">{t.hero.micro}</p>
          </div>
        </div>
      </section>

      {/* ── SIBLINGS — crawl paths between the course pages ─────────────── */}
      <section className="mx-auto w-full max-w-[760px] px-6 py-14">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5B6069]">
          {t.curriculum.label}
        </h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {PUBLISHED_COURSES.filter((s) => s !== slug)
            .slice(0, 8)
            .map((s) => {
              const other = publicCourseFull(s);
              if (!other) return null;
              const ol = courseLook(other.track, other.slug);
              return (
                <li key={s}>
                  <Link
                    href={`/academy/${s}`}
                    className="flex min-h-11 items-center gap-2 rounded-lg border border-[#14161A]/10 bg-white px-4 py-2.5 text-[14.5px] text-[#14161A] transition-colors hover:border-[#14161A]/25"
                  >
                    <span
                      aria-hidden
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ backgroundColor: ol.hue }}
                    />
                    <span {...machine} className="min-w-0 truncate">
                      {other.title}
                    </span>
                  </Link>
                </li>
              );
            })}
        </ul>
        <p className="mt-5">
          <Link
            href="/academy"
            className="font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-[5px] transition-colors hover:decoration-[#14161A]"
          >
            {t.curriculum.h2}
          </Link>
        </p>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-black/8">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-6 py-8 text-[13px] text-[#5B6069]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Wordmark tone="ink" className="text-[11px]" />
            <Link href="/workers" className="transition-colors hover:text-[#14161A]">
              {t.footer.workers}
            </Link>
            <Link href="/how-it-works" className="transition-colors hover:text-[#14161A]">
              {t.footer.how}
            </Link>
          </div>
          <TrustLinks lang={lang} />
        </div>
      </footer>
    </div>
  );
}
