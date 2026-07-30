import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { courseFor } from "@/lib/academy/content";
import { courseLook } from "@/lib/academy/look";
import {
  EXAM_ATTEMPTS_PER_DAY,
  EXAM_PASS_SCORE,
  examWindowStart,
  type PublicQuestion,
} from "@/lib/academy/types";
import { ExamForm } from "@/components/exam-form";
import { EmptyState, LinkButton } from "@/components/ui";

/**
 * The exam room. The server strips every question down to its PUBLIC
 * projection ({prompt, options}) before anything reaches the client — the
 * answer key stays in server-only code and grading happens in the action.
 * The rolling 24h attempt cap renders here as a closed door, not a
 * surprise after twelve answers.
 */

export const metadata = {
  title: "Exam",
  robots: { index: false, follow: false },
};

export default async function ExamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireRole("VA");
  const { slug } = await params;

  const course = courseFor(slug);
  if (!course) notFound();

  const look = courseLook(course.track, course.slug);

  const recent = await prisma.examAttempt.count({
    where: { userId: user.id, courseSlug: slug, createdAt: { gte: examWindowStart() } },
  });
  const attemptsLeft = Math.max(0, EXAM_ATTEMPTS_PER_DAY - recent);

  // RULE: the answer key never leaves the server.
  const questions: PublicQuestion[] = course.exam.questions.map((q) => ({
    prompt: q.prompt,
    options: q.options,
  }));

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
        Exam
      </p>
      <h1 className="mt-1.5 text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-[#14161A]">
        {course.title}
      </h1>
      <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-[#5B6069]">
        {questions.length} questions, pass at {EXAM_PASS_SCORE}/{questions.length}. Answers
        are graded on our side — take your time, the lessons stay open in another tab, and
        reading them again mid-exam is studying, not cheating.
      </p>

      <div className="mt-6">
        {attemptsLeft === 0 ? (
          <EmptyState
            title="Three attempts in 24 hours"
            body="The exam reopens tomorrow. That pause is deliberate — a certificate you brute-force isn't one. The lessons are the fastest way through."
            action={
              <LinkButton href={`/va/training/${slug}`} variant="secondary">
                Review the lessons
              </LinkButton>
            }
          />
        ) : (
          <ExamForm
            slug={slug}
            courseTitle={course.title}
            questions={questions}
            attemptsLeftToday={attemptsLeft}
            familyHue={look.hue}
          />
        )}
      </div>
    </div>
  );
}
