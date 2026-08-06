import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { costMicrosFor } from "@/lib/ai-work-engine/tool-cost";

/**
 * THE USAGE HALF of a pipeline stage's answer. Until Phase 1C the three
 * stage modules read response.content and threw response.usage away — on
 * every path, including the FAILURE paths, which are billed calls too: a
 * refusal, a max_tokens death and a parse failure all consumed real tokens.
 * Every stage now returns `{ result, usage, failure }` so the caller can
 * account for the money whether or not the output was usable.
 */

export type StageUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
  stopReason: string | null;
};

export type StageResult<T> = {
  /** Null when the call produced nothing usable. */
  result: { output: T; raw: unknown } | null;
  /** Null ONLY when no response arrived at all (network/timeout throw). */
  usage: StageUsage | null;
  failure: string | null;
};

export function usageFromResponse(model: string, response: Anthropic.Message): StageUsage {
  const u = response.usage;
  const tokens = {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
  return {
    model,
    ...tokens,
    costMicros: costMicrosFor(model, tokens),
    stopReason: response.stop_reason,
  };
}
