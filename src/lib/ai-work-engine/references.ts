import "server-only";
import { prisma } from "@/lib/db";
import { toVectorLiteral } from "@/lib/embeddings";

/**
 * The RAG half of the engine, moved verbatim from pricing-ai.ts when the
 * single-call pricer became this pipeline — the retrieval logic did not
 * change, only its home. pricing-ai.ts keeps its public surface by
 * delegating here, so nothing else in the codebase had to move.
 */

/** How many nearest-neighbor reference tasks to show the model. Bounded so
 *  the prompt stays cheap and fast regardless of how large history gets —
 *  the vector search already did the hard work of picking the closest
 *  ones, so a small K here loses nothing a bigger K would have added. */
export const REFERENCE_TASK_LIMIT = 12;

export type ReferenceTask = {
  title: string;
  description: string;
  category_name: string | null;
  client_price_usd: number;
  va_payout_usd: number;
  estimated_minutes: number | null;
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
 */
export async function findSimilarPricedTasks(
  taskId: string,
  vector: number[],
  maxDistance: number
): Promise<ReferenceTask[]> {
  const literal = toVectorLiteral(vector);
  const rows = await prisma.$queryRaw<
    {
      title: string;
      description: string;
      categoryName: string | null;
      clientPriceCents: number;
      vaPayoutCents: number;
      estimatedMinutes: number | null;
    }[]
  >`
    SELECT t."title", t."description", tc."name" as "categoryName",
           t."clientPriceCents", t."vaPayoutCents", t."estimatedMinutes"
    FROM "TaskEmbedding" te
    JOIN "Task" t ON t."id" = te."taskId"
    LEFT JOIN "TaskCategory" tc ON tc."id" = t."categoryId"
    WHERE te."taskId" != ${taskId}
      AND t."clientPriceCents" IS NOT NULL
      AND t."vaPayoutCents" IS NOT NULL
      AND (te."embedding" <=> ${literal}::vector) <= ${maxDistance}
    ORDER BY te."embedding" <=> ${literal}::vector
    LIMIT ${REFERENCE_TASK_LIMIT}
  `;
  return rows.map((r) => ({
    title: r.title,
    description: r.description,
    category_name: r.categoryName,
    client_price_usd: Math.round(r.clientPriceCents / 100),
    va_payout_usd: Math.round(r.vaPayoutCents / 100),
    estimated_minutes: r.estimatedMinutes,
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
