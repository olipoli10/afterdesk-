import { afterEach, describe, expect, it, vi } from "vitest";
import { preparePersonalModelOperatorArtifact, validatePersonalModelOperatorArtifact } from "@/server/model-gateway/personal-intent/operator-preparation";
import { loadPersonalModelConfiguration } from "@/server/model-gateway/personal-intent/configuration";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";

const db = vi.hoisted(() => ({ $transaction: vi.fn(() => { throw new Error("DB forbidden"); }),
  $queryRawUnsafe: vi.fn(() => { throw new Error("DB forbidden"); }), $executeRawUnsafe: vi.fn(() => { throw new Error("DB forbidden"); }) }));
vi.mock("@/lib/db", () => ({ prisma: db }));
const now = new Date("2026-09-10T12:00:00Z");
const document = { reviewRef: "synthetic-evidence-not-authenticity", contentHash: `sha256:${"a".repeat(64)}` };
function configuration() {
  const rateConfiguration = { authorityId: PERSONAL_MODEL_AUTHORITY, model: "synthetic/model", providerEndpoint: "synthetic-endpoint",
    reviewedAt: now.toISOString(), totalContextTokens: 32768, maxOutputTokens: 512,
    inputUsdMicrosPerMillionTokens: 1_000_000, outputUsdMicrosPerMillionTokens: 2_000_000,
    additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1_500_000, headroomBasisPoints: 1000,
    ceilingCadMicros: 20_000_000, perCallCeilingCadMicros: 100_000 };
  return { operatorReview: { reviewerRef: "synthetic-reviewer", reviewedAt: now.toISOString(),
    rates: document, fxAndFees: document, privacy: document, totalEnvelope: document },
  pilotContext: { authorityId: PERSONAL_MODEL_AUTHORITY, expiresAt: "2026-10-10T01:18:26Z" }, rateConfiguration,
  pilotEnvelopeReview: { authorityId: PERSONAL_MODEL_AUTHORITY, reviewRef: "synthetic-envelope", reviewedAt: now.toISOString(),
    nonModelExposureCeilingCadMicros: 80_000_000, totalCeilingCadMicros: 100_000_000 },
  privacyEvidence: { adapterKey: "openrouter-personal-intent-candidate", allowedDataClasses: ["personal_data"],
    billingProvider: "openrouter", certificationOwner: "synthetic-not-a-certificate", effectiveAt: now.toISOString(),
    endpointKey: rateConfiguration.providerEndpoint, expiresAt: "2026-09-12T12:00:00Z", intermediary: "openrouter", modelKey: rateConfiguration.model,
    operationTypes: ["personal_intent_candidate_v1"], pathKind: "gateway_mediated", privacyPosture: "zero_retention",
    residency: ["synthetic-region"], tenancyMode: "route_isolated" },
  route: { id: "synthetic-route-id", version: 1, residency: ["synthetic-region"], maxInputTokens: 32768 },
  policy: { id: "synthetic-policy-id", version: 1 } };
}
function prepared(input: unknown = configuration()) {
  const result = preparePersonalModelOperatorArtifact({ enabled: true, configuration: input }, now);
  if (result.status !== "PREPARED_NOT_PUBLISHED") throw new Error(`Synthetic fixture ${JSON.stringify(result)}`);
  return result;
}
const localEnvironment = (encoded: string): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true",
  ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "DISABLED", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "false",
  ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY, ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z",
  ENDVERA_PERSONAL_MODEL_CONFIGURATION_JSON: encoded });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("operator artifact versus actual personal model runtime", () => {
  it("loads the emitted runtime config in the actual enabled local loader, with exact rate and budget pins", () => {
    const artifact = prepared();
    const result = loadPersonalModelConfiguration(localEnvironment(JSON.stringify(artifact.runtimeConfiguration)), now);
    expect(result.status).toBe("CONFIGURED_NOT_AUTHORIZED");
    if (result.status !== "CONFIGURED_NOT_AUTHORIZED") throw new Error("synthetic load");
    expect(result.executionAuthorized).toBe(false);
    expect(result.policyVersionId).toBe(artifact.draftPolicy.id);
    expect(result.rateConfiguration).toEqual(artifact.draftRoute.pricingEvidence.rateConfiguration);
    expect(result.budgetPolicy.reviewedRateFingerprint).toBe(artifact.reviewedHashes.rateConfiguration);
    expect(result.budgetPolicy.reservationUsdMicros.toString()).toBe(artifact.draftPolicy.maxTotalCostMicros);
    expect(result.budgetPolicy.reservationCadMicros.toString()).toBe(artifact.reservation.cadMicros);
    expect(result.budgetPolicy.model).toBe(artifact.draftRoute.modelKey);
    expect(result.budgetPolicy.providerEndpoint).toBe(artifact.draftRoute.endpointKey);
    expect(result.budgetPolicy.maxOutputTokens).toBe(artifact.draftRoute.maxOutputTokens);
  });
  it("disables the REAL model-specific transport switch, not an unused similarly named variable", () => {
    const switches = prepared().disabledSwitches as Record<string, string>;
    expect(switches.ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED).toBe("false");
    expect(switches).not.toHaveProperty("ENDVERA_PERSONAL_MODEL_TRANSPORT_ENABLED");
    const merged = { ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "true", ...switches };
    expect(merged.ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED).toBe("false");
  });
  it("accepts exactly 16KiB of runtime JSON and refuses one byte beyond without spilling contents", () => {
    const encoded = JSON.stringify(prepared().runtimeConfiguration);
    const exact = encoded + " ".repeat(16384 - Buffer.byteLength(encoded));
    expect(Buffer.byteLength(exact)).toBe(16384);
    expect(loadPersonalModelConfiguration(localEnvironment(exact), now).status).toBe("CONFIGURED_NOT_AUTHORIZED");
    expect(loadPersonalModelConfiguration(localEnvironment(exact + " "), now)).toEqual({ status: "REFUSED", executionAuthorized: false,
      reason: "PERSONAL_MODEL_CONFIGURATION_INVALID" });
  });
  it("keeps a maximum 32KiB preparation document out of the much smaller runtime config", () => {
    const input = configuration();
    input.privacyEvidence.certificationOwner += "x".repeat(32768 - Buffer.byteLength(JSON.stringify(input)));
    expect(Buffer.byteLength(JSON.stringify(input))).toBe(32768);
    const artifact = prepared(input);
    const encoded = JSON.stringify(artifact.runtimeConfiguration);
    expect(Buffer.byteLength(encoded)).toBeLessThan(16384);
    expect(loadPersonalModelConfiguration(localEnvironment(encoded), now).status).toBe("CONFIGURED_NOT_AUTHORIZED");
    expect(validatePersonalModelOperatorArtifact(JSON.parse(JSON.stringify(artifact)), now).status).toBe("PREPARED_NOT_PUBLISHED");
    input.privacyEvidence.certificationOwner += "x";
    expect(preparePersonalModelOperatorArtifact({ enabled: true, configuration: input }, now)).toMatchObject({ status: "INCOMPLETE",
      missing: ["BOUNDED_OPERATOR_CONFIGURATION_REQUIRED"] });
  });
  it.each(["model", "providerEndpoint"] as const)("rejects rate %s changes not also covered by the exact privacy certificate", field => {
    const input = configuration(); input.rateConfiguration[field] = "synthetic-other";
    expect(preparePersonalModelOperatorArtifact({ enabled: true, configuration: input }, now)).toMatchObject({ status: "INCOMPLETE",
      missing: ["EXISTING_GATEWAY_MISSING_PRIVACY_EVIDENCE"] });
  });
  it("changes all rate-dependent hashes and reservations when explicit reviewed pricing changes", () => {
    const original = prepared(); const input = configuration(); input.rateConfiguration.additionalUsdMicrosPerCall = 1;
    const changed = prepared(input);
    expect(changed.reviewedHashes.rateConfiguration).not.toBe(original.reviewedHashes.rateConfiguration);
    expect(changed.draftPolicy.canonicalHash).not.toBe(original.draftPolicy.canonicalHash);
    expect(changed.draftRoute.canonicalHash).not.toBe(original.draftRoute.canonicalHash);
    expect(BigInt(changed.reservation.usdMicros)).toBe(BigInt(original.reservation.usdMicros) + 1n);
    expect(changed.reviewedHashes.privacyEvidence).toBe(original.reviewedHashes.privacyEvidence);
  });
  it("does not accept rewritten runtime/pricing pins even if the caller recalculates the outer artifact hash", () => {
    for (const target of ["runtime", "pricing"] as const) {
      const artifact = JSON.parse(JSON.stringify(prepared()));
      if (target === "runtime") artifact.runtimeConfiguration.rateConfiguration.model = "different";
      else artifact.draftRoute.pricingEvidence.rateConfiguration.inputUsdMicrosPerMillionTokens = 1;
      const body = { ...artifact }; delete body.artifactHash;
      artifact.artifactHash = canonicalFingerprint(body);
      expect(validatePersonalModelOperatorArtifact(artifact, now)).toMatchObject({ status: "INCOMPLETE",
        missing: ["OPERATOR_ARTIFACT_INTEGRITY_MISMATCH"] });
    }
  });
  it("performs neither provider, key lookup, database publication nor activation during preparation/validation/loading", () => {
    const network = vi.fn(() => { throw new Error("Network forbidden"); }); vi.stubGlobal("fetch", network);
    const artifact = prepared();
    expect(validatePersonalModelOperatorArtifact(artifact, now).status).toBe("PREPARED_NOT_PUBLISHED");
    expect(loadPersonalModelConfiguration(localEnvironment(JSON.stringify(artifact.runtimeConfiguration)), now).status).toBe("CONFIGURED_NOT_AUTHORIZED");
    expect(network).not.toHaveBeenCalled(); Object.values(db).forEach(call => expect(call).not.toHaveBeenCalled());
    expect(artifact.draftPolicy.status).toBe("draft"); expect(artifact.draftRoute.publishedAt).toBeNull();
    expect(artifact.executionAuthorized).toBe(false); expect(artifact.reviewAuthenticityVerified).toBe(false);
    expect(JSON.stringify(artifact)).not.toMatch(/apiKey|ciphertext|credentialRef|accessToken/);
    const rejected = preparePersonalModelOperatorArtifact({ enabled: true, configuration: { ...configuration(), apiKey: "synthetic-secret-marker" } }, now);
    expect(rejected.status).toBe("INCOMPLETE"); expect(JSON.stringify(rejected)).not.toContain("synthetic-secret-marker");
  });
});
