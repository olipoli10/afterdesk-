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
 *
 * TWO SEPARATE GATES, and they do different jobs:
 *   - the PROJECTIONS below decide which FIELDS a public page can see;
 *   - PUBLISHED_COURSES decides which COURSES have a public page at all.
 * A course can be listed on /academy (title, summary, lesson titles) without
 * being published in full — that is the default, not an oversight.
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

/**
 * THE PUBLICATION LINE.
 *
 * An ALLOWLIST, never a denylist: a course added tomorrow is withheld until
 * someone deliberately names it here. Getting this backwards would publish the
 * grading spec by accident, which is the one mistake this file exists to make
 * impossible.
 *
 * The line is drawn by how much of a course is about THIS PLATFORM rather than
 * about the craft. Published courses teach skills a virtual assistant uses
 * anywhere — they are the reason someone finds us, and giving them away is the
 * whole strategy. Withheld courses are, near enough, the specification the QC
 * queue grades deliveries against: publishing them hands a would-be worker the
 * answers to the standard instead of teaching them to meet it, and hands a
 * competitor the operating manual.
 *
 * Withheld today, and why: va-foundations, business-english and
 * professional-habits (how to work HERE), plus data-cleanup, data-entry,
 * list-building, document-production, analysis and admin-coordination (each
 * one restates its category's dispute criteria almost line for line).
 * spreadsheet-essentials, research and writing are published despite being
 * older tracks because they teach generic method — sheets, source
 * verification, voice-matching — with barely any platform in them.
 *
 * Lessons stay whole here on purpose. A course page is the unit; publishing
 * 223 separate lesson pages would be 223 near-duplicate documents competing
 * for one intent.
 */
export const PUBLISHED_COURSES: readonly string[] = [
  // the toolkit — the trade itself
  "inbox-management",
  "calendar-scheduling",
  "customer-support",
  "crm-pipeline",
  "ecommerce-ops",
  "social-media-ops",
  "project-coordination",
  "slides-decks",
  "design-basics",
  "seo-content-ops",
  "ai-tools",
  "bookkeeping-basics",
  // the career — the reason this is a school and not a funnel
  "getting-hired",
  "portfolio-proof",
  "freelance-money",
  "spotting-scams",
  "night-shift-health",
  // generic method, low platform content
  "spreadsheet-essentials",
  "research",
  "writing",
];

export function isPublished(slug: string): boolean {
  return PUBLISHED_COURSES.includes(slug);
}

/**
 * A published course WITH its teaching text — the projection the course pages
 * render from. Deliberately separate from PublicCourse so widening one cannot
 * silently widen the other, and structurally incapable of carrying an exam:
 * `exam` is never read here, so `correct` and `explain` cannot leak no matter
 * what a caller does with the result.
 *
 * Returns null for anything not on the allowlist, so an unpublished slug is a
 * 404 rather than a page.
 */
export type PublicLesson = {
  title: string;
  minutes: number;
  sections: { heading: string; body: string }[];
  keyPoints: string[];
};

export type PublicCourseFull = PublicCourse & { lessons: PublicLesson[] };

export function publicCourseFull(slug: string): PublicCourseFull | null {
  if (!isPublished(slug)) return null;
  const c = allCourses().find((x) => x.slug === slug);
  if (!c) return null;
  return {
    slug: c.slug,
    title: c.title,
    track: c.track,
    tagline: c.tagline,
    summary: c.summary,
    lessonCount: c.lessons.length,
    minutes: courseMinutes(c),
    lessonTitles: c.lessons.map((l) => l.title),
    outcomes: c.outcomes,
    lessons: c.lessons.map((l) => ({
      title: l.title,
      minutes: l.minutes,
      sections: l.sections.map((s) => ({ heading: s.heading, body: s.body })),
      keyPoints: l.keyPoints,
    })),
  };
}

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
