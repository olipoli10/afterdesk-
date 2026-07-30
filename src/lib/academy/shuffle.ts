/**
 * Per-attempt exam scrambling.
 *
 * THE ATTACK IT CLOSES. A 12-question, 4-option exam is 4^12 — but the score
 * alone is a Mastermind oracle worth ~2.7 bits per attempt, and a reviewer
 * demonstrated a pass in a median of 8-10 submissions using nothing but random
 * consistent guesses. Two things made it cheap: the question and option order
 * was IDENTICAL on every attempt, so scores could be correlated position by
 * position; and every one of the first twelve courses happened to distribute
 * its answers a flat 3/3/3/3 across A/B/C/D, which collapses the space from
 * 16.7M to 369,600 for anyone who notices.
 *
 * Scrambling per attempt breaks the correlation the attack depends on: two
 * attempts no longer describe the same key, so their scores cannot be combined.
 *
 * THE ORDER IS NEVER TRUSTED TO THE CLIENT. It is derived from
 * (userId, courseSlug, attemptNo) — values the server already holds — so the
 * server recomputes the exact same permutation at grading time and the browser
 * never sends, and cannot influence, the mapping.
 */

/** FNV-1a — small, stable, and not security-sensitive (this is not a secret). */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — deterministic, uniform enough for shuffling twelve items. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over 0..n-1, seeded. */
function permute(n: number, seed: string): number[] {
  const next = rng(hash32(seed));
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export type ExamLayout = {
  /** Display slot -> canonical question index. */
  questions: number[];
  /** Per display slot: display option slot -> canonical option index. */
  options: number[][];
};

/**
 * The layout for one attempt. Deterministic in its three inputs, so the exam
 * page and the grader agree without exchanging anything.
 */
export function examLayout(
  userId: string,
  courseSlug: string,
  attemptNo: number,
  questionCount: number,
  optionCounts: number[]
): ExamLayout {
  const base = `${userId}:${courseSlug}:${attemptNo}`;
  const questions = permute(questionCount, `q:${base}`);
  const options = questions.map((canonical) =>
    permute(optionCounts[canonical], `o:${base}:${canonical}`)
  );
  return { questions, options };
}

/**
 * Map answers given in DISPLAY order back to canonical order, so grading can
 * run against the untouched answer key.
 *
 * `display[i]` is the option slot the worker picked in display slot i;
 * the result is indexed by canonical question with canonical option values.
 */
export function toCanonicalAnswers(layout: ExamLayout, display: number[]): number[] {
  const canonical = new Array<number>(layout.questions.length).fill(-1);
  layout.questions.forEach((questionIndex, slot) => {
    const picked = display[slot];
    const map = layout.options[slot];
    canonical[questionIndex] = map[picked] ?? -1;
  });
  return canonical;
}
