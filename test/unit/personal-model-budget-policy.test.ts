import { describe, expect, it } from "vitest";
import { inspectPersonalModelBudget, PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";

const now = new Date("2026-09-10T03:00:00Z");
const rate = {
  authorityId: PERSONAL_MODEL_AUTHORITY, model: "synthetic/model", providerEndpoint: "synthetic",
  reviewedAt: "2026-09-10T02:00:00Z", totalContextTokens: 128_000, maxOutputTokens: 4_000,
  inputUsdMicrosPerMillionTokens: 1_000_000, outputUsdMicrosPerMillionTokens: 5_000_000,
  additionalUsdMicrosPerCall: 100, cadMicrosPerUsd: 1_400_000, headroomBasisPoints: 2_000,
  ceilingCadMicros: 20_000_000, perCallCeilingCadMicros: 1_000_000,
};

describe("personal model current-authority reservation policy", () => {
  it("calculates conservative CAD reservation without reserving or authorizing", () => {
    const result = inspectPersonalModelBudget(rate, now);
    expect(result.reservationCadMicros).toBe(248_808n);
    expect(result.reservationUsdMicros).toBe(148_100n);
    expect(result.reviewedRateFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.executionAuthorized).toBe(false);
    expect(result.aggregatePilotBillingVerified).toBe(false);
    expect(result.automaticRetry).toBe(false);
    expect(result.retainReservationOnUncertainOutcome).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("rounds upward at every currency conversion boundary", () => {
    const result = inspectPersonalModelBudget({ ...rate, totalContextTokens: 1, maxOutputTokens: 1,
      inputUsdMicrosPerMillionTokens: 1, outputUsdMicrosPerMillionTokens: 1,
      additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1_000_001 }, now);
    expect(result.reservationCadMicros).toBe(4n);
  });
  it("binds all reviewed rate fields independent of caller property insertion order", () => {
    const reversed = Object.fromEntries(Object.entries(rate).reverse());
    expect(inspectPersonalModelBudget(reversed, now).reviewedRateFingerprint).toBe(inspectPersonalModelBudget(rate, now).reviewedRateFingerprint);
    expect(inspectPersonalModelBudget({ ...rate, cadMicrosPerUsd: 1_400_001 }, now).reviewedRateFingerprint).not.toBe(inspectPersonalModelBudget(rate, now).reviewedRateFingerprint);
  });
  it.each(["R37", "ENDVERA-PERSONAL-20260910-100CAD:renewed"])("rejects unrelated authority %s", authorityId => {
    expect(() => inspectPersonalModelBudget({ ...rate, authorityId }, now)).toThrow();
  });
  it.each(["2026-09-10T01:18:25Z", "2026-10-10T01:18:26Z", "invalid"])("rejects inactive authority at %s", date => {
    expect(() => inspectPersonalModelBudget(rate, new Date(date))).toThrow("AUTHORITY_INACTIVE");
  });
  it.each(["2026-09-09T02:59:59Z", "2026-09-10T03:00:01Z"])("rejects stale/future review %s", reviewedAt => {
    expect(() => inspectPersonalModelBudget({ ...rate, reviewedAt }, now)).toThrow("RATE_REVIEW_STALE");
  });
  it("rejects excess per-call reservation, mismatched caps and old usage claims", () => {
    expect(() => inspectPersonalModelBudget({ ...rate, perCallCeilingCadMicros: 1 }, now)).toThrow("PER_CALL_CEILING");
    expect(() => inspectPersonalModelBudget({ ...rate, ceilingCadMicros: 20_000_001 }, now)).toThrow();
    expect(() => inspectPersonalModelBudget({ ...rate, maxOutputTokens: 128_001 }, now)).toThrow("CONFIGURATION_INVALID");
    expect(() => inspectPersonalModelBudget({ ...rate, ceilingCadMicros: 999_999 }, now)).toThrow("CONFIGURATION_INVALID");
    expect(() => inspectPersonalModelBudget({ ...rate, settledSpendMicros: 0 }, now)).toThrow();
  });
  it.each([NaN, Infinity, -1, 0, 1.2, Number.MAX_SAFE_INTEGER + 1])("rejects invalid token rates %s", inputUsdMicrosPerMillionTokens => {
    expect(() => inspectPersonalModelBudget({ ...rate, inputUsdMicrosPerMillionTokens }, now)).toThrow();
  });
});
