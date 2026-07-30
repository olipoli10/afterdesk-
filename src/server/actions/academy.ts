"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { courseFor } from "@/lib/academy/content";
import { gradeExam } from "@/lib/academy/grade";
import { EXAM_ATTEMPTS_PER_DAY, examWindowStart } from "@/lib/academy/types";

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
      wrong: number[];
      corrections: { index: number; correct: number; explain: string }[] | null;
      certified: boolean;
      attemptsLeftToday: number;
    }
  | { ok: false; error: string };

/**
 * Exam grading stays server-only. The advisory transaction lock serializes
 * attempts for one worker/course, so parallel requests cannot bypass the
 * rolling cap and brute-force the answer key.
 */
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

  const since = examWindowStart();
  const graded = gradeExam(questions, answers);
  const committed = await prisma.$transaction(async (tx) => {
    // $executeRaw, NOT $queryRaw: pg_advisory_xact_lock() returns void, and
    // $queryRaw asks the engine to deserialize the result columns — on a void
    // return that throws "Failed to deserialize column of type ''", which
    // would have failed EVERY exam submission. $executeRaw returns an affected
    // -row count and never deserializes. (The only other advisory lock in the
    // codebase is a PL/pgSQL PERFORM inside the ledger trigger, in
    // prisma/migrations/20260730001000_integrity_triggers/migration.sql.)
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`academy-exam:${user.id}:${slug}`}))
    `;
    const recent = await tx.examAttempt.count({
      where: { userId: user.id, courseSlug: slug, createdAt: { gte: since } },
    });
    if (recent >= EXAM_ATTEMPTS_PER_DAY) return { limited: true as const, recent };

    await tx.examAttempt.create({
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
      await tx.certification.upsert({
        where: { userId_courseSlug: { userId: user.id, courseSlug: slug } },
        create: { userId: user.id, courseSlug: slug },
        update: {},
      });
    }
    const certified =
      graded.passed ||
      (await tx.certification.findUnique({
        where: { userId_courseSlug: { userId: user.id, courseSlug: slug } },
        select: { id: true },
      })) !== null;
    return { limited: false as const, recent, certified };
  });

  if (committed.limited) {
    return {
      ok: false,
      error: `That's ${EXAM_ATTEMPTS_PER_DAY} attempts in 24 hours. Review the lessons — the exam will be here tomorrow.`,
    };
  }

  revalidatePath("/va/training");
  revalidatePath(`/va/training/${slug}`);
  revalidatePath("/va");

  return {
    ok: true,
    score: graded.score,
    total: graded.total,
    passed: graded.passed,
    /**
     * NEVER the per-question breakdown on a failure. Naming which questions
     * were missed is enough to solve the whole exam by elimination: answer
     * everything A, and every question ABSENT from the list has A as its
     * answer; B and C on the next two attempts pin down the rest, and
     * whatever is still wrong all three times is D. Three attempts — one
     * day's allowance — and the key is fully known without ever seeing it.
     * The score alone is the honest signal; the lessons are the remedy.
     */
    wrong: [],
    corrections: graded.passed
      ? graded.wrong.map((index) => ({
          index,
          correct: questions[index].correct,
          explain: questions[index].explain,
        }))
      : null,
    certified: committed.certified,
    attemptsLeftToday: Math.max(0, EXAM_ATTEMPTS_PER_DAY - committed.recent - 1),
  };
}
