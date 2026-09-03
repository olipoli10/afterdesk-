import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import { preparePerplexitySearchPlan } from "@/lib/construction-operating-assistant-r36b/perplexity";
import { sealSyntheticAttempt } from "@/server/construction-operating-assistant-r37a/sealed-executor";
import { normalizeSyntheticProviderFixture } from "@/lib/construction-operating-assistant-r37d/normalize";

const ceilings = { maxLatencyMs: 5_000, maxCostMicros: 1_000, maxOutputTokens: 1_000, maxSources: 5 };

function sealed(candidateKey: "OPENROUTER_CONTROLLER" | "PERPLEXITY_SEARCH") {
  const sandboxCase = sealSandboxCase({
    schemaVersion: 1,
    caseId: candidateKey === "OPENROUTER_CONTROLLER" ? "R36B-R37D-CONTROLLER" : "R36B-R37D-RESEARCH",
    caseVersion: 1,
    intent: candidateKey === "OPENROUTER_CONTROLLER" ? "CONTROLLER_REASONING" : "PUBLIC_BUSINESS_RESEARCH",
    locale: "fr-CA",
    region: "CA",
    orderedFacts: [{ key: "question", value: "Trouver une source publique synthétique" }],
    dataClass: candidateKey === "OPENROUTER_CONTROLLER" ? "business_confidential" : "public",
    outputContractKey: candidateKey === "OPENROUTER_CONTROLLER" ? "controller-result-v1" : "research-result-v1",
    ceilings,
    syntheticOnly: true,
  });
  const campaign = createR37CampaignManifest({ packets: Object.values(R36B_CANDIDATE_PACKETS), cases: [sandboxCase] });
  const requestPlan = candidateKey === "OPENROUTER_CONTROLLER"
    ? prepareOpenRouterControllerPlan(crypto.randomUUID(), sandboxCase)
    : preparePerplexitySearchPlan(crypto.randomUUID(), sandboxCase);
  return sealSyntheticAttempt({
    campaign,
    sandboxCase,
    requestPlan,
    authorization: {
      schemaVersion: 1,
      executionMode: "SYNTHETIC_TRANSPORT",
      authorizationId: crypto.randomUUID(),
      authorizedAt: "2026-09-02T17:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      candidateKey,
      exactModelId: candidateKey === "OPENROUTER_CONTROLLER" ? "example/controller-v1" : "example/search-v1",
    },
    now: "2026-09-02T17:01:00.000Z",
  });
}

function openRouterFixture(overrides: Record<string, unknown> = {}) {
  return {
    responseId: "synthetic-openrouter-1",
    model: "example/controller-v1",
    providerRoute: "OPENROUTER_CONTROLLER",
    choices: [{ index: 0, finishReason: "stop", message: { role: "assistant", content: "Action locale proposée." } }],
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    externalTransportPerformed: false,
    ...overrides,
  };
}

function perplexityFixture(overrides: Record<string, unknown> = {}) {
  const source = {
    title: "Source synthétique",
    url: "https://example.invalid/public-source",
    snippet: "Information publique synthétique.",
    sourceDate: "2026-09-02",
  };
  return {
    responseId: "synthetic-perplexity-1",
    providerRoute: "PERPLEXITY_SEARCH",
    answer: "Le résultat est soutenu par la source publique synthétique.",
    citations: [source.url],
    results: [source, source],
    externalTransportPerformed: false,
    ...overrides,
  };
}

