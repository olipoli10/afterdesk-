import "server-only";
import { z } from "zod";
import { inspectPersonalModelBudget } from "../personal-intent/budget-policy";
import { canonicalFingerprint } from "../evidence";
import { ANSWER_OPERATION, RESEARCH_OPERATION } from "./contract";

// Reviewed exact model/endpoint rates, including router fees, tool charges,
// reasoning tokens and FX headroom. No prices come from a model response.
const schema = z.object({
  candidateRates: z.array(z.unknown()).min(1).max(20),
  searchUsdMicrosPerRequest: z.number().int().safe().positive(),
}).strict();
export function inspectAnswerBudget(raw: unknown, operation: typeof ANSWER_OPERATION | typeof RESEARCH_OPERATION, now: Date) {
  const config = schema.parse(raw);
  const rates = config.candidateRates.map(rate => inspectPersonalModelBudget(rate, now));
  const common = rates[0];
  if (rates.some(r => r.budgetId !== common.budgetId || r.ceilingCadMicros !== common.ceilingCadMicros
    || r.expiresAt !== common.expiresAt || r.maxOutputTokens !== common.maxOutputTokens || r.totalContextTokens !== common.totalContextTokens)) {
    throw new Error("ANSWER_RATE_SET_INCONSISTENT");
  }
  const allowedModels = [...new Set(rates.map(r => r.model))];
  const providerEndpoints = [...new Set(rates.map(r => r.providerEndpoint))];
  // Only complete reviewed Cartesian sets can be handed to Auto Router.
  const pairs = new Set(rates.map(r => `${r.model}\0${r.providerEndpoint}`));
  if (pairs.size !== rates.length || pairs.size !== allowedModels.length * providerEndpoints.length
    || common.maxOutputTokens > 2048 || allowedModels.length > 10 || providerEndpoints.length > 10) throw new Error("ANSWER_UNREVIEWED_MODEL_PROVIDER_PAIR");
  const enriched = config.candidateRates.map(rawRate => {
    const original = rawRate as Record<string, unknown>;
    // One search turn plus one final model turn. Reserve both complete contexts
    // and both output ceilings, including all configured additional charges.
    return inspectPersonalModelBudget(operation === RESEARCH_OPERATION ? {
      ...original,
      inputUsdMicrosPerMillionTokens: Number(original.inputUsdMicrosPerMillionTokens) * 2,
      outputUsdMicrosPerMillionTokens: Number(original.outputUsdMicrosPerMillionTokens) * 2,
      additionalUsdMicrosPerCall: Number(original.additionalUsdMicrosPerCall) * 2 + config.searchUsdMicrosPerRequest,
    } : original, now);
  });
  const maximum = (values: bigint[]) => values.reduce((a, b) => a > b ? a : b);
  return Object.freeze({ ...common, model: "openrouter/auto", allowedModels, providerEndpoints,
    reservationUsdMicros: maximum(enriched.map(r => r.reservationUsdMicros)),
    reservationCadMicros: maximum(enriched.map(r => r.reservationCadMicros)),
    reviewedRateFingerprint: canonicalFingerprint({ operation, config }), operation,
  });
}
