/**
 * The Academy's content types. Content itself lives in code
 * (src/lib/academy/content.ts — server-only, because it carries the answer
 * keys); attempts and certificates live in Postgres (ExamAttempt,
 * Certification). This split means a database reset can never destroy the
 * curriculum, and a content edit can never orphan an attempt.
 */

export type CourseTrack = "foundations" | "category";

export type LessonSection = { heading: string; body: string };

export type Lesson = {
  title: string;
  /** Honest reading time, minutes. */
  minutes: number;
  sections: LessonSection[];
  keyPoints: string[];
};

export type ExamQuestion = {
  prompt: string;
  options: string[];
  /** Index into options — NEVER ship this to the client. */
  correct: number;
  explain: string;
};

export type Course = {
  slug: string;
  title: string;
  track: CourseTrack;
  tagline: string;
  summary: string;
  outcomes: string[];
  lessons: Lesson[];
  exam: { questions: ExamQuestion[] };
};

/** The client-safe projection of a question — what the exam form receives. */
export type PublicQuestion = { prompt: string; options: string[] };

/** Passing bar: 10 of 12. */
export const EXAM_PASS_SCORE = 10;
export const EXAM_QUESTION_COUNT = 12;
/** Retake throttle: attempts per rolling 24 h, per course. */
export const EXAM_ATTEMPTS_PER_DAY = 3;

/** Start of the rolling attempt window — now minus 24 h. */
export function examWindowStart(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}