describe("R37D provider delivery contracts", () => {
  it("normalizes exact OpenRouter controller output deterministically", () => {
    const input = { candidateKey: "OPENROUTER_CONTROLLER", sealed: sealed("OPENROUTER_CONTROLLER"), fixture: openRouterFixture(), latencyMs: 20, costMicros: 300 };
    const first = normalizeSyntheticProviderFixture(input);
    const second = normalizeSyntheticProviderFixture(input);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      candidateKey: "OPENROUTER_CONTROLLER",
      exactModelId: "example/controller-v1",
      answer: "Action locale proposée.",
      sources: [],
      citationUrls: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      evidenceLabel: "SYNTHETIC",
      certified: false,
      externalTransportPerformed: false,
    });
  });

  it("normalizes and deterministically deduplicates citation-bound Perplexity research", () => {
    const result = normalizeSyntheticProviderFixture({ candidateKey: "PERPLEXITY_SEARCH", sealed: sealed("PERPLEXITY_SEARCH"), fixture: perplexityFixture(), latencyMs: 30, costMicros: 250 });
    expect(result).toMatchObject({ candidateKey: "PERPLEXITY_SEARCH", exactModelId: "example/search-v1", evidenceLabel: "SYNTHETIC" });
    expect(result.sources).toHaveLength(1);
    expect(result.citationUrls).toEqual(["https://example.invalid/public-source"]);
    expect(result.sources[0]).toMatchObject({ title: "Source synthétique", url: "https://example.invalid/public-source" });
  });

  it("refuses binding, route, model, tool-call and usage mutations by exact guard", () => {
    const controller = sealed("OPENROUTER_CONTROLLER");
    const base = { candidateKey: "OPENROUTER_CONTROLLER", sealed: controller, fixture: openRouterFixture(), latencyMs: 20, costMicros: 300 } as const;
    expect(() => normalizeSyntheticProviderFixture({ ...base, candidateKey: "PERPLEXITY_SEARCH" })).toThrow("R37D_REQUEST_BINDING_MISMATCH");
    expect(() => normalizeSyntheticProviderFixture({ ...base, fixture: openRouterFixture({ providerRoute: "FALLBACK_PROVIDER" }) })).toThrow("R37D_PROVIDER_ROUTE_DRIFT");
    expect(() => normalizeSyntheticProviderFixture({ ...base, fixture: openRouterFixture({ model: "other/model" }) })).toThrow("R37D_EXACT_MODEL_DRIFT");
    expect(() => normalizeSyntheticProviderFixture({ ...base, fixture: openRouterFixture({ choices: [{ index: 0, finishReason: "stop", message: { role: "assistant", content: "x", tool_calls: [] } }] }) })).toThrow("R37D_TOOL_CALLS_REFUSED");
    expect(() => normalizeSyntheticProviderFixture({ ...base, fixture: openRouterFixture({ usage: { promptTokens: 10, completionTokens: 5, totalTokens: 14 } }) })).toThrow("R37D_USAGE_TOTAL_INVALID");
    expect(() => normalizeSyntheticProviderFixture({ ...base, fixture: openRouterFixture({ unexpectedCredentialField: "ref" }) })).toThrow("R37D_RESPONSE_SCHEMA_INVALID");
  });

  it("refuses missing, foreign and conflicting research citations", () => {
    const research = sealed("PERPLEXITY_SEARCH");
    const base = { candidateKey: "PERPLEXITY_SEARCH", sealed: research, fixture: perplexityFixture(), latencyMs: 20, costMicros: 300 } as const;
    expect(() => normalizeSyntheticProviderFixture({ ...base, fixture: perplexityFixture({ citations: [] }) })).toThrow("R37D_CITATION_REQUIRED");
    expect(() => normalizeSyntheticProviderFixture({ ...base, fixture: perplexityFixture({ citations: ["https://example.invalid/unknown"] }) })).toThrow("R37D_CITATION_NOT_IN_SOURCES");
    const source = (perplexityFixture().results as Array<Record<string, unknown>>)[0];
    expect(() => normalizeSyntheticProviderFixture({ ...base, fixture: perplexityFixture({ results: [source, { ...source, snippet: "Contradiction" }] }) })).toThrow("R37D_CONFLICTING_DUPLICATE_SOURCE");
  });

  it("refuses output, cost and latency ceiling mutations", () => {
    const controller = sealed("OPENROUTER_CONTROLLER");
    const base = { candidateKey: "OPENROUTER_CONTROLLER", sealed: controller, fixture: openRouterFixture(), latencyMs: 20, costMicros: 300 } as const;
    expect(() => normalizeSyntheticProviderFixture({ ...base, fixture: openRouterFixture({ choices: [{ index: 0, finishReason: "stop", message: { role: "assistant", content: "x".repeat(5_000) } }] }) })).toThrow("R37D_RESPONSE_SIZE_EXCEEDED");
    expect(() => normalizeSyntheticProviderFixture({ ...base, costMicros: 1_001 })).toThrow("R37D_COST_CEILING_EXCEEDED");
    expect(() => normalizeSyntheticProviderFixture({ ...base, latencyMs: 5_001 })).toThrow("R37D_LATENCY_CEILING_EXCEEDED");
  });

  it("contains no network, credential resolution or observed-provider claim", () => {
    const source = [
      "src/lib/construction-operating-assistant-r37d/contracts.ts",
      "src/lib/construction-operating-assistant-r37d/normalize.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\bfetch\s*\(|axios|process\.env|Bun\.env|Deno\.env|\bAuthorization\s*:/u);
    expect(source).not.toMatch(/sk-[A-Za-z0-9]|pplx-[A-Za-z0-9]/u);
    expect(source).toContain('evidenceLabel: "SYNTHETIC"');
    expect(source).toContain("externalTransportPerformed: false");
  });
});
