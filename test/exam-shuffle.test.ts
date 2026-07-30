import { describe, expect, it } from "vitest";
import { examLayout, toCanonicalAnswers } from "@/lib/academy/shuffle";

/**
 * The exam scramble is a SECURITY control, not a presentation flourish.
 *
 * A reviewer showed that a 12-question, 4-option exam whose order never
 * changed could be solved in a median of 8-10 submissions using nothing but
 * random consistent guesses: the score leaks ~2.7 bits per attempt, and with a
 * fixed layout those bits from different attempts describe the same key and
 * combine. Scrambling per attempt breaks the correlation, so the bits stop
 * adding up.
 *
 * These tests pin the three properties that has to rest on: the layout is a
 * genuine permutation (nothing lost, nothing duplicated), it is DETERMINISTIC
 * in its three server-held inputs so the grader reproduces the exam page's
 * paper without the browser sending anything, and it actually differs between
 * attempts.
 */

const QUESTIONS = 12;
const OPTIONS = Array.from({ length: QUESTIONS }, () => 4);

const layoutFor = (user: string, slug: string, attempt: number) =>
  examLayout(user, slug, attempt, QUESTIONS, OPTIONS);

describe("exam scramble", () => {
  it("is a true permutation of the questions", () => {
    const { questions } = layoutFor("u1", "data-cleanup", 0);
    expect([...questions].sort((a, b) => a - b)).toEqual(
      Array.from({ length: QUESTIONS }, (_, i) => i)
    );
  });

  it("is a true permutation of each question's options", () => {
    const { options } = layoutFor("u1", "data-cleanup", 0);
    expect(options).toHaveLength(QUESTIONS);
    for (const map of options) {
      expect([...map].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    }
  });

  it("is deterministic — the grader rebuilds the exam page's paper exactly", () => {
    expect(layoutFor("u1", "research", 2)).toEqual(layoutFor("u1", "research", 2));
  });

  it("differs between attempts, which is the whole point", () => {
    const a = layoutFor("u1", "research", 0);
    const b = layoutFor("u1", "research", 1);
    expect(a.questions).not.toEqual(b.questions);
  });

  it("differs between workers, so one worker's map tells another nothing", () => {
    const a = layoutFor("worker-a", "writing", 0);
    const b = layoutFor("worker-b", "writing", 0);
    expect(a.questions).not.toEqual(b.questions);
  });

  it("differs between courses for the same worker and attempt", () => {
    const a = layoutFor("u1", "writing", 0);
    const b = layoutFor("u1", "analysis", 0);
    expect(a.questions).not.toEqual(b.questions);
  });

  it("round-trips a perfect paper back to a perfect canonical answer set", () => {
    // The worker who knows every answer picks, in each display slot, the
    // display option that maps to that question's real answer.
    const key = [2, 0, 3, 1, 1, 2, 0, 3, 2, 1, 0, 3];
    const layout = layoutFor("u1", "data-cleanup", 0);
    const display = layout.questions.map((canonicalQ, slot) =>
      layout.options[slot].indexOf(key[canonicalQ])
    );
    expect(toCanonicalAnswers(layout, display)).toEqual(key);
  });

  it("round-trips an arbitrary answer sheet without losing a question", () => {
    const layout = layoutFor("u9", "seo-content-ops", 3);
    const display = [0, 1, 2, 3, 3, 2, 1, 0, 0, 2, 1, 3];
    const canonical = toCanonicalAnswers(layout, display);
    expect(canonical).toHaveLength(QUESTIONS);
    expect(canonical.every((v) => v >= 0 && v <= 3)).toBe(true);
  });

  it("grading the WRONG attempt's layout does not silently score correctly", () => {
    // Why submitExam re-counts attempts inside the lock and refuses on a
    // mismatch: a sheet answered under attempt 0 must not be graded as if it
    // were attempt 1, or a perfect paper turns into a random score.
    const key = [2, 0, 3, 1, 1, 2, 0, 3, 2, 1, 0, 3];
    const rendered = layoutFor("u1", "data-cleanup", 0);
    const display = rendered.questions.map((canonicalQ, slot) =>
      rendered.options[slot].indexOf(key[canonicalQ])
    );
    const wrong = toCanonicalAnswers(layoutFor("u1", "data-cleanup", 1), display);
    expect(wrong).not.toEqual(key);
  });

  it("spreads questions across many positions over successive attempts", () => {
    // A permutation that mostly returns the identity would leave the
    // correlation attack almost intact.
    const seen = new Set<number>();
    for (let attempt = 0; attempt < 24; attempt += 1) {
      seen.add(layoutFor("u1", "writing", attempt).questions[0]);
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});
