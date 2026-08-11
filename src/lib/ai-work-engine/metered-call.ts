import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { costMicrosFor, fetchCostMicros, searchCostMicros } from "@/lib/ai-work-engine/tool-cost";
import { classifyProviderError } from "@/lib/ai-work-engine/provider-error";
import type { InvocationRecord, PrimitiveContext } from "@/lib/ai-work-engine/primitives/types";

/**
 * ONE PLACE WHERE A BILLED CALL HAPPENS.
 *
 * Before this file, `research.ts` and `extract.ts` each carried their own copy
 * of the same forty lines: build the client, start a timer, try, catch and
 * write a zero-cost failure row, read `usage`, convert tokens to micros, write
 * a success row. Identical, twice, with the provider string `"anthropic"`
 * hardcoded in four places between them. A third caller would have copied it a
 * third time, and any fix would have had to be made everywhere at once.
 *
 * WHAT THIS IS NOT. It is not a multi-provider abstraction. Anthropic is the
 * only execution provider approved after 1D-alpha0, so there is no adapter
 * registry, no capability resolver and no provider policy here: those would be
 * types with no second implementation, which is decoration. What is factored
 * is exactly what already had two real consumers — metering, budget, the
 * invocation row, error normalisation and the deadline.
 *
 * ── THE FOUR SPEND STATES, AND WHY THEY EXIST ──
 *
 * The old `withTimeout` was `Promise.race` against a timer. It rejected and
 * moved on, but nothing cancelled: the provider call kept running, kept being
 * billed, and its cost never reached `recordInvocation`, which the losing
 * branch never got to. Money left the account and no row said so.
 *
 * An AbortSignal fixes the leak but proves less than it looks like it does. It
 * proves WE stopped waiting. It does not prove the provider stopped working or
 * stopped billing. So the outcome of every attempt is one of four states, and
 * two of them are honest admissions of ignorance:
 *
 *   settled                   response read, usage known, cost measured
 *   cancelled_before_dispatch nothing was sent, cost is zero and certain
 *   dispatched_then_cancelled sent, then abandoned; cost UNKNOWN
 *   unaccounted               failed with no usable response; cost UNKNOWN
 *
 * The two unknown states keep their budget reservation. Recording a zero there
 * would be the same fabrication Phase 1C forbids on every display surface.
 */

export type MeteredOutcome<T> =
  | { ok: true; value: T; costMicros: number; record: InvocationRecord }
  | { ok: false; error: unknown; record: InvocationRecord };

/**
 * The largest number of microdollars a call can possibly cost, computed BEFORE
 * it happens so a reservation can be taken against it.
 *
 * Output tokens are charged at the highest rate, so max_tokens at the output
 * rate is the ceiling for generation; the input is measured from what we are
 * about to send, plus a margin for the system prompt the caller does not count.
 * Searches are billed per query and capped by `max_uses`, so that term is exact.
 *
 * Deliberately pessimistic. A worst case that is too low reserves too little
 * and lets two attempts overlap inside one ceiling.
 */
/**
 * Tokens ONE web search result set adds to the context, as an upper bound.
 *
 * This term was missing from the first version and the omission was the whole
 * defect: a server-side search tool loops inside a single request, and every
 * result block it retrieves is re-sent as INPUT on the following turn. So the
 * input a research call is billed for is dominated by what the tool fetched,
 * not by the prompt we wrote. Counting only our own prompt made the worst case
 * far smaller than the real floor, and a reservation that small is not a
 * ceiling at all.
 *
 * Deliberately generous. Under-reserving lets spend escape; over-reserving
 * only makes a run pause earlier, which is the safe direction.
 */
const TOKENS_PER_SEARCH_RESULT_SET = 4_000;

