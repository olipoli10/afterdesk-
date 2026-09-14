import { describe, expect, it, vi } from "vitest";
import { preparePersonalModelOperatorArtifact, validatePersonalModelOperatorArtifact } from "@/server/model-gateway/personal-intent/operator-preparation";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { loadPersonalModelConfiguration } from "@/server/model-gateway/personal-intent/configuration";
import * as governance from "@/server/model-gateway/policy";

const now = new Date("2026-09-10T12:00:00Z");
const document = { reviewRef: "synthetic-document-NOT-real-review", contentHash: `sha256:${"a".repeat(64)}` };
const rate = { authorityId: PERSONAL_MODEL_AUTHORITY, model: "synthetic/model", providerEndpoint: "synthetic-endpoint",
  reviewedAt: now.toISOString(), totalContextTokens: 32768, maxOutputTokens: 512,
  inputUsdMicrosPerMillionTokens: 1_000_000, outputUsdMicrosPerMillionTokens: 2_000_000,
  additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1_500_000, headroomBasisPoints: 1000,
  ceilingCadMicros: 20_000_000, perCallCeilingCadMicros: 100_000 };
const privacy = { adapterKey: "openrouter-personal-intent-candidate", allowedDataClasses: ["personal_data"],
  billingProvider: "openrouter", certificationOwner: "synthetic-NOT-real-certification", effectiveAt: now.toISOString(),
  endpointKey: rate.providerEndpoint, expiresAt: "2026-09-11T13:00:00Z", intermediary: "openrouter", modelKey: rate.model,
  operationTypes: ["personal_intent_candidate_v1"], pathKind: "gateway_mediated", privacyPosture: "zero_retention",
  residency: ["synthetic-region"], tenancyMode: "route_isolated" };
