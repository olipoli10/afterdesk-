import "server-only";

/**
 * Claude Haiku 4.5 published rates, per million tokens. Cache reads are
 * priced at 10% of the input rate (Anthropic's standard prompt-caching
 * discount). Hardcoded rather than fetched — no billing API is wired up,
 * this is an estimate for the admin dashboard, not a reconciled invoice.
 * Update these two numbers if Anthropic's pricing changes.
 */
const INPUT_PER_MILLION_USD = 1.0;
const OUTPUT_PER_MILLION_USD = 5.0;
const CACHE_READ_PER_MILLION_USD = 0.1;

export function estimateCostUsd(tokens: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}): number {
  return (
    (tokens.inputTokens / 1_000_000) * INPUT_PER_MILLION_USD +
    (tokens.outputTokens / 1_000_000) * OUTPUT_PER_MILLION_USD +
    (tokens.cacheReadTokens / 1_000_000) * CACHE_READ_PER_MILLION_USD
  );
}
