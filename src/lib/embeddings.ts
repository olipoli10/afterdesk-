import "server-only";

/**
 * The single place the embeddings provider lives — same discipline as
 * src/lib/ai.ts for the chat model. Swapping providers means rewriting
 * this file only.
 *
 * Used exclusively by src/lib/pricing-ai.ts to turn a task's title +
 * description into a vector for nearest-neighbor retrieval against
 * already-priced tasks (TaskEmbedding, prisma/schema.prisma). Voyage over
 * OpenAI/Cohere: Anthropic's own docs point to Voyage for RAG-style
 * retrieval alongside Claude, and this project otherwise has zero
 * dependency on OpenAI's ecosystem.
 *
 * embeddingsEnabled gates the AI pricing feature as a whole (see
 * pricing-ai.ts): without a key, task submission proceeds exactly as it
 * always has — no suggestion computed, admin prices manually — never a
 * blocked or failed submission.
 */

export const embeddingsEnabled = Boolean(process.env.VOYAGE_API_KEY);

/** voyage-3 output dimension. Must match TaskEmbedding.embedding's
 *  vector(1024) column — changing the model means a migration too. */
export const EMBEDDING_DIMENSION = 1024;

const EMBEDDING_MODEL = "voyage-3";

type VoyageResponse = {
  data: { embedding: number[] }[];
  usage?: { total_tokens?: number };
};

/**
 * `input_type` matters for Voyage's asymmetric retrieval models: "document"
 * for text being STORED as a reference, "query" for text being SEARCHED
 * with. Same underlying text embedded either way, but the vectors differ
 * slightly and mixing the types up measurably hurts retrieval quality —
 * this is the one parameter callers must get right.
 */
/**
 * 1D-alpha0 — WHAT AN EMBEDDING CALL ACTUALLY COST, AND WHAT WE DO NOT KNOW.
 *
 * The audit found Voyage to be a PAYING provider that was completely invisible
 * to the operational record: `embed()` returned a vector and nothing else, no
 * caller wrote a usage row, and the intelligence layer therefore reported a
 * cost that omitted it entirely.
 *
 * Two halves, and only one of them can be honest today.
 *
 * MEASURABLE: the call happened, against a named provider and model, on behalf
 * of a specific task. `embed()` now reports that, and the one caller that has
 * a taskId in scope records it.
 *
 * NOT MEASURABLE: what it cost. No verified Voyage rate exists in this repo,
 * and inventing one would put a fabricated number into a table whose whole
 * purpose is that its numbers are real. So `costMicros` stays 0 AND the actual
 * carries EMBEDDING_COST_UNPRICED, which is the same discipline the display
 * layer already applies: a gap shows as a gap with a reason, never as a zero
 * that reads like a measurement.
 *
 * To close it: add a verified per-million-token rate to tool-cost.ts and
 * compute here. Until then the flag is the honest statement.
 */
export type EmbeddingUsage = {
  provider: "voyage";
  model: string;
  /** Reported by the provider when it does. Null when it does not. */
  totalTokens: number | null;
};

export type EmbeddingResult = { vector: number[]; usage: EmbeddingUsage };

/**
 * R5.2 — BOUNDING VOYAGE WITHOUT INVENTING A PRICE.
 *
 * The statement above is still true: this repository contains no verified
 * Voyage rate, and R5.2 does not add one, because a plausible-looking constant
 * in a rate table is exactly the fabrication 1D-alpha0 refused. But "we cannot
 * price it" must not keep meaning "it bills unbounded and invisibly".
 *
 * So the rate comes from the OPERATOR, who can read Voyage's current published
 * pricing, via VOYAGE_EMBEDDING_MICROS_PER_MILLION_TOKENS. Null means "not
 * configured", and the caller decides what that means — in production it means
 * the call does not happen (src/lib/ai-work-engine/index.ts). Nothing here
 * guesses.
 *
 * The worst case IS computable without the rate: one call carries exactly one
 * text, never a batch, and that text is `${title}\n\n${description}` whose
 * parts are capped by the submission validator at 140 and 20 000 characters.
 * The cap is re-asserted at this boundary below rather than merely inherited,
 * so a future caller that skips that validator cannot silently remove the only
 * foundation the reservation rests on.
 */