export function worstCaseMicros(input: {
  model: string;
  maxOutputTokens: number;
  approxInputTokens: number;
  maxSearches: number;
  /**
   * 1E-beta1, both zero for every pre-beta caller so their arithmetic is
   * byte-identical to what their contracts were quoted against. A fetch loop
   * has the same shape as the search loop — every fetched page re-enters as
   * INPUT on each later turn of the same call — with one difference that is
   * the whole reason `maxFetchContentTokens` must be a PROVIDER-ENFORCED
   * parameter rather than a local estimate: a search result set is shaped by
   * the provider (the 4,000-token pin above holds), while a page's size is
   * chosen by whoever owns the page. The pin holds for TEXT; the beta1 probe
   * proved PDFs escape it, which is why web.fetch refuses binary content at
   * harvest and why ac4's cap carries headroom above this formula.
   */
  maxFetches?: number;
  maxFetchContentTokens?: number;
}): number {
  /**
   * The search loop re-sends its accumulated context, so the input grows
   * roughly with the square of the number of searches. n(n+1)/2 is that sum,
   * and it is the term that turns a $0.5 estimate into the real number.
   */
  const searchTurns = input.maxSearches;
  const fetchTurns = input.maxFetches ?? 0;
  const fetchTokens = input.maxFetchContentTokens ?? 0;
  const accumulatedSearchTokens =
    TOKENS_PER_SEARCH_RESULT_SET * ((searchTurns * (searchTurns + 1)) / 2);
  /**
   * Separate triangulars when only one tool is present; when a single call
   * carries BOTH, the safe order-independent bound is (perSearchSet·S +
   * perFetch·F)·(S+F), which dominates every interleaving. No beta1 caller
   * combines them — research is search-only, web.fetch is fetch-only — but
   * the formula must not quietly under-reserve the first caller that does.
   */
  const accumulatedToolTokens =
    searchTurns > 0 && fetchTurns > 0
      ? (TOKENS_PER_SEARCH_RESULT_SET * searchTurns + fetchTokens * fetchTurns) *
        (searchTurns + fetchTurns)
      : accumulatedSearchTokens + fetchTokens * ((fetchTurns * (fetchTurns + 1)) / 2);
  const generation = costMicrosFor(input.model, {
    inputTokens: Math.ceil(input.approxInputTokens * 1.2) + accumulatedToolTokens,
    outputTokens: input.maxOutputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  return generation + searchCostMicros(input.maxSearches) + fetchCostMicros(fetchTurns);
}

/** Rough token count. Four characters per token is the usual approximation. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function usageToRecord(
  operationKey: string,
  model: string,
  usage: Anthropic.Usage | undefined,
  durationMs: number,
  startedAt: Date
): InvocationRecord {
  const searchCount = usage?.server_tool_use?.web_search_requests ?? 0;
  const fetchCount = usage?.server_tool_use?.web_fetch_requests ?? 0;
  const tokens = {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
  };
  return {
    operationKey,
    provider: "anthropic",
    model,
    // The Messages API takes no idempotency key. Recorded as null rather than
    // faked: a replay of this step WILL call the provider again and WILL be
    // billed again, and pretending otherwise would be the dishonest part.
    providerIdempotencyKey: null,
    ...tokens,
    searchCount,
    fetchCount,
    costMicros:
      costMicrosFor(model, tokens) + searchCostMicros(searchCount) + fetchCostMicros(fetchCount),
    durationMs,
    ok: true,
    error: null,
    dispatchState: "settled",
    errorClass: null,
    httpStatus: null,
    startedAt,
    finishedAt: new Date(startedAt.getTime() + durationMs),
  };
}

/**
 * Run one billed provider call with a real deadline, a real cancellation, a
 * classified failure and exactly one invocation row whatever happens.
 *
 * `ctx.recordInvocation` is called on EVERY path including the failures,
 * because a failed call is usually still a billed call. The budget hold that
 * the runner took before calling is settled by `recordInvocation` itself.
 */
export async function meteredCall<T>(
  ctx: PrimitiveContext,
  spec: {
    operationKey: string;
    model: string;
    timeoutMs: number;
    /** Worst case already reserved by the runner, for the refusal message. */
    reservedMicros: number;
    call: (signal: AbortSignal) => Promise<{ value: T; usage: Anthropic.Usage | undefined }>;
  }
): Promise<MeteredOutcome<T>> {
  /**
   * The budget is checked HERE too, not only by the runner. The runner's
   * reservation is the authority; this is the assertion that the reservation
   * actually happened, so a future caller that forgets it fails loudly instead
   * of spending unmetered.
   */
  /**
   * ZERO MEANS "MAY NOT SPEND", NOT "UNLIMITED".
   *
   * The first version read `costCeilingMicros > 0 && reserved > ceiling`,
   * which quietly inverted the meaning: a ceiling of 0 skipped the check
   * entirely and authorised an unbounded call. But zero is precisely what the
   * runner passes when no reservation was granted, and what a pure primitive
   * carries. The old 1B sense of "0 = unbounded" is exactly the defect this
   * phase exists to remove, and it must not survive inside its replacement.
   */
  if (ctx.costCeilingMicros <= 0n || BigInt(spec.reservedMicros) > ctx.costCeilingMicros) {
    const record: InvocationRecord = {
      operationKey: spec.operationKey,
      provider: "anthropic",
      model: spec.model,
      providerIdempotencyKey: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      searchCount: 0,
      fetchCount: 0,
      costMicros: 0,
      durationMs: 0,
      ok: false,
      error: "refused before dispatch: worst case exceeds the remaining run budget",
      // Nothing left the process, so zero here is measured, not assumed.
      dispatchState: "cancelled_before_dispatch",
      errorClass: "quota",
      httpStatus: null,
      startedAt: new Date(),
      finishedAt: new Date(),
    };
    await ctx.recordInvocation(record);
    return { ok: false, error: new Error(record.error ?? "budget refused"), record };
  }

  const controller = new AbortController();
  const startedAt = new Date();
  const started = Date.now();
  let dispatched = false;

  const timer = setTimeout(() => controller.abort(), spec.timeoutMs);

  try {
    dispatched = true;
    const { value, usage } = await spec.call(controller.signal);
    clearTimeout(timer);
    const record = usageToRecord(
      spec.operationKey,
      spec.model,
      usage,
      Date.now() - started,
      startedAt
    );
    await ctx.recordInvocation(record);
    return { ok: true, value, costMicros: record.costMicros, record };
  } catch (error) {
    clearTimeout(timer);
    const classified = classifyProviderError(error);
    /**
     * The honest part. We aborted, so we know the call was SENT and we know we
     * stopped listening. We do not know whether the provider finished it and
     * billed it. `dispatched_then_cancelled` says exactly that, and its hold
     * stays reserved.
     */
    const dispatchState = !dispatched
      ? ("cancelled_before_dispatch" as const)
      : controller.signal.aborted
        ? ("dispatched_then_cancelled" as const)
        : ("unaccounted" as const);

    const record: InvocationRecord = {
      operationKey: spec.operationKey,
      provider: "anthropic",
      model: spec.model,
      providerIdempotencyKey: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      searchCount: 0,
      fetchCount: 0,
      // NOT a claim that the call was free. `dispatchState` carries what we
      // actually know, and the reservation is what protects the ceiling.
      costMicros: 0,
      durationMs: Date.now() - started,
      ok: false,
      error: classified.message,
      dispatchState,
      errorClass: classified.errorClass,
      httpStatus: classified.httpStatus,
      startedAt,
      finishedAt: new Date(),
    };
    await ctx.recordInvocation(record);
    return { ok: false, error, record };
  }
}
