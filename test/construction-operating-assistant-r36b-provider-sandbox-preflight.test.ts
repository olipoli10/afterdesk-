import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  providerCandidatePacketSchema,
  providerCandidatePacketUnsignedSchema,
  providerRequestPlanSchema,
  r36bFingerprint,
} from "@/lib/construction-operating-assistant-r36b/contracts";
import {
  R36B_CANDIDATE_PACKETS,
  requireCurrentCandidatePacket,
  sealSandboxCase,
} from "@/lib/construction-operating-assistant-r36b/candidates";
import {
  normalizeSyntheticPerplexityResponse,
  preparePerplexitySearchPlan,
  verifySourceSupportedClaims,
} from "@/lib/construction-operating-assistant-r36b/perplexity";
import {
  assertR37ModelBinding,
  prepareOpenRouterControllerPlan,
} from "@/lib/construction-operating-assistant-r36b/openrouter";
import {
  compareSyntheticCandidates,
  createSyntheticObservation,
} from "@/lib/construction-operating-assistant-r36b/benchmark";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";

const ceilings = { maxLatencyMs: 10_000, maxCostMicros: 500_000, maxOutputTokens: 1_000, maxSources: 5 };
const companyCase = sealSandboxCase({
  schemaVersion: 1,
  caseId: "R36B-COMPANY-01",
  caseVersion: 1,
  intent: "PUBLIC_BUSINESS_RESEARCH",
  locale: "fr-CA",
  region: "CA",
  orderedFacts: [{ key: "demande", value: "Vérifier la réputation publique du fournisseur synthétique Laval" }],
  dataClass: "public",
  outputContractKey: "normalized-public-source-evidence-v1",
  ceilings,
  syntheticOnly: true,
});
const personCase = sealSandboxCase({
  schemaVersion: 1,
  caseId: "R36B-PERSON-01",
  caseVersion: 1,
  intent: "PUBLIC_PROFESSIONAL_RESEARCH",
  locale: "fr-CA",
  region: "CA",
  orderedFacts: [{ key: "demande", value: "Expérience professionnelle publique de Marc Synthétique" }],
  dataClass: "public",
  outputContractKey: "normalized-public-source-evidence-v1",
  ceilings,
  syntheticOnly: true,
});
const controllerCase = sealSandboxCase({
  schemaVersion: 1,
  caseId: "R36B-CONTROLLER-01",
  caseVersion: 1,
  intent: "CONTROLLER_REASONING",
  locale: "fr-CA",
  region: "CA",
  orderedFacts: [
    { key: "chantier", value: "Rénovation Laval synthétique" },
    { key: "question", value: "Identifier le prochain risque opérationnel" },
  ],
  dataClass: "business_confidential",
  outputContractKey: "assistant-controller-result-v1",
  ceilings,
  syntheticOnly: true,
});

