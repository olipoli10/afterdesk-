import "server-only";
import { allCourses, courseMinutes } from "./content";
import {
  EXAM_ATTEMPTS_PER_DAY,
  EXAM_PASS_SCORE,
  EXAM_QUESTION_COUNT,
  type CourseTrack,
} from "./types";

/**
 * The PUBLIC projection of the curriculum — what the marketing pages are
 * allowed to show.
 *
 * This exists so the public academy page can never accidentally serialize an
 * answer key. `content.ts` holds `exam.questions[].correct` and `.explain`;
 * nothing in this module carries them, and nothing in it should ever be
 * widened to. If a public surface needs a new field, add it HERE explicitly
 * rather than passing a Course through.
 */

export type PublicCourse = {
  slug: string;
  title: string;
  track: CourseTrack;
  tagline: string;
  summary: string;
  lessonCount: number;
  minutes: number;
  /** Lesson titles only — the teaching text stays behind the account. */
  lessonTitles: string[];
  outcomes: string[];
};

export type AcademyStats = {
  courses: number;
  lessons: number;
  questions: number;
  minutes: number;
  passScore: number;
  questionCount: number;
  attemptsPerDay: number;
};

export function publicCourses(): PublicCourse[] {
  return allCourses().map((c) => ({
    slug: c.slug,
    title: c.title,
    track: c.track,
    tagline: c.tagline,
    summary: c.summary,
    lessonCount: c.lessons.length,
    minutes: courseMinutes(c),
    lessonTitles: c.lessons.map((l) => l.title),
    outcomes: c.outcomes,
  }));
}

/**
 * THE ONE PUBLISHED QUESTION.
 *
 * The /workers Academy chapter shows a real exam question — stem, options,
 * the mark, and the examiner's reason — to someone with no account. That is
 * the whole argument of that chapter: a certificate mill never shows you its
 * test, so showing ours answers "free training, what's the catch?" without a
 * sentence of marketing.
 *
 * It is read from the LIVE curriculum rather than copied into the marketing
 * page, so the caption "one real question from the Data cleanup exam" can
 * never quietly become false when the course is edited. An earlier draft of
 * that chapter hand-wrote a plausible-looking question whose marked answer
 * contradicted the course itself — this function exists so that cannot
 * happen again.
 *
 * COST, ACCEPTED DELIBERATELY: this burns one of the twelve Data cleanup
 * questions — a reader who memorises it starts that exam with a free point
 * out of the ten needed. That is the price of the demonstration and it is
 * worth it. Do not "fix" it by inventing a lookalike question.
 */
const SAMPLE = { course: "data-cleanup", index: 0 } as const;

export type PublicSample = {
  courseTitle: string;
  prompt: string;
  options: string[];
  /** Published on purpose — see the note above. */
  correct: number;
  explain: string;
};

export function publicSampleQuestion(): PublicSample | null {
  const course = allCourses().find((c) => c.slug === SAMPLE.course);
  const q = course?.exam.questions[SAMPLE.index];
  if (!course || !q) return null;
  return {
    courseTitle: course.title,
    prompt: q.prompt,
    options: q.options,
    correct: q.correct,
    explain: q.explain,
  };
}

export function academyStats(): AcademyStats {
  const all = allCourses();
  return {
    courses: all.length,
    lessons: all.reduce((s, c) => s + c.lessons.length, 0),
    questions: all.reduce((s, c) => s + c.exam.questions.length, 0),
    minutes: all.reduce((s, c) => s + courseMinutes(c), 0),
    passScore: EXAM_PASS_SCORE,
    questionCount: EXAM_QUESTION_COUNT,
    attemptsPerDay: EXAM_ATTEMPTS_PER_DAY,
  };
}
