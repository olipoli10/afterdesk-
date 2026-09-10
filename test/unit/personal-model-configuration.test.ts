import { describe, expect, it } from "vitest";
import { loadPersonalModelConfiguration } from "@/server/model-gateway/personal-intent/configuration";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
const now = new Date("2026-09-10T12:00:00Z");
const config = { schemaVersion: 1, policyVersionId: "synthetic-policy", rateConfiguration: {
  authorityId: PERSONAL_MODEL_AUTHORITY, model: "synthetic/model", providerEndpoint: "synthetic-endpoint", reviewedAt: now.toISOString(),
  totalContextTokens: 32768, maxOutputTokens: 512, inputUsdMicrosPerMillionTokens: 1_000_000, outputUsdMicrosPerMillionTokens: 2_000_000,
  additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1_500_000, headroomBasisPoints: 1000, ceilingCadMicros: 20_000_000, perCallCeilingCadMicros: 100_000,
}, pilotEnvelopeReview: { authorityId: PERSONAL_MODEL_AUTHORITY, reviewRef: "synthetic-not-billing-proof", reviewedAt: now.toISOString(),
  nonModelExposureCeilingCadMicros: 80_000_000, totalCeilingCadMicros: 100_000_000 } };
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ENDVERA_PERSONAL_MODEL_CONFIGURATION_JSON: JSON.stringify(config) };
describe("server-owned model configuration", () => {
  it("stays OFF without explicit server flag", () => {
    expect(loadPersonalModelConfiguration({ NODE_ENV: "test" }, now)).toMatchObject({ status: "DISABLED", executionAuthorized: false });
  });
  it("returns frozen validated configuration but never authorization or actual billing proof", () => {
    const result = loadPersonalModelConfiguration(env, now);
    expect(result.status).toBe("CONFIGURED_NOT_AUTHORIZED");
    if (result.status !== "CONFIGURED_NOT_AUTHORIZED") throw new Error("synthetic fixture");
    expect(result.budgetPolicy.aggregatePilotBillingVerified).toBe(false);
    expect(result.executionAuthorized).toBe(false); expect(Object.isFrozen(result.rateConfiguration)).toBe(true);
    expect(result.configurationFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  it.each([undefined, "{", " ".repeat(17000), JSON.stringify({ ...config, apiKey: "synthetic-secret-marker" }),
    JSON.stringify({ ...config, policyVersionId: "https://caller-route" }),
    JSON.stringify({ ...config, pilotEnvelopeReview: undefined }),
    JSON.stringify({ ...config, rateConfiguration: { ...config.rateConfiguration, ceilingCadMicros: 21_000_000 } }),
  ])("refuses malformed/enlarged/client-like inputs without echoing values", encoded => {
    const result = loadPersonalModelConfiguration({ ...env, ENDVERA_PERSONAL_MODEL_CONFIGURATION_JSON: encoded }, now);
    expect(result).toEqual({ status: "REFUSED", executionAuthorized: false, reason: "PERSONAL_MODEL_CONFIGURATION_INVALID" });
  });
  it("refuses stale reviews and ended pilot even if flags remain enabled", () => {
    for (const date of ["2026-09-11T12:00:01Z", "2026-10-11T12:00:00Z"]) expect(loadPersonalModelConfiguration(env, new Date(date)).status).toBe("REFUSED");
  });
  it("fingerprints the exact reviewed configuration", () => {
    const before = loadPersonalModelConfiguration(env, now);
    const after = loadPersonalModelConfiguration({ ...env, ENDVERA_PERSONAL_MODEL_CONFIGURATION_JSON: JSON.stringify({ ...config, policyVersionId: "other-policy" }) }, now);
    if (before.status !== "CONFIGURED_NOT_AUTHORIZED" || after.status !== "CONFIGURED_NOT_AUTHORIZED") throw new Error("synthetic fixture");
    expect(after.configurationFingerprint).not.toBe(before.configurationFingerprint);
  });
});
