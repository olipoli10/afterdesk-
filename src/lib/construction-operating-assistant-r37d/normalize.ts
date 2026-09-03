import {
  normalizedSourceEvidenceSchema,
  normalizedSourceEvidenceUnsignedSchema,
} from "@/lib/construction-operating-assistant-r36b/contracts";
import {
  assertSealedSyntheticAttempt,
} from "@/lib/construction-operating-assistant-r37c/contracts";
import { r37aFingerprint } from "@/lib/construction-operating-assistant-r37a/contracts";
import {
  canonicalProviderEvidenceSchema,
  normalizeProviderFixtureInputSchema,
  openRouterSyntheticFixtureSchema,
  perplexitySyntheticFixtureSchema,
  type CanonicalProviderEvidence,
  type NormalizeProviderFixtureInput,
} from "./contracts";

function byteLength(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    throw new Error("R37D_RESPONSE_NOT_SERIALIZABLE");
  }
}

function inspectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("R37D_RESPONSE_SCHEMA_INVALID");
  }
  return value as Record<string, unknown>;
}

function enforceCommonBinding(input: NormalizeProviderFixtureInput) {
  assertSealedSyntheticAttempt(input.sealed);
  if (input.sealed.authorization.candidateKey !== input.candidateKey || input.sealed.preparedRequest.candidateKey !== input.candidateKey) {
    throw new Error("R37D_REQUEST_BINDING_MISMATCH");
  }
  if (!input.sealed.authorization.exactModelId) {
    throw new Error("R37D_EXACT_MODEL_REQUIRED");
  }
  if (input.latencyMs > input.sealed.sandboxCase.ceilings.maxLatencyMs) {
    throw new Error("R37D_LATENCY_CEILING_EXCEEDED");
  }
  if (input.costMicros > input.sealed.sandboxCase.ceilings.maxCostMicros) {
    throw new Error("R37D_COST_CEILING_EXCEEDED");
  }
  if (byteLength(input.fixture) > input.sealed.sandboxCase.ceilings.maxOutputTokens * 4) {
    throw new Error("R37D_RESPONSE_SIZE_EXCEEDED");
  }
}

function normalizeOpenRouter(input: NormalizeProviderFixtureInput) {
  const record = inspectRecord(input.fixture);
  if (record.providerRoute !== "OPENROUTER_CONTROLLER") {
    throw new Error("R37D_PROVIDER_ROUTE_DRIFT");
  }
  if (record.model !== input.sealed.authorization.exactModelId) {
    throw new Error("R37D_EXACT_MODEL_DRIFT");
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const message = inspectRecord(inspectRecord(choices[0]).message);
  if ("toolCalls" in message || "tool_calls" in message) {
    throw new Error("R37D_TOOL_CALLS_REFUSED");
  }
  const parsed = openRouterSyntheticFixtureSchema.safeParse(input.fixture);
  if (!parsed.success) throw new Error("R37D_RESPONSE_SCHEMA_INVALID");
  if (parsed.data.usage.totalTokens !== parsed.data.usage.promptTokens + parsed.data.usage.completionTokens) {
    throw new Error("R37D_USAGE_TOTAL_INVALID");
  }
  return {
    responseId: parsed.data.responseId,
    answer: parsed.data.choices[0].message.content,
    sources: [],
    citationUrls: [],
    usage: parsed.data.usage,
  };
}

function normalizePerplexity(input: NormalizeProviderFixtureInput) {
  const record = inspectRecord(input.fixture);
  if (record.providerRoute !== "PERPLEXITY_SEARCH") {
    throw new Error("R37D_PROVIDER_ROUTE_DRIFT");
  }
  if (!Array.isArray(record.citations) || record.citations.length === 0) {
    throw new Error("R37D_CITATION_REQUIRED");
  }
  const parsed = perplexitySyntheticFixtureSchema.safeParse(input.fixture);
  if (!parsed.success) throw new Error("R37D_RESPONSE_SCHEMA_INVALID");
  const exactSources = new Map<string, typeof parsed.data.results[number]>();
  for (const source of parsed.data.results) {
    if (!/^https?:\/\//u.test(source.url)) throw new Error("R37D_PUBLIC_SOURCE_URL_REQUIRED");
    const prior = exactSources.get(source.url);
    if (prior && JSON.stringify(prior) !== JSON.stringify(source)) {
      throw new Error("R37D_CONFLICTING_DUPLICATE_SOURCE");
    }
    exactSources.set(source.url, source);
  }
  const cited = new Set(parsed.data.citations);
  if ([...cited].some((url) => !exactSources.has(url))) {
    throw new Error("R37D_CITATION_NOT_IN_SOURCES");
  }
  const sources = [...exactSources.values()]
    .sort((left, right) => left.url.localeCompare(right.url))
    .map((source) => {
      const unsigned = normalizedSourceEvidenceUnsignedSchema.parse(source);
      return normalizedSourceEvidenceSchema.parse({
        ...unsigned,
        sourceFingerprint: r37aFingerprint(unsigned),
      });
    });
  return {
    responseId: parsed.data.responseId,
    answer: parsed.data.answer,
    sources,
    citationUrls: [...cited].sort(),
    usage: { promptTokens: null, completionTokens: null, totalTokens: null },
  };
}

export function normalizeSyntheticProviderFixture(rawInput: unknown): CanonicalProviderEvidence {
  const parsedInput = normalizeProviderFixtureInputSchema.safeParse(rawInput);
  if (!parsedInput.success) throw new Error("R37D_INPUT_SCHEMA_INVALID");
  const input = parsedInput.data;
  enforceCommonBinding(input);
  const normalized = input.candidateKey === "OPENROUTER_CONTROLLER"
    ? normalizeOpenRouter(input)
    : normalizePerplexity(input);
  const unsigned = {
    schemaVersion: 1 as const,
    evidenceLabel: "SYNTHETIC" as const,
    certified: false as const,
    candidateKey: input.candidateKey,
    exactModelId: input.sealed.authorization.exactModelId!,
    sealedAttemptFingerprint: input.sealed.sealedAttemptFingerprint,
    preparedRequestFingerprint: input.sealed.preparedRequest.preparedRequestFingerprint,
    providerResponseFingerprint: r37aFingerprint({ responseId: normalized.responseId, fixture: input.fixture }),
    answer: normalized.answer,
    sources: normalized.sources,
    citationUrls: normalized.citationUrls,
    usage: normalized.usage,
    latencyMs: input.latencyMs,
    costMicros: input.costMicros,
    externalTransportPerformed: false as const,
  };
  return canonicalProviderEvidenceSchema.parse({
    ...unsigned,
    evidenceFingerprint: r37aFingerprint(unsigned),
  });
}
