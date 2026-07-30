import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { FAMILIES } from "@/lib/families";
import { allCourses, courseMinutes } from "@/lib/academy/content";
import { courseLook } from "@/lib/academy/look";
import type { Course } from "@/lib/academy/types";
import { PageTitle } from "@/components/ui";

/**
 * The Academy hub — the founder's flagship. Free courses, real exams, a
 * certificate per course; the funnel that makes this platform the reference
 * rather than a job board. Foundations first (how to work here at all),
 * then one course per task category, grouped under the same four families
 * and hues as the board.
 *
 * Open to every worker, approved or not: an applicant who arrives at review
 * already certified is the whole point.
 */

export const metadata = {
  title: "Academy",
  robots: { index: false, follow: false },
};

function CourseCard({
  course,
  certified,
  bestScore,
}: {
  course: Course;
  certified: boolean;
  bestScore: number | null;
}) {
  const look = courseLook(course.track, course.slug);
  return (
    <Link
      href={`/va/training/${course.slug}`}
      className="group flex min-w-0 flex-col rounded-[4px] border border-[#E4E2DC] bg-white px-4 py-3.5 transition-colors duration-150 hover:border-[#D5D2CB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ backgroundColor: look.hue }}
        />
        <span className="min-w-0 truncate text-[15.5px] font-semibold tracking-[-0.008em] text-[#14161A] group-hover:underline group-hover:decoration-[#14161A]/30 group-hover:underline-offset-2">
          {course.title}
        </span>
        {certified ? (
          <span className="ml-auto shrink-0 rounded-[2px] border border-[#1B2740] px-1.5 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#1B2740]">
            Certified
          </span>
        ) : bestScore !== null ? (
          <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[#5B6069]">
            best {bestScore}/12
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 text-sm leading-relaxed text-[#5B6069]">{course.tagline}</span>
      <span className="mt-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#5B6069]">
        {course.lessons.length} lessons · ~{courseMinutes(course)} min · exam + certificate
      </span>
    </Link>
  );
}

export default async function AcademyHubPage() {
  const user = await requireRole("VA");

  const [certs, bests] = await Promise.all([
    prisma.certification.findMany({
      where: { userId: user.id },
      select: { courseSlug: true },
    }),
    prisma.examAttempt.groupBy({
      by: ["courseSlug"],
      where: { userId: user.id },
      _max: { score: true },
    }),
  ]);
  const certified = new Set(certs.map((c) => c.courseSlug));
  const bestBySlug = new Map(bests.map((b) => [b.courseSlug, b._max.score ?? 0]));

  const courses = allCourses();
  const foundations = courses.filter((c) => c.track === "foundations");
  const categoryCourses = courses.filter((c) => c.track === "category");

  return (
    <>
      <PageTitle
        title="Academy"
        sub="Free courses, real exams, a certificate for each one you pass. Everything here is the same standard your deliveries are judged against — finish a course and your first task in that category should pass review on the first try."
      />

      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-[4px] bg-[#1B2740] px-4 py-3.5">
        <p className="font-mono text-[12px] text-[#C9D2E3]">
          <span className="font-bold tabular-nums text-white">{certified.size}</span>
          <span className="text-[#9AA9C4]"> / {courses.length} certificates earned</span>
        </p>
        <p className="text-[12px] text-[#9AA9C4]">
          Pass an exam at 10/12 to earn its certificate — it stays on your profile for good.
        </p>
      </div>

      <div className="space-y-8">
        {foundations.length > 0 ? (
          <section>
            <div className="mb-2.5 flex items-baseline gap-3">
              <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1B2740]">
                <span aria-hidden className="h-[3px] w-4 shrink-0 rounded-[2px] bg-[#1B2740]" />
                Start here — Foundations
              </p>
              <p className="text-[12px] text-[#5B6069]">How to work here, whatever you work on.</p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {foundations.map((c) => (
                <CourseCard
                  key={c.slug}
                  course={c}
                  certified={certified.has(c.slug)}
                  bestScore={bestBySlug.get(c.slug) ?? null}
                />
              ))}
            </div>
          </section>
        ) : null}

        {FAMILIES.map((f) => {
          const inFamily = categoryCourses.filter(
            (c) => courseLook(c.track, c.slug).key === f.key
          );
          if (inFamily.length === 0) return null;
          return (
            <section key={f.key}>
              <p
                className="mb-2.5 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: f.hue }}
              >
                <span
                  aria-hidden
                  className="h-[3px] w-4 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: f.hue }}
                />
                {f.label}
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {inFamily.map((c) => (
                  <CourseCard
                    key={c.slug}
                    course={c}
                    certified={certified.has(c.slug)}
                    bestScore={bestBySlug.get(c.slug) ?? null}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 max-w-[62ch] text-xs leading-relaxed text-[#5B6069]">
        Every course is free and always will be. Certificates are earned, never bought —
        which is exactly why they mean something.{" "}
        <Link
          href="/va/pool"
          className="font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 transition-colors duration-150 hover:decoration-[#14161A]"
        >
          The work is here when you&apos;re ready.
        </Link>
      </p>
    </>
  );
}
