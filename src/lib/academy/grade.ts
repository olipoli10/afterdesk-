import { EXAM_PASS_SCORE, type ExamQuestion } from "./types";

/**
 * Pure grading — no I/O, so it is testable outside Next. The server action
 * wraps this with auth, rate limiting, and persistence.
 */
export function gradeExam(
  questions: ExamQuestion[],
  answers: number[]
): { score: number; total: number; passed: boolean; wrong: number[] } {
  const wrong: number[] = [];
  let score = 0;
  for (let i = 0; i < questions.length; i++) {
    if (answers[i] === questions[i].correct) score += 1;
    else wrong.push(i);
  }
  return { score, total: questions.length, passed: score >= EXAM_PASS_SCORE, wrong };
}
