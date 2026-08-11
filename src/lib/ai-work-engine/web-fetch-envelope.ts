/**
 * THE ECONOMIC ENVELOPE OF web.fetch@1, IN ONE PLACE, WITH ITS PROOF.
 *
 * NO IMPORTS, same discipline as primitive-vocabulary.ts and
 * automation-cost-policy.ts: the guard that consumes this runs inside the
 * primitive, the test that pins it runs without a database, and neither may
 * drag the provider SDK into a module graph to read a number.
 *
 * ── WHY THIS FILE EXISTS RATHER THAN THREE CONSTANTS ──
 *
 * The absolute cost ceiling of a fetch invocation is only true of a specific
 * IMPLEMENTATION: a model, its context window, its rate card, the tool
 * version, the output allowance and the fetch count. Scatter those across
 * three files and they drift apart silently — the arithmetic keeps passing
 * while the thing it describes has changed underneath. So they are ONE
 * object, the guard computes the bound FROM that object, and the test pins
 * the object and the bound together.
 *
 * ── THE THEOREM ──
 *
 * A fetched binary escapes `max_content_tokens` (the 1E-beta1 probe proved
 * it: a 444 KB PDF returned complete under a 2,000-token bound and billed
 * 53,754 input tokens), and its size belongs to whoever owns the page. So no
 * per-document figure can bound an attempt. What bounds it is the model:
 *
 *   1. no loop iteration can be INFERRED — and therefore billed as model
 *      input — beyond the model's context window;
 *   2. iterations are bounded by maxFetches + 1, because failed fetches count
 *      against `max_uses` (documented) and a model pass only follows a tool
 *      result. Our runner never continues a `pause_turn`, so no additional
 *      iteration can be bought by a continuation we do not send.
 *
 * Therefore one invocation cannot bill more than
 *
 *   (maxFetches + 1) x (contextWindow x worstInputRate + maxOutput x outputRate)
 *
 * Note what is NOT assumed: nothing here treats a context overflow as free.
 * The claim is only that tokens beyond the window cannot be inferred, and
 * what cannot run cannot be billed as model input.
 *
 * ── WHY THE RATE IS $2/MTok AND NOT $1.25 ──
 *
 * Anthropic's Haiku 4.5 row (pricing docs, read 2026-08-11) is: base input
 * $1, 5-minute cache write $1.25, 1-HOUR cache write $2, cache read $0.10,
 * output $5 per MTok. The bound is priced at $2 — the dearest per-token rate
 * in the entire row — even though this call cannot reach it: the extended
 * TTL requires an explicit `ttl` on `cache_control`, and fetch.ts sets the
 * bare ephemeral form (5-minute, $1.25). Pricing the bound at the reachable
 * maximum would be correct; pricing it at the row maximum is correct AND
 * survives an edit that adds a TTL without touching this file.
 *
 * Every other documented modifier is unreachable here, not merely unused:
 *
 *   - DATA RESIDENCY (1.1x on every token category) applies to Claude 4.6 and
 *     later models only; earlier models 400 on the parameter. Confirmed
 *     empirically rather than by reading: our probes show
 *     `inference_geo: "not_available"` on claude-haiku-4-5 and
 *     `"global"` on claude-opus-5 (.scratch/probe-web-fetch-results*.json).
 *   - FAST MODE premium exists for Opus 5 / Opus 4.8 only.
 *   - BATCH is a 50% DISCOUNT, and this call is not batched anyway.
 *   - Partner-cloud regional premiums are Bedrock/Vertex; we call the
 *     first-party API, where global routing is the default.
 *
 * ── VERSIONING ──
 *
 * Changing any field below changes what a fetch step can cost. For NEW
 * quotes that means `web.fetch@2` (a bumped capability the planner may use)
 * plus its own policy version. For ALREADY-ACCEPTED @1 contracts it means
 * nothing at all — and the runtime guard in fetch.ts is what makes that
 * sentence true rather than aspirational: an accepted step whose frozen
 * per-attempt ceiling no longer covers the CURRENT implementation's absolute
 * worst case is handed to a person BEFORE the provider is called.
 */

export type WebFetchEnvelope = {
  /** The capability version this envelope describes. */
  primitiveVersion: number;
  provider: "anthropic";
  model: string;
  toolType: string;
  /** Tokens the provider physically cannot exceed in one iteration. */
  contextWindowTokens: number;
  /** Our own output allowance, per iteration. */
  maxOutputTokens: number;
  /** The schema's own maximum, for the pin. The guard uses the FROZEN value. */
  maxFetchesCeiling: number;
  /** Dearest per-token input-side rate on this model, in micros per MTok. */
  worstInputRateMicrosPerMillion: number;
  outputRateMicrosPerMillion: number;
};

export const WEB_FETCH_ENVELOPE: WebFetchEnvelope = {
  primitiveVersion: 1,
  provider: "anthropic",
  model: "claude-haiku-4-5",
  toolType: "web_fetch_20260209",
  contextWindowTokens: 200_000,
  maxOutputTokens: 4_000,
  maxFetchesCeiling: 3,
  // $2 per MTok: the 1-hour cache-write rate, dearest in the Haiku 4.5 row.
  worstInputRateMicrosPerMillion: 2_000_000,
  // $5 per MTok.
  outputRateMicrosPerMillion: 5_000_000,
};

/**
 * The most one invocation of THIS implementation can possibly bill, in
 * microdollars, at the fetch count the accepted contract froze.
 *
 * `maxFetches` is NOT clamped to the envelope's ceiling on purpose: a frozen
 * value larger than today's schema allows (a contract quoted under a future
 * schema, or a hand-edited plan) must make the bound LARGER and therefore
 * fail the guard, not be quietly trimmed back into range.
 *
 * Integer arithmetic, rounded UP: an under-reported bound is the one that
 * lets spend escape.
 */
export function absoluteWorstCaseMicros(
  envelope: WebFetchEnvelope,
  maxFetches: number
): bigint {
  const iterations = BigInt(Math.max(0, Math.trunc(maxFetches)) + 1);
  const inputMicros = ceilDiv(
    BigInt(envelope.contextWindowTokens) * BigInt(envelope.worstInputRateMicrosPerMillion),
    1_000_000n
  );
  const outputMicros = ceilDiv(
    BigInt(envelope.maxOutputTokens) * BigInt(envelope.outputRateMicrosPerMillion),
    1_000_000n
  );
  return iterations * (inputMicros + outputMicros);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
