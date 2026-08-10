import "server-only";
import { prisma } from "@/lib/db";
import { toVectorLiteral } from "@/lib/embeddings";

/**
 * CROSS-MANDATE CALIBRATION, WITHOUT CROSS-CLIENT CONTENT.
 *
 * This is the one place in the engine that reads OTHER clients' tasks. Every
 * other AI surface is scoped to the task in hand: classify.ts and critique.ts
 * receive only the current brief, the worker assistant queries no database at
 * all, and closed-job-analysis.ts is documented and built as per-category
 * aggregates. So the isolation rule has exactly one file to hold.
 *
 * ── WHAT THIS USED TO DO, AND WHY IT WAS WRONG ──
 *
 * It selected `t."title", t."description"` from the nearest tasks and the
 * caller JSON.stringify'd them straight into the planning prompt. Client A's
 * brief, in their own words, became context for pricing client B — travelling
 * to a third-party model in the process. Nothing showed A's text to B, so it
 * never looked like a leak on screen, and that is precisely what made it easy
 * to keep: it was a real disclosure of one client's material into another
 * client's processing, invisible from both sides.
 *
 * ── WHAT IT DOES NOW ──
 *
 * Similarity still decides WHICH past mandates are comparable, and the numbers
 * they produced still calibrate the estimate. What crosses the boundary is only
 * measurement: a taxonomy label the operator maintains, enums, integers, and
 * what the work actually cost and took. Never a sentence anyone wrote.
 *
 * A SUMMARY WOULD NOT HAVE FIXED IT. Replacing `description` with a model-
 * written précis of the same text is the same disclosure with an extra step —
 * still A's material, still leaving for B's benefit.
 *
 * ── WHY THE EMBEDDING IS STILL ALLOWED TO MATCH ──
 *
 * The vector is derived from A's title and description, so it is not treated
 * here as anonymous — embeddings are partially invertible and pretending
 * otherwise would be the same mistake in a new costume. The reason it is safe
 * is narrower and checkable: it NEVER LEAVES. It is written to TaskEmbedding,
 * compared to the query vector by pgvector inside our own Postgres, and only
 * the row ids that survive the comparison are used. No vector is sent to a
 * provider, returned in a payload, or shown to any client. The matching is
 * ours; only the measurements travel.
 *
 * If a future change needs semantic detail in the prompt itself, it does not
 * get to reach for this — it needs its own justification, because that is the
 * boundary this file exists to hold.
 */

/** How many nearest-neighbor reference tasks to show the model. Bounded so
 *  the prompt stays cheap and fast regardless of how large history gets —
 *  the vector search already did the hard work of picking the closest
 *  ones, so a small K here loses nothing a bigger K would have added. */
export const REFERENCE_TASK_LIMIT = 12;

/**
 * Every field here is a measurement, an enum or an operator-maintained
 * taxonomy label. NOTHING free-text: not `title`, not `description`, and not
 * `Task.quantity` either — that column is `String?`, typed by the client, so
 * "1,800 rows from the Acme price list" would carry a client's name into
 * another client's prompt. `units` below is the engine's own integer reading
 * of that sentence (TaskAiClassification.quantityInterpreted).
 */
export type ReferenceTask = {
  /** Operator-maintained taxonomy, not client wording. */
  category_name: string | null;
  tier: string;
  /** The engine's integer reading of the brief's quantity, never the prose. */
  units: number | null;
  verification_level: string | null;
  estimated_minutes: number | null;
  client_price_usd: number;
  va_payout_usd: number;
  /** Measured, present only once a mandate has actually been executed. */
  worker_active_minutes: number | null;
  reviewer_active_minutes: number | null;
  /** Basis points, 1C's own units: how much of the work the machine resolved. */
  automated_unit_rate_bps: number | null;
  exception_rate_bps: number | null;
};

