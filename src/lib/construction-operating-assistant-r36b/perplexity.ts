import { z } from "zod";
import {
  normalizedSourceEvidenceSchema,
  normalizedSourceEvidenceUnsignedSchema,
  perplexityRequestPlanUnsignedSchema,
  providerRequestPlanSchema,
  r36bFingerprint,
  type ProviderRequestPlan,
  type SandboxCase,
} from "./contracts";
import { requireCurrentCandidatePacket } from "./candidates";

const syntheticPerplexityResponseSchema = z.object({
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
    date: z.string().date().nullable().optional(),
  }).strict()).min(1).max(20),
}).strict();

export function preparePerplexitySearchPlan(planId: string, sandboxCase: SandboxCase): ProviderRequestPlan {
  const packet = requireCurrentCandidatePacket("PERPLEXITY_SEARCH");
  if (sandboxCase.dataClass !== "public") throw new Error("R36B_RESEARCH_PUBLIC_DATA_ONLY");
  if (sandboxCase.intent === "CONTROLLER_REASONING") throw new Error("R36B_RESEARCH_INTENT_REQUIRED");
  const query = sandboxCase.orderedFacts.map((fact) => `${fact.key}: ${fact.value}`).join(" | ");
  const unsigned = perplexityRequestPlanUnsignedSchema.parse({
    schemaVersion: 1,
    planId,
    providerKey: "PERPLEXITY_SEARCH",
    endpointFamily: "PERPLEXITY_SEARCH_API",
    method: "POST",
    path: "/search",
    packetFingerprint: packet.packetFingerprint,
    caseFingerprint: sandboxCase.caseFingerprint,
    ceilingFingerprint: sandboxCase.ceilingFingerprint,
    secretReferenceName: "R37_PERPLEXITY_SEARCH_API_KEY",
    payload: {
      query,
      country: "CA",
      searchLanguageFilter: ["fr", "en"],
      maxResults: sandboxCase.ceilings.maxSources,
      maxTokens: sandboxCase.ceilings.maxOutputTokens,
      maxTokensPerPage: Math.min(2_000, sandboxCase.ceilings.maxOutputTokens),
      searchType: sandboxCase.intent === "PUBLIC_PROFESSIONAL_RESEARCH" ? "people" : "web",
    },
    dispatchable: false,
    credentialResolved: false,
    providerExecutionAuthorized: false,
    externalDispatchPerformed: false,
  });
  return providerRequestPlanSchema.parse({ ...unsigned, planFingerprint: r36bFingerprint(unsigned) });
}

export function normalizeSyntheticPerplexityResponse(raw: unknown) {
  const response = syntheticPerplexityResponseSchema.parse(raw);
  return response.results.map((result) => {
    const unsigned = normalizedSourceEvidenceUnsignedSchema.parse({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      sourceDate: result.date ?? null,
    });
    return normalizedSourceEvidenceSchema.parse({ ...unsigned, sourceFingerprint: r36bFingerprint(unsigned) });
  });
}

export function verifySourceSupportedClaims(
  claims: readonly Readonly<{ claimId: string; sourceFingerprints: readonly string[] }>[],
  sources: readonly Readonly<{ sourceFingerprint: string }>[],
): void {
  const known = new Set(sources.map((source) => source.sourceFingerprint));
  for (const claim of claims) {
    if (claim.sourceFingerprints.length === 0 || claim.sourceFingerprints.some((source) => !known.has(source))) {
      throw new Error(`R36B_UNSUPPORTED_CLAIM:${claim.claimId}`);
    }
  }
}