export const VOYAGE_PROVIDER = "voyage";
export const VOYAGE_MAX_INPUT_CHARS = 140 + 2 + 20_000;
/** Same 4-chars-per-token estimator the work engine uses. Pessimistic. */
const CHARS_PER_TOKEN = 4;
const VOYAGE_RATE_ENV_VAR = "VOYAGE_EMBEDDING_MICROS_PER_MILLION_TOKENS";

export function voyageMicrosPerMillionTokens(
  env: NodeJS.ProcessEnv = process.env
): bigint | null {
  const raw = env[VOYAGE_RATE_ENV_VAR];
  if (raw === undefined || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = BigInt(raw.trim());
  return value > 0n ? value : null;
}

/** The most a single embedding call can cost at the configured rate. */
export function voyageWorstCaseMicros(microsPerMillionTokens: bigint): bigint {
  const maxTokens = BigInt(Math.ceil(VOYAGE_MAX_INPUT_CHARS / CHARS_PER_TOKEN));
  // Ceil-divide so the reservation is never a fraction short of the true bound.
  return (maxTokens * microsPerMillionTokens + 999_999n) / 1_000_000n;
}

/**
 * The EXACT cost of a call that happened: Voyage reports total_tokens, so this
 * is a measurement, not an estimate. Null tokens means the provider told us
 * nothing, and the caller must then keep the reservation held rather than
 * settle a number nobody measured.
 */
export function voyageActualMicros(
  totalTokens: number | null,
  microsPerMillionTokens: bigint
): bigint | null {
  if (totalTokens === null || !Number.isFinite(totalTokens) || totalTokens < 0) return null;
  return (BigInt(Math.ceil(totalTokens)) * microsPerMillionTokens + 999_999n) / 1_000_000n;
}

export async function embedWithUsage(
  text: string,
  inputType: "document" | "query"
): Promise<EmbeddingResult> {
  /**
   * R5.2 — the reservation's foundation, asserted HERE. The caller's worst
   * case is computed from VOYAGE_MAX_INPUT_CHARS; if a future caller sends
   * more than that, the reservation would silently understate the call. Fail
   * rather than bill an amount nobody reserved.
   */
  if (text.length > VOYAGE_MAX_INPUT_CHARS) {
    throw new Error(
      `Embedding input is ${text.length} characters, over the ${VOYAGE_MAX_INPUT_CHARS} bound the account-level reservation is computed from.`
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model: EMBEDDING_MODEL,
        input_type: inputType,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Voyage embeddings request failed (${res.status}): ${body}`);
    }
    const json = (await res.json()) as VoyageResponse;
    const vector = json.data?.[0]?.embedding;
    if (!vector || vector.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Voyage returned an unexpected embedding shape (length ${vector?.length ?? "none"}).`
      );
    }
    return {
      vector,
      usage: {
        provider: "voyage",
        model: EMBEDDING_MODEL,
        totalTokens:
          typeof json.usage?.total_tokens === "number" ? json.usage.total_tokens : null,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * R5.2 — `embed()` (vector only, "for callers with no task to attribute the
 * call to") is DELETED. It had no caller, and an unmetered convenience wrapper
 * in front of a billable provider is precisely the footgun this lot closes:
 * the next person needing a vector would have reached for the one entry point
 * that skips attribution, and therefore skips the reservation the orchestrator
 * takes around embedWithUsage. There is now exactly one way to embed, and it
 * is the way that gets accounted.
 */

/** pgvector's literal syntax for $queryRaw/$executeRaw: '[0.1,0.2,...]'. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
