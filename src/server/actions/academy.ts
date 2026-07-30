"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { courseFor } from "@/lib/academy/content";
import { gradeExam } from "@/lib/academy/grade";
import { EXAM_ATTEMPTS_PER_DAY, examWindowStart } from "@/lib/academy/types";

/**
 * Exam submission — the only door to a certificate.
 *
 * Grading happens HERE, against the answer key that lives in server-only
 * code: the client never receives a correct index, so the exam cannot be
 * read out of the page source. The rolling 24h attempt cap is what makes
 * that guarantee matter — without it the four-option format could be
 * brute-forced in an evening.
 *
 * Open to every VA regardless of approval status, on purpose: an applicant
 * who arrives at review already certified is exactly the funnel the academy
 * exists to build.
 */

const submitExamSchema = z.object({
  slug: z.string().min(1).max(60),
  answers: z.array(z.number().int().min(0).max(3)).max(50),
});

export type ExamResult =
  | {
      ok: true;
      score: number;
      total: number;
      passed: boolean;
      /** 0-based indices of missed questions (fail only — no key leakage). */
      wrong: number[];
      /** Full corrections, revealed ONLY on a passing attempt. */
      corrections: { index: number; correct: number; explain: string }[] | null;
      /** Certificate now held (this attempt or an earlier one). */
      certified: boolean;
      attemptsLeftToday: number;
    }
  | { ok: false; error: string };

export async function submitExam(input: unknown): Promise<ExamResult> {
  const user = await requireRole("VA");

  const parsed = submitExamSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid submission." };
  const { slug, answers } = parsed.data;

  const course = courseFor(slug);
  if (!course) return { ok: false, error: "This course does not exist." };

  const questions = course.exam.questions;
  if (answers.length !== questions.length) {
    return { ok: false, error: "Answer every question before submitting." };
  }

  // Rolling 24h cap — the anti-brute-force half of the answer-key secrecy.
  const since = examWindowStart();
  const recent = await prisma.examAttempt.count({
    where: { userId: user.id, courseSlug: slug, createdAt: { gte: since } },
  });
  if (recent >= EXAM_ATTEMPTS_PER_DAY) {
    return {
      ok: false,
      error: `That's ${EXAM_ATTEMPTS_PER_DAY} attempts in 24 hours. Review the lessons — the exam will be here tomorrow.`,
    };
  }

  const graded = gradeExam(questions, answers);

  await prisma.examAttempt.create({
    data: {
      userId: user.id,
      courseSlug: slug,
      score: graded.score,
      total: graded.total,
      passed: graded.passed,
      answers,
    },
  });

  if (graded.passed) {
    // First pass earns the certificate; later passes are just good practice.
    await prisma.certification.upsert({
      where: { userId_courseSlug: { userId: user.id, courseSlug: slug } },
      create: { userId: user.id, courseSlug: slug },
      update: {},
    });
  }

  const certified = graded.passed
    ? true
    : (await prisma.certification.findUnique({
        where: { userId_courseSlug: { userId: user.id, courseSlug: slug } },
        select: { id: true },
      })) !== null;

  revalidatePath("/va/training");
  revalidatePath(`/va/training/${slug}`);
  revalidatePath("/va");

  return {
    ok: true,
    score: graded.score,
    total: graded.total,
    passed: graded.passed,
    wrong: graded.passed ? [] : graded.wrong,
    corrections: graded.passed
      ? graded.wrong
          .concat() // passed attempts still list missed ones first, then nothing else to reveal
          .map((i) => ({ index: i, correct: questions[i].correct, explain: questions[i].explain }))
      : null,
    certified,
    attemptsLeftToday: Math.max(0, EXAM_ATTEMPTS_PER_DAY - recent - 1),
  };
}
