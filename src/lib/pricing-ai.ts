import "server-only";
import { runWorkEngine } from "@/lib/ai-work-engine";

/**
 * The pricing suggestion surface. Phase 1A replaced the single structured
 * call that used to live here with the AI work engine pipeline
 * (src/lib/ai-work-engine/): classification → versioned execution plan →
 * deterministic cost/price computation → conditional adversarial critique.
 * This file keeps its public shape so nothing upstream had to move:
 * submitTask still fires computeAiPricingSuggestion from after(), and the
 * existing tests still import resolveConfidence from here.
 *
 * RULE 3, unchanged and restated: the engine only ever writes the aiXxx
 * columns on Task plus its own suggestion tables. It has no path to
 * clientPriceCents, vaPayoutCents, or quotedAt — those are set exclusively
 * by approvePricing (src/server/actions/admin.ts) after a human clicks
 * Approve or Adjust-and-approve. A suggestion sitting unreviewed changes
 * nothing a client or worker can see.
 *
 * Failure discipline, unchanged: never throws to the caller. Any stage of
 * the pipeline failing leaves the task pricing manually, exactly as if the
 * engine did not exist.
 */
export async function computeAiPricingSuggestion(taskId: string): Promise<void> {
  return runWorkEngine(taskId);
}

// Re-exported from their new home so test/pricing-ai.test.ts and any other
// existing importer keeps working against this file's surface.
export { resolveConfidence } from "@/lib/ai-work-engine/confidence";
