/**
 * TOKENS AND SEARCHES TO MONEY. Pure code, one table, no model involved.
 *
 * Everything is in MICRODOLLARS (1 USD = 1_000_000). Cents cannot hold this:
 * a Sonnet classification call runs about 5_000 micros, half a cent, which in
 * integer cents rounds to 0 or 1 and makes every total wrong. Cents appear at
 * display time and nowhere else.
 *
 * These are list prices, recorded so the number is reproducible, not
 * negotiated rates. An unknown model resolves to the most expensive tier
 * rather than to zero: an unmeasured cost that reads as free is the failure
 * mode that lets spend grow unnoticed.
 *
 * NO AI SDK IMPORT — same rule as pricing.ts and residual.ts.
 */

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

type Rate = {
  /** USD per million tokens. */
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
};

const MICROS_PER_USD = 1_000_000;

/** Anthropic list prices, USD per million tokens. */
const RATES: Record<string, Rate> = {
  "claude-opus-5": {
    inputPerMillion: 5,
    outputPerMillion: 25,
    cacheReadPerMillion: 0.5,
    cacheWritePerMillion: 6.25,
  },
  "claude-sonnet-5": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  "claude-haiku-4-5": {
    inputPerMillion: 1,
    outputPerMillion: 5,
    cacheReadPerMillion: 0.1,
    cacheWritePerMillion: 1.25,
  },
};

/** The tier an unrecognised model is charged at. Never zero. */
const FALLBACK_RATE: Rate = RATES["claude-opus-5"];

/** USD per web search, list price. */
const SEARCH_USD = 0.01;

/**
 * USD per web fetch. Anthropic's documented price IS zero — "no additional
 * charges beyond standard token costs", verified 2026-08-11 — so this zero is
 * a recorded list price, not an unknown resolving to free. The line exists so
 * the assumption is visible and so a future price change is a one-constant
 * edit that every reservation and every settlement picks up together.
 */
const FETCH_USD = 0;

function rateFor(model: string): Rate {
  if (Object.hasOwn(RATES, model)) return RATES[model];
  // Tolerate a dated suffix (claude-haiku-4-5-20251001) by longest prefix.
  const prefix = Object.keys(RATES)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? RATES[prefix] : FALLBACK_RATE;
}

export function costMicrosFor(model: string, tokens: TokenCounts): number {
  const rate = rateFor(model);
  const usd =
    (Math.max(0, tokens.inputTokens) * rate.inputPerMillion +
      Math.max(0, tokens.outputTokens) * rate.outputPerMillion +
      Math.max(0, tokens.cacheReadTokens) * rate.cacheReadPerMillion +
      Math.max(0, tokens.cacheWriteTokens) * rate.cacheWritePerMillion) /
    1_000_000;
  // Rounded UP: an under-reported cost is the one that lets spend drift.
  return Math.ceil(usd * MICROS_PER_USD);
}

export function searchCostMicros(searchCount: number): number {
  return Math.ceil(Math.max(0, searchCount) * SEARCH_USD * MICROS_PER_USD);
}

export function fetchCostMicros(fetchCount: number): number {
  return Math.ceil(Math.max(0, fetchCount) * FETCH_USD * MICROS_PER_USD);
}

/** For display only. Never used in a comparison or a stored amount. */
export function microsToUsdString(micros: number): string {
  return `$${(micros / MICROS_PER_USD).toFixed(2)}`;
}