function config() {
  return structuredClone({ operatorReview: { reviewerRef: "synthetic-operator", reviewedAt: now.toISOString(),
    rates: document, fxAndFees: document, privacy: document, totalEnvelope: document },
  pilotContext: { authorityId: PERSONAL_MODEL_AUTHORITY, expiresAt: "2026-10-10T01:18:26Z" },
  rateConfiguration: rate, pilotEnvelopeReview: { authorityId: PERSONAL_MODEL_AUTHORITY, reviewRef: "synthetic-envelope",
    reviewedAt: now.toISOString(), nonModelExposureCeilingCadMicros: 80_000_000, totalCeilingCadMicros: 100_000_000 },
  privacyEvidence: privacy, route: { id: "synthetic-route-id", version: 1, residency: ["synthetic-region"], maxInputTokens: 32768 },
  policy: { id: "synthetic-policy-id", version: 1 } });
}
function prepare(configuration: unknown = config(), clock = now) {
  return preparePersonalModelOperatorArtifact({ enabled: true, configuration }, clock);
}
describe("offline personal-model operator preparation", () => {
  it("is OFF by default before touching configuration or process state", () => {
    expect(preparePersonalModelOperatorArtifact({ get configuration() { throw new Error("must not inspect"); } }, now))
      .toEqual({ status: "DISABLED", executionAuthorized: false });
  });
  it("produces exact immutable JSON-only draft bindings, not publication or evidence authenticity", () => {
    const input = config(); const result = prepare(input);
    expect(result.status).toBe("PREPARED_NOT_PUBLISHED");
    if (result.status !== "PREPARED_NOT_PUBLISHED") throw new Error("synthetic fixture");
    expect(result).toMatchObject({ publicationAuthorized: false, executionAuthorized: false, externalTransportPerformed: false,
      reviewAuthenticityVerified: false, providerCompatibilityObserved: false,
      draftRoute: { status: "draft", publishedAt: null, modelKey: rate.model, maxOutputTokens: rate.maxOutputTokens },
      draftPolicy: { status: "draft", publishedAt: null, maxAttempts: 1, fallbackRules: [],
        routeOrder: [{ routeKey: "personal-intent-openrouter-candidate-v1", version: 1 }] },
      reservation: { accounting: "NOT_RESERVED" } });
    expect(Object.isFrozen(result.configuration.operatorReview)).toBe(true);
    expect(Object.isFrozen(result.draftRoute.privacyEvidence.residency)).toBe(true);
    expect(result.artifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    input.privacyEvidence.residency[0] = "caller-changed";
    expect(result.draftRoute.privacyEvidence.residency).toEqual(["synthetic-region"]);
    expect(validatePersonalModelOperatorArtifact(JSON.parse(JSON.stringify(result)), now)).toEqual(result);
    expect(loadPersonalModelConfiguration({ NODE_ENV: "test", ...result.disabledSwitches,
      ENDVERA_PERSONAL_MODEL_CONFIGURATION_JSON: JSON.stringify(result.runtimeConfiguration) }, now).status).toBe("DISABLED");
    expect(result.remainingPrerequisites).toContain("CURRENT_OWNER_IDENTITY_AND_EXPLICIT_PERSONAL_MODEL_CONSENT");
  });
  it("lists separate absent prerequisites without inventing defaults", () => {
    expect(prepare({})).toMatchObject({ status: "INCOMPLETE", missing: expect.arrayContaining([
      "REVIEWER_AND_FOUR_REVIEW_DOCUMENT_HASHES_REQUIRED", "CURRENT_EXPLICIT_PILOT_CONTEXT_REQUIRED",
      "EXACT_ROUTE_VERSION_RESIDENCY_AND_INPUT_LIMIT_REQUIRED", "EXACT_POLICY_VERSION_REQUIRED",
      "EXACT_PRIVACY_EVIDENCE_REQUIRED", "CURRENT_VALID_RATE_FX_FEES_AND_BUDGET_REVIEW_REQUIRED",
    ]) });
  });
  it.each([null, { apiKey: "synthetic-secret-marker" }, { ...config(), unexpected: "synthetic-secret-marker" },
    { ...config(), operatorReview: { ...config().operatorReview, rates: { reviewRef: "missing-hash" } } },
    { ...config(), route: { ...config().route, version: 0 } },
    { ...config(), route: { ...config().route, residency: ["duplicate", "duplicate"] } },
    { ...config(), pilotContext: { authorityId: "R37", expiresAt: "2026-10-10T01:18:26Z" } },
  ])("rejects malformed, unknown or historic-authority inputs without echoing payload", input => {
    const result = prepare(input); expect(result.status).toBe("INCOMPLETE");
    expect(JSON.stringify(result)).not.toContain("synthetic-secret-marker");
  });
  it.each([
    { ...privacy, modelKey: "different-model" }, { ...privacy, endpointKey: "different-endpoint" },
    { ...privacy, privacyPosture: "standard" }, { ...privacy, expiresAt: now.toISOString() },
    { ...privacy, effectiveAt: "2026-09-11T12:00:00Z" }, { ...privacy, unknown: true },
    { ...privacy, tenancyMode: "shared" }, { ...privacy, allowedDataClasses: ["synthetic"] },
    { ...privacy, residency: ["other-region"] }, {},
  ])("uses existing closed privacy/path/time validator", privacyEvidence => {
    const result = prepare({ ...config(), privacyEvidence });
    expect(result).toMatchObject({ status: "INCOMPLETE", missing: [expect.stringMatching(/^EXISTING_GATEWAY_/)] });
  });
  it("cannot override an existing governance refusal", () => {
    const resolver = vi.spyOn(governance, "resolveGatewayPolicy").mockReturnValue({ disposition: "refused", reasonClass: "ineligible_route" });
    try { expect(prepare()).toMatchObject({ status: "INCOMPLETE", missing: ["EXISTING_GATEWAY_INELIGIBLE_ROUTE"] }); }
    finally { resolver.mockRestore(); }
  });
  it.each([
    { ...rate, model: "invalid model" }, { ...rate, providerEndpoint: "https://not-an-endpoint?credential=x" },
    { ...rate, maxOutputTokens: 8193, perCallCeilingCadMicros: 500_000 },
    { ...rate, totalContextTokens: 16000 }, { ...rate, ceilingCadMicros: 20_000_001 },
    { ...rate, reviewedAt: "2026-09-08T00:00:00Z" },
  ])("preserves exact adapter/token/budget compatibility", rateConfiguration => {
    expect(prepare({ ...config(), rateConfiguration }).status).toBe("INCOMPLETE");
  });
  it("requires valid envelope and current operator reviews", () => {
    expect(prepare({ ...config(), pilotEnvelopeReview: undefined })).toMatchObject({ status: "INCOMPLETE",
      missing: ["CURRENT_VALID_TOTAL_PILOT_ENVELOPE_REVIEW_REQUIRED"] });
    expect(prepare({ ...config(), operatorReview: { ...config().operatorReview, reviewedAt: "2026-09-08T00:00:00Z" } }).status).toBe("INCOMPLETE");
    expect(prepare(config(), new Date("invalid")).status).toBe("INCOMPLETE");
    expect(prepare(config(), new Date("2026-10-11T12:00:00Z")).status).toBe("INCOMPLETE");
  });
  it("binds reviewed document, rate and policy identities to hashes", () => {
    const before = prepare(); const input = config(); input.operatorReview.rates.contentHash = `sha256:${"b".repeat(64)}`;
    const after = prepare(input);
    if (before.status !== "PREPARED_NOT_PUBLISHED" || after.status !== "PREPARED_NOT_PUBLISHED") throw new Error("synthetic fixture");
    expect(after.artifactHash).not.toBe(before.artifactHash);
    expect(after.draftRoute.canonicalHash).not.toBe(before.draftRoute.canonicalHash);
    expect(after.draftPolicy.canonicalHash).not.toBe(before.draftPolicy.canonicalHash);
    expect(after.reviewedHashes.rateConfiguration).toBe(before.reviewedHashes.rateConfiguration);
  });
  it("rejects serialized artifact tampering, expired pilot validity and oversized payloads", () => {
    const result = prepare(); if (result.status !== "PREPARED_NOT_PUBLISHED") throw new Error("synthetic fixture");
    for (const changed of [ { ...result, executionAuthorized: true }, { ...result, artifactHash: `sha256:${"0".repeat(64)}` },
      { ...result, draftPolicy: { ...result.draftPolicy, status: "published" } },
      { ...result, draftRoute: { ...result.draftRoute, modelKey: "other-model" } },
      { ...result, disabledSwitches: { ...result.disabledSwitches, ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED" } },
    ]) expect(validatePersonalModelOperatorArtifact(changed, now).status).toBe("INCOMPLETE");
    expect(validatePersonalModelOperatorArtifact(result, new Date("2026-10-10T01:18:26Z")).status).toBe("INCOMPLETE");
    expect(prepare({ ...config(), excessive: "x".repeat(40000) }).status).toBe("INCOMPLETE");
    expect(validatePersonalModelOperatorArtifact({ ...result, excessive: "x".repeat(140000) }, now).status).toBe("INCOMPLETE");
  });
});
