import "server-only";

/**
 * No such list existed before this file — verified by direct search before
 * writing it. "Escrow" is used openly throughout this codebase (src/lib/escrow.ts,
 * comments in settings.ts/admin-qc.ts/sweeps.ts); it simply never surfaces in
 * src/app or src/components today, which is incidental to the domain model,
 * not an enforced convention. This file is the first real one, scoped
 * initially to the AI assistant's own output (src/lib/assistant-ai.ts) — not
 * a codebase-wide lint rule.
 *
 * Known limit: literal-string matching catches the word, not a paraphrase
 * ("the money the platform holds until you approve" reads the same to a
 * client as "escrow" and this will not catch it). Treat this as a floor,
 * not a guarantee — the system prompt instruction is the first line of
 * defense, this is a backstop for the literal term only.
 */
export const FORBIDDEN_TERMS: readonly string[] = ["escrow"];

export function containsForbiddenVocabulary(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_TERMS.some((term) => lower.includes(term));
}
