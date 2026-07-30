import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { courseFor } from "@/lib/academy/content";
import { courseLook } from "@/lib/academy/look";
import { Card, CardBody, LinkButton, SectionLabel } from "@/components/ui";

/**
 * One lesson. Reading surface, nothing else: sections, then the takeaways,
 * then prev/next. No completion tracking on purpose — the exam is the proof
 * of reading, and fake progress bars are the thing this academy exists to
 * not be.
 */

export const metadata = {
  title: "Lesson",
  robots: { index: false, follow: false },
};

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; n: string }>;
}) {
  await requireRole("VA");
  const { slug, n } = await params;

  const course = courseFor(slug);
  if (!course) notFound();

  const index = Number(n) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= course.lessons.length) notFound();

  const lesson = course.lessons[index];
  const look = courseLook(course.track, course.slug);
  const prev = index > 0 ? index : null;
  const next = index < course.lessons.length - 1 ? index + 2 : null;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4">
        <Link
          href={`/va/training/${slug}`}
          className="-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
        >
          ← {course.title}
        </Link>
      </p>

      <p
        className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
        style={{ color: look.hue }}
      >
        Lesson {String(index + 1).padStart(2, "0")} / {String(course.lessons.length).padStart(2, "0")}
      </p>
      <h1 className="mt-1.5 text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-[#14161A]">
        {lesson.title}
      </h1>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#5B6069]">
        ~{lesson.minutes} min
      </p>

      <div className="mt-5 space-y-5">
        {lesson.sections.map((s, i) => (
          <section key={i}>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-[#14161A]">
              {s.heading}
            </h2>
            <p className="mt-1.5 text-[15px] leading-[1.7] text-[#14161A]/90">{s.body}</p>
          </section>
        ))}
      </div>

      <section className="mt-7">
        <SectionLabel as="h2" className="mb-2.5">
          Remember
        </SectionLabel>
        <Card>
          <CardBody className="!py-3">
            <ul className="space-y-2">
              {lesson.keyPoints.map((k, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-[2px]"
                    style={{ backgroundColor: look.hue }}
                  />
                  <span className="text-sm leading-relaxed text-[#14161A]">{k}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </section>

      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[#14161A]/[0.08] pt-5">
        {prev !== null ? (
          <LinkButton href={`/va/training/${slug}/lesson/${prev}`} variant="secondary">
            ← Previous
          </LinkButton>
        ) : null}
        {next !== null ? (
          <LinkButton href={`/va/training/${slug}/lesson/${next}`}>Next lesson →</LinkButton>
        ) : (
          <LinkButton href={`/va/training/${slug}/exam`}>Take the exam →</LinkButton>
        )}
        <span className="ml-auto">
          <Link
            href={`/va/training/${slug}`}
            className="text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
          >
            Course overview
          </Link>
        </span>
      </div>
    </div>
  );
}
