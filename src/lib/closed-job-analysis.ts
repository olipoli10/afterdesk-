import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getSettings } from "@/lib/settings";
import { aiEnabled } from "@/lib/ai";
import type { CategoryStat } from "@/lib/queries/closed-jobs";
import { approxTokens, worstCaseMicros } from "@/lib/ai-work-engine/metered-call";
import { costMicrosFor } from "@/lib/ai-work-engine/tool-cost";

/**
 * Advisory only — this is the whole point, not a detail. See the doc
 * comment on ClosedJobLog in schema.prisma for the vision this is the
 * foundation for, and why it stops here in this phase: nothing this
 * function returns can change a price, approve anything, or take any
 * action. It is text an admin reads and decides what to do with, exactly
 * like the pricing engine's own `reasoning` field is a suggestion an admin
 * reviews, never an auto-applied price.
 */

const MAX_TOKENS = 4000;

export type Observation = {
  finding: string;
  evidence: string;
  suggestion: string;
};

export type AnalysisUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** R5.2 — cache writes bill at 1.25x input; see the note in ai.ts. */
  cacheWriteTokens: number;
};

export type AnalysisResult = {
  observations: Observation[];
  usage: AnalysisUsage;
};

const STATIC_RULES = `You are analyzing AfterDesk's closed-job history for the admin (operator) who runs the platform. You produce OBSERVATIONS AND SUGGESTIONS ONLY — you never decide anything, and nothing you write is applied automatically. Every sentence should read like something an analyst hands to a human, not an instruction executed by a machine.

DATA YOU RECEIVE: per-category aggregates only — win/loss counts, average margin, average QC rounds, loss-reason breakdown, bot-question volume. No individual task descriptions, no client names, no worker names. Categories with too few samples to be meaningful are already excluded before you see them.

YOUR JOB: find patterns worth a human's attention — which categories lose most and to what reason, which categories run high QC rounds or high bot-question volume (a possible documentation gap), where margin looks thin relative to loss rate. Be specific about WHICH category and WHAT the number shows; do not generalize into vague business advice.

ANONYMITY, EVEN THOUGH NOTHING HERE IS SHARED BEYOND THE ADMIN TODAY: never invent or reference a specific client, worker, or task by name or description — you were not given any, so any such reference would be fabricated. Speak only in terms of categories and aggregate counts.

CONFIDENCE: if a pattern is based on a small gap between categories, say so plainly rather than overstating it. A suggestion should name what additional data or admin judgment it depends on, not read as a conclusion.

OUTPUT: 3-6 observations, each with a one-sentence finding, the specific evidence (numbers) behind it, and a one-sentence suggestion phrased as something for the admin to consider — never an imperative directed at the system.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          finding: { type: "string" },
          evidence: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["finding", "evidence", "suggestion"],
        additionalProperties: false,
      },
    },
  },
  required: ["observations"],
  additionalProperties: false,
} as const;

function buildUserMessage(total: number, categories: CategoryStat[]): string {
  return `CLOSED JOB LOG SUMMARY
Total closed jobs: ${total}

PER-CATEGORY AGGREGATES (categories below the minimum sample size are already excluded)
${JSON.stringify(categories, null, 2)}`;
}

export const closedJobAnalysisEnabled = aiEnabled;

/**
 * R5.2 — pure worst-case / actual-cost pair for the account-level spend gate.
 * `model` is an explicit parameter rather than a getSettings() call so this
 * stays pure and DB-free; the caller (admin-closed-jobs.ts) already resolves
 * settings and already touches Prisma.
 */
export function closedJobAnalysisReservationMicros(input: {
  model: string;
  total: number;
  categories: CategoryStat[];
}): number {
  return worstCaseMicros({
    model: input.model,
    maxOutputTokens: MAX_TOKENS,
    approxInputTokens:
      approxTokens(STATIC_RULES) + approxTokens(buildUserMessage(input.total, input.categories)),
    maxSearches: 0,
  });
}

export function closedJobAnalysisCostMicros(model: string, usage: AnalysisUsage): number {
  return costMicrosFor(model, {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  });
}

export async function analyzeClosedJobs(total: number, categories: CategoryStat[]): Promise<AnalysisResult> {
  const zeroUsage: AnalysisUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const settings = await getSettings();

  try {
    // R5.2 — maxRetries: 0. An SDK retry is a second billable POST under the
    // one account reservation taken by the caller (admin-closed-jobs.ts). See
    // the doctrine at primitives/research.ts:94-99.
    const client = new Anthropic({ timeout: 60_000, maxRetries: 0 });
    const response = await client.messages.create({
      model: settings.closedJobAnalysisModel,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: STATIC_RULES, cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: buildUserMessage(total, categories) }],
    });

    const usage: AnalysisUsage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? 0,
    };

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return { observations: [], usage };
    }

    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!text) return { observations: [], usage };

    let parsed: { observations?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      return { observations: [], usage };
    }

    const observations = Array.isArray(parsed.observations)
      ? parsed.observations
          .filter(
            (o): o is Observation =>
              typeof o === "object" &&
              o !== null &&
              typeof (o as Observation).finding === "string" &&
              typeof (o as Observation).evidence === "string" &&
              typeof (o as Observation).suggestion === "string"
          )
          .slice(0, 10)
      : [];

    return { observations, usage };
  } catch (error) {
    console.error("[closed-job-analysis] call failed", error);
    return { observations: [], usage: zeroUsage };
  }
}
