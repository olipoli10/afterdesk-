/**
 * The Academy's content types. Content itself lives in code
 * (src/lib/academy/content.ts — server-only, because it carries the answer
 * keys); attempts and certificates live in Postgres (ExamAttempt,
 * Certification). This split means a database reset can never destroy the
 * curriculum, and a content edit can never orphan an attempt.
 */

/**
 * Five tracks, and the split is the Academy's argument.
 *
 *  foundations — how to work HERE. Take these first.
 *  category    — one per task kind in the pool; each teaches the exact standard
 *                that kind of delivery is judged against.
 *  craft       — the virtual-assistant toolkit: inbox, calendar, support, CRM,
 *                storefronts, decks. Work a VA does anywhere, not only here.
 *  ai          — working with AI tools to a professional standard: what is
 *                permitted, grounding, prompting past the first draft,
 *                measuring accuracy on a batch, and tools that ACT.
 *  career      — the profession itself: getting hired, proving your work,
 *                money and records, spotting scams, surviving the night shift.
 *
 * `ai` was split out of `craft` deliberately. It began as one card among
 * twelve, which is why no worker-facing page named it; a school that claims
 * to train AI-capable specialists has to show that training as its own
 * section, not bury it beside "slides and decks".
 *
 * The last three exist because the founder's goal is to be the reference for
 * Filipino VAs, not an onboarding funnel — a school that only teaches its own
 * chores is a funnel. Teaching the whole career is the reputation.
 */
export type CourseTrack = "foundations" | "category" | "craft" | "ai" | "career";

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
