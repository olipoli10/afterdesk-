import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { courseFor, courseMinutes } from "@/lib/academy/content";
import { courseLook } from "@/lib/academy/look";
import { EXAM_PASS_SCORE, EXAM_QUESTION_COUNT, examWindowStart } from "@/lib/academy/types";
import { hasGuide } from "@/lib/training/content";
import { Card, LinkButton, SectionLabel } from "@/components/ui";

/**
 * One course — the overview a worker returns to between lessons. Everything
 * hangs off it: the lesson ladder, the field guide (category courses), the
 * category's real dispute criteria, and the exam door with the worker's own
 * state (best score, certificate, attempts).
 */

export const metadata = {
  title: "Academy",
  robots: { index: false, follow: false },
};

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireRole("VA");
  const { slug } = await params;

  const course = courseFor(slug);
  if (!course) notFound();

  const look = courseLook(course.track, course.slug);

  const [category, cert, best, recentAttempts] = await Promise.all([
    course.track === "category"
      ? prisma.taskCategory.findUnique({
          where: { slug },
          select: { name: true, disputeCriteria: true },
        })
      : Promise.resolve(null),
    prisma.certification.findUnique({
      where: { userId_courseSlug: { userId: user.id, courseSlug: slug } },
      select: { earnedAt: true },
    }),
    prisma.examAttempt.aggregate({
      where: { userId: user.id, courseSlug: slug },
      _max: { score: true },
      _count: true,
    }),
    prisma.examAttempt.count({
      where: { userId: user.id, courseSlug: slug, createdAt: { gte: examWindowStart() } },
    }),
  ]);

  const bestScore = best._max.score;
  const attempted = best._count > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4">
        <Link
          href="/va/training"
          className="-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
        >
          ← Academy
        </Link>
      </p>

      {/* head */}
      <div className="flex flex-wrap items-center gap-2">
        <p
          className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: look.hue }}
        >
          <span
            aria-hidden
            className="h-[7px] w-[7px] rounded-full"
            style={{ backgroundColor: look.hue }}
          />
          {look.label}
        </p>
        {cert ? (
          <span className="ml-auto rounded-[2px] border border-[#1B2740] px-1.5 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#1B2740]">
            Certified
          </span>
        ) : null}
      </div>
      <h1 className="mt-1.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#14161A]">
        {course.title}
      </h1>
      <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-[#5B6069]">
        {course.summary}
      </p>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#5B6069]">
        {course.lessons.length} lessons · ~{courseMinutes(course)} min ·{" "}
        {EXAM_QUESTION_COUNT}-question exam · pass at {EXAM_PASS_SCORE}/{EXAM_QUESTION_COUNT}
      </p>

      {/* outcomes */}
      <section className="mt-6">
        <SectionLabel as="h2" className="mb-2.5">
          After this course
        </SectionLabel>
        <Card>
          <ul className="divide-y divide-[#14161A]/[0.06]">
            {course.outcomes.map((o, i) => (
              <li key={i} className="flex gap-3 px-4 py-2.5">
                <span
                  aria-hidden
                  className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-[2px] border"
                  style={{ borderColor: look.hue }}
                />
                <span className="text-sm leading-relaxed text-[#14161A]">{o}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* the standard (category courses) */}
      {category?.disputeCriteria ? (
        <div className="mt-6 rounded-[4px] px-4 py-3.5" style={{ backgroundColor: look.tint }}>
          <p
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: look.hue }}
          >
            The standard your work is judged against
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#14161A]">
            {category.disputeCriteria}
          </p>
        </div>
      ) : null}

      {/* lessons */}
      <section className="mt-6">
        <SectionLabel as="h2" className="mb-2.5">
          The lessons
        </SectionLabel>
        <Card>
          <ol className="divide-y divide-[#14161A]/[0.06]">
            {course.lessons.map((l, i) => (
              <li key={i}>
                <Link
                  href={`/va/training/${slug}/lesson/${i + 1}`}
                  className="flex min-h-11 items-center gap-3.5 px-4 py-3 transition-colors duration-150 hover:bg-[#14161A]/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#14161A]"
                >
                  <span
                    aria-hidden
                    className="font-mono text-[13px] font-bold tabular-nums"
                    style={{ color: look.hue }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-[#14161A]">
                    {l.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#5B6069]">
                    {l.minutes} min
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* field guide (category courses) */}
      {course.track === "category" && hasGuide(slug) ? (
        <section className="mt-6">
          <Link
            href={`/va/training/${slug}/guide`}
            className="flex min-h-11 items-center gap-3 rounded-[4px] border border-dashed border-[#D5D2CB] px-4 py-3 transition-colors duration-150 hover:border-[#14161A]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[#14161A]">
                The field guide — keep it open while you work
              </span>
              <span className="mt-0.5 block text-sm leading-relaxed text-[#5B6069]">
                The hands-on version: method steps, tools, the pre-delivery checklist.
              </span>
            </span>
            <span aria-hidden className="shrink-0 font-mono text-sm text-[#5B6069]">
              →
            </span>
          </Link>
        </section>
      ) : null}

      {/* exam door */}
      <section className="mt-6">
        <SectionLabel as="h2" className="mb-2.5">
          The exam
        </SectionLabel>
        <Card>
          <div className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-sm leading-relaxed text-[#14161A]">
                {cert
                  ? "Certified. Retake it whenever you like — the certificate is permanent."
                  : attempted
                    ? `Best so far: ${bestScore}/${EXAM_QUESTION_COUNT}. Passing is ${EXAM_PASS_SCORE}.`
                    : `${EXAM_QUESTION_COUNT} questions on the lessons above. Pass at ${EXAM_PASS_SCORE}/${EXAM_QUESTION_COUNT} and the certificate is yours.`}
              </p>
              <span className="ml-auto shrink-0">
                <LinkButton
                  href={`/va/training/${slug}/exam`}
                  variant={cert ? "secondary" : "primary"}
                >
                  {cert ? "Retake the exam" : attempted ? "Try again" : "Take the exam"}
                </LinkButton>
              </span>
            </div>
            {recentAttempts > 0 && !cert ? (
              <p className="mt-2 text-xs leading-relaxed text-[#5B6069]">
                {Math.max(0, 3 - recentAttempts)} attempt
                {Math.max(0, 3 - recentAttempts) === 1 ? "" : "s"} left in the next 24 hours.
              </p>
            ) : null}
          </div>
        </Card>
      </section>

      {/* to the work */}
      {course.track === "category" && category ? (
        <p className="mt-7 border-t border-[#14161A]/[0.08] pt-5">
          <LinkButton href={`/va/pool?cat=${slug}`} variant="secondary">
            See open {category.name} tasks
          </LinkButton>
        </p>
      ) : null}
    </div>
  );
}
