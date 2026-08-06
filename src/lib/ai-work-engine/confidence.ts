/**
 * The confidence floors — every rule that OVERRIDES a model's self-reported
 * confidence, in one place, all pure, all tested without a network.
 *
 * (No "server-only" import: these functions run in tests and hold no secret;
 * they are arithmetic over enums.)
 */

export type Confidence = "high" | "medium" | "low";

/**
 * THE HARD FLOOR, moved verbatim from pricing-ai.ts (its test in
 * test/pricing-ai.test.ts still imports it through that file's re-export).
 * Zero close precedent means "low", full stop — never the model's own
 * self-report alone. A model can sound confident about a guess; this does
 * not ask it whether it should be. An invalid/missing model value also
 * floors to "low" — the safe direction to fail in, never "medium" or "high"
 * by default.
 */
export function resolveConfidence(
  modelConfidence: unknown,
  referenceTaskCount: number
): Confidence {
  if (referenceTaskCount === 0) return "low";
  return modelConfidence === "high" || modelConfidence === "medium" || modelConfidence === "low"
    ? modelConfidence
    : "low";
}

/**
 * The critique's floor, layered ON TOP of resolveConfidence: a plan whose
 * adversarial critique came back major or blocking cannot claim medium or
 * high confidence, whatever the classification said. Same philosophy
 * extended one stage: the critique exists precisely because the plan cannot
 * be trusted to grade itself.
 */
export function floorConfidenceForCritique(
  confidence: Confidence,
  critiqueSeverity: "none" | "minor" | "major" | "blocking" | null
): Confidence {
  if (critiqueSeverity === "major" || critiqueSeverity === "blocking") return "low";
  return confidence;
}