/**
 * Nearest neighbors among tasks that have actually been priced — a task
 * without clientPriceCents/vaPayoutCents is not a real precedent yet, no
 * matter how similar its embedding is. Excludes the task being priced
 * itself (it may already have a row here if this is a recompute).
 *
 * maxDistance (settings.pricingSimilarityMaxDistance) filters in SQL, not
 * after the fact in JS: a top-12-no-cutoff version could hand the model 12
 * genuinely unrelated tasks when nothing similar existed, and the
 * confidence floor only fires on a literally EMPTY list — a non-empty list
 * of weak matches could still let the model self-report "medium"/"high" on
 * precedent that isn't really there. Filtering here means "found nothing
 * close" and "found nothing at all" collapse to the same
 * referenceTasks.length === 0 case resolveConfidence already handles.
 *
 * The two LEFT JOINs are deliberate: a task priced before the classification
 * pipeline has no units, and one that has not been executed yet has no
 * measurements. Those arrive as nulls rather than dropping the precedent —
 * its price and estimate are still the most relevant thing we know.
 */
export async function findSimilarPricedTasks(
  taskId: string,
  vector: number[],
  maxDistance: number
): Promise<ReferenceTask[]> {
  const literal = toVectorLiteral(vector);
  const rows = await prisma.$queryRaw<
    {
      categoryName: string | null;
      tier: string;
      units: number | null;
      verificationLevel: string | null;
      estimatedMinutes: number | null;
      clientPriceCents: number;
      vaPayoutCents: number;
      workerActiveSeconds: number | null;
      reviewerActiveSeconds: number | null;
      automatedUnitRateBps: number | null;
      exceptionRateBps: number | null;
    }[]
  >`
    SELECT tc."name" as "categoryName",
           t."tier"::text as "tier",
           c."quantityInterpreted" as "units",
           c."verificationLevel"::text as "verificationLevel",
           t."estimatedMinutes",
           t."clientPriceCents", t."vaPayoutCents",
           a."workerActiveSeconds", a."reviewerActiveSeconds",
           a."automatedUnitRateBps", a."exceptionRateBps"
    FROM "TaskEmbedding" te
    JOIN "Task" t ON t."id" = te."taskId"
    LEFT JOIN "TaskCategory" tc ON tc."id" = t."categoryId"
    LEFT JOIN "TaskAiClassification" c ON c."taskId" = t."id"
    LEFT JOIN "TaskOperationalActual" a ON a."taskId" = t."id"
    WHERE te."taskId" != ${taskId}
      AND t."clientPriceCents" IS NOT NULL
      AND t."vaPayoutCents" IS NOT NULL
      AND (te."embedding" <=> ${literal}::vector) <= ${maxDistance}
    ORDER BY te."embedding" <=> ${literal}::vector
    LIMIT ${REFERENCE_TASK_LIMIT}
  `;
  const toMinutes = (seconds: number | null) =>
    seconds === null ? null : Math.round(seconds / 60);
  return rows.map((r) => ({
    category_name: r.categoryName,
    tier: r.tier,
    units: r.units,
    verification_level: r.verificationLevel,
    estimated_minutes: r.estimatedMinutes,
    client_price_usd: Math.round(r.clientPriceCents / 100),
    va_payout_usd: Math.round(r.vaPayoutCents / 100),
    worker_active_minutes: toMinutes(r.workerActiveSeconds),
    reviewer_active_minutes: toMinutes(r.reviewerActiveSeconds),
    automated_unit_rate_bps: r.automatedUnitRateBps,
    exception_rate_bps: r.exceptionRateBps,
  }));
}

export async function upsertEmbedding(taskId: string, vector: number[]): Promise<void> {
  const literal = toVectorLiteral(vector);
  await prisma.$executeRaw`
    INSERT INTO "TaskEmbedding" ("taskId", "embedding")
    VALUES (${taskId}, ${literal}::vector)
    ON CONFLICT ("taskId") DO UPDATE SET "embedding" = EXCLUDED."embedding"
  `;
}