describe("R36B provider sandbox preflight", () => {
  it("seals exactly three strict, candidate-only and non-dispatchable packets", () => {
    expect(Object.keys(R36B_CANDIDATE_PACKETS)).toEqual([
      "PERPLEXITY_SEARCH",
      "OPENROUTER_CONTROLLER",
      "DIRECT_CONTROLLER_CONTROL",
    ]);
    for (const packet of Object.values(R36B_CANDIDATE_PACKETS)) {
      const unsigned = providerCandidatePacketUnsignedSchema.parse({
        schemaVersion: packet.schemaVersion,
        packetVersion: packet.packetVersion,
        providerKey: packet.providerKey,
        capabilityKey: packet.capabilityKey,
        endpointFamily: packet.endpointFamily,
        allowedDataClasses: packet.allowedDataClasses,
        forbiddenDataClasses: packet.forbiddenDataClasses,
        requiredPrivacyRules: packet.requiredPrivacyRules,
        perAttemptCostCeilingMicros: packet.perAttemptCostCeilingMicros,
        outputContractKey: packet.outputContractKey,
        verificationContractKey: packet.verificationContractKey,
        officialEvidence: packet.officialEvidence,
        evidenceLabel: packet.evidenceLabel,
        candidateOnly: packet.candidateOnly,
        providerExecutionAuthorized: packet.providerExecutionAuthorized,
        externalDispatchPerformed: packet.externalDispatchPerformed,
      });
      expect(packet.packetFingerprint).toBe(r36bFingerprint(unsigned));
      expect(packet).toMatchObject({ candidateOnly: true, providerExecutionAuthorized: false, externalDispatchPerformed: false });
      expect(packet.officialEvidence.every((item) => item.url.startsWith("https://"))).toBe(true);
    }
  });

  it("rejects unknown packet fields and expired official evidence", () => {
    expect(() => providerCandidatePacketSchema.parse({ ...R36B_CANDIDATE_PACKETS.PERPLEXITY_SEARCH, invented: true })).toThrow();
    expect(() => requireCurrentCandidatePacket("PERPLEXITY_SEARCH", "2026-10-03")).toThrow("R36B_EVIDENCE_EXPIRED");
  });

  it("seals sandbox cases deterministically and preserves ordered facts", () => {
    const replay = sealSandboxCase({
      schemaVersion: 1, caseId: "R36B-COMPANY-01", caseVersion: 1,
      intent: "PUBLIC_BUSINESS_RESEARCH", locale: "fr-CA", region: "CA",
      orderedFacts: [{ key: "demande", value: "Vérifier la réputation publique du fournisseur synthétique Laval" }],
      dataClass: "public", outputContractKey: "normalized-public-source-evidence-v1", ceilings, syntheticOnly: true,
    });
    expect(replay).toEqual(companyCase);
    expect([...controllerCase.orderedFacts].reverse()).not.toEqual(controllerCase.orderedFacts);
  });

  it("prepares bounded company and professional Perplexity plans", () => {
    const company = preparePerplexitySearchPlan("10000000-0000-4000-8000-000000000001", companyCase);
    const person = preparePerplexitySearchPlan("10000000-0000-4000-8000-000000000002", personCase);
    expect(company).toMatchObject({ providerKey: "PERPLEXITY_SEARCH", payload: { searchType: "web", country: "CA", maxResults: 5 }, dispatchable: false });
    expect(person).toMatchObject({ providerKey: "PERPLEXITY_SEARCH", payload: { searchType: "people" }, credentialResolved: false });
    expect(JSON.stringify(company)).not.toMatch(/Bearer|pplx-|apiKey/iu);
  });

  it("refuses non-public or controller input before Perplexity preparation", () => {
    expect(() => preparePerplexitySearchPlan("10000000-0000-4000-8000-000000000003", controllerCase)).toThrow("R36B_RESEARCH_PUBLIC_DATA_ONLY");
    const privateCase = { ...personCase, dataClass: "personal_data" as const };
    expect(() => preparePerplexitySearchPlan("10000000-0000-4000-8000-000000000004", privateCase)).toThrow("R36B_RESEARCH_PUBLIC_DATA_ONLY");
  });

  it("normalizes bounded source evidence and refuses invalid or unknown response fields", () => {
    const sources = normalizeSyntheticPerplexityResponse({ results: [{
      title: "Registre public synthétique", url: "https://example.invalid/source", snippet: "Information professionnelle synthétique.", date: "2026-09-01",
    }] });
    expect(sources[0]).toMatchObject({ title: "Registre public synthétique", sourceDate: "2026-09-01" });
    expect(sources[0].sourceFingerprint).toMatch(/^sha256:/u);
    expect(() => normalizeSyntheticPerplexityResponse({ results: [{ title: "x", url: "file:///secret", snippet: "x", extra: true }] })).toThrow();
  });

  it("requires every factual research claim to reference a known normalized source", () => {
    const sources = normalizeSyntheticPerplexityResponse({ results: [{ title: "Source", url: "https://example.invalid/a", snippet: "Fait synthétique" }] });
    expect(() => verifySourceSupportedClaims([{ claimId: "C1", sourceFingerprints: [sources[0].sourceFingerprint] }], sources)).not.toThrow();
    expect(() => verifySourceSupportedClaims([{ claimId: "C2", sourceFingerprints: [] }], sources)).toThrow("R36B_UNSUPPORTED_CLAIM:C2");
    expect(() => verifySourceSupportedClaims([{ claimId: "C3", sourceFingerprints: [r36bFingerprint("unknown")] }], sources)).toThrow("R36B_UNSUPPORTED_CLAIM:C3");
  });

  it("prepares OpenRouter with one unresolved profile and strict privacy/fallback controls", () => {
    const plan = prepareOpenRouterControllerPlan("20000000-0000-4000-8000-000000000001", controllerCase);
    expect(plan).toMatchObject({
      providerKey: "OPENROUTER_CONTROLLER",
      payload: {
        modelProfileKey: "FRONTIER_CONTROLLER_PRIMARY_CANDIDATE",
        providerModelId: null,
        modelBindingState: "R37_SELECTION_REQUIRED",
        provider: { allowFallbacks: false, requireParameters: true, dataCollection: "deny", zdr: true },
      },
      dispatchable: false,
      providerExecutionAuthorized: false,
      externalDispatchPerformed: false,
    });
    expect(() => assertR37ModelBinding(plan)).toThrow("R37_EXACT_MODEL_SELECTION_REQUIRED");
  });

  it("refuses unknown or weakened OpenRouter plan fields", () => {
    const plan = prepareOpenRouterControllerPlan("20000000-0000-4000-8000-000000000002", controllerCase);
    if (plan.providerKey !== "OPENROUTER_CONTROLLER") throw new Error("unexpected plan type");
    expect(() => providerRequestPlanSchema.parse({ ...plan, payload: { ...plan.payload, provider: { ...plan.payload.provider, zdr: false } } })).toThrow();
    expect(() => providerRequestPlanSchema.parse({ ...plan, payload: { ...plan.payload, modelProfileKey: "openrouter/auto" } })).toThrow();
    expect(() => providerRequestPlanSchema.parse({ ...plan, apiKey: "sk-not-allowed" })).toThrow();
  });

  it("refuses a research case on the controller route", () => {
    expect(() => prepareOpenRouterControllerPlan("20000000-0000-4000-8000-000000000003", companyCase)).toThrow("R36B_CONTROLLER_INTENT_REQUIRED");
  });

  function observation(providerKey: "PERPLEXITY_SEARCH" | "OPENROUTER_CONTROLLER" | "DIRECT_CONTROLLER_CONTROL", overrides: Partial<Parameters<typeof createSyntheticObservation>[0]> = {}) {
    const packet = R36B_CANDIDATE_PACKETS[providerKey];
    return createSyntheticObservation({
      providerKey,
      packetFingerprint: packet.packetFingerprint,
      caseFingerprint: controllerCase.caseFingerprint,
      ceilingFingerprint: controllerCase.ceilingFingerprint,
      responseFixture: { fixture: providerKey },
      normalizedOutput: { result: "synthetic" },
      latencyMs: 100,
      costMicros: 100_000,
      contractValid: true,
      citationCoverageBps: 10_000,
      unsupportedClaimCount: 0,
      ceilings,
      ...overrides,
    });
  }

  it("creates deterministic observations without raw response content", () => {
    const first = observation("OPENROUTER_CONTROLLER");
    const replay = observation("OPENROUTER_CONTROLLER");
    expect(replay).toEqual(first);
    expect(JSON.stringify(first)).not.toContain("synthetic");
    expect(first).toMatchObject({ evidenceLabel: "SYNTHETIC", failureClass: "NONE" });
  });

  it("seals an equal-input comparison without selecting a provider", () => {
    const report = compareSyntheticCandidates([
      observation("OPENROUTER_CONTROLLER"), observation("DIRECT_CONTROLLER_CONTROL"),
    ], 500_000);
    expect(report).toMatchObject({ verdict: "NO_PROVIDER_SELECTION", validObservationCount: 2, providerExecutionCount: 0, externalDispatchCount: 0 });
    const replay = compareSyntheticCandidates([
      observation("DIRECT_CONTROLLER_CONTROL"), observation("OPENROUTER_CONTROLLER"),
    ], 500_000);
    expect(replay).toEqual(report);
  });

  it("refuses unequal inputs, unequal ceilings and duplicate candidate observations", () => {
    const base = observation("OPENROUTER_CONTROLLER");
    expect(() => compareSyntheticCandidates([base, observation("DIRECT_CONTROLLER_CONTROL", { caseFingerprint: r36bFingerprint("other") })], 500_000)).toThrow("R36B_UNEQUAL_CASE_INPUT");
    expect(() => compareSyntheticCandidates([base, observation("DIRECT_CONTROLLER_CONTROL", { ceilingFingerprint: r36bFingerprint("other") })], 500_000)).toThrow("R36B_UNEQUAL_CEILINGS");
    expect(() => compareSyntheticCandidates([base, base], 500_000)).toThrow("R36B_DUPLICATE_CANDIDATE_OBSERVATION");
  });

  it("refuses invalid, unsupported, over-budget and over-latency observations", () => {
    expect(() => compareSyntheticCandidates([observation("OPENROUTER_CONTROLLER", { unsupportedClaimCount: 1 }), observation("DIRECT_CONTROLLER_CONTROL")], 500_000)).toThrow("UNSUPPORTED_CLAIM");
    expect(() => compareSyntheticCandidates([observation("OPENROUTER_CONTROLLER", { costMicros: 500_001 }), observation("DIRECT_CONTROLLER_CONTROL")], 1_000_000)).toThrow("BUDGET_EXCEEDED");
    expect(() => compareSyntheticCandidates([observation("OPENROUTER_CONTROLLER", { latencyMs: 10_001 }), observation("DIRECT_CONTROLLER_CONTROL")], 500_000)).toThrow("LATENCY_EXCEEDED");
    expect(() => compareSyntheticCandidates([observation("OPENROUTER_CONTROLLER"), observation("DIRECT_CONTROLLER_CONTROL")], 100_000)).toThrow("R36B_CAMPAIGN_BUDGET_EXCEEDED");
  });

  it("prepares the exact non-authorized R37 campaign with references only", () => {
    const manifest = createR37CampaignManifest({ packets: Object.values(R36B_CANDIDATE_PACKETS), cases: [companyCase, personCase, controllerCase] });
    expect(manifest).toMatchObject({ state: "PREPARED_NOT_AUTHORIZED", maximumCallCount: 12, maximumTotalSpendMicros: 5_000_000, providerExecutionAuthorized: false, externalDispatchPerformed: false });
    expect(manifest.secretReferenceNames.every((value) => value.endsWith("_API_KEY"))).toBe(true);
  });

  it("refuses credential-shaped values and incomplete candidate campaigns", () => {
    expect(() => createR37CampaignManifest({ packets: Object.values(R36B_CANDIDATE_PACKETS), cases: [companyCase], secretReferenceNames: ["sk-live-secret", "R37_OPENROUTER_CONTROLLER_API_KEY", "R37_DIRECT_CONTROLLER_API_KEY"] })).toThrow("R36B_SECRET_VALUE_REFUSED");
    expect(() => createR37CampaignManifest({ packets: [R36B_CANDIDATE_PACKETS.PERPLEXITY_SEARCH], cases: [companyCase] })).toThrow("R36B_EXACT_THREE_CANDIDATES_REQUIRED");
  });

  it("contains no HTTP client, provider SDK import or environment-secret access", () => {
    const files = ["contracts.ts", "candidates.ts", "perplexity.ts", "openrouter.ts", "benchmark.ts", "campaign.ts"];
    const source = files.map((file) => readFileSync(join(process.cwd(), "src/lib/construction-operating-assistant-r36b", file), "utf8")).join("\n");
    expect(source).not.toMatch(/\bfetch\s*\(|axios|openai\b|@anthropic|process\.env|Bun\.env|Deno\.env/iu);
    expect(source).not.toMatch(/Authorization\s*:|Bearer\s+[A-Za-z0-9]/u);
  });
});
