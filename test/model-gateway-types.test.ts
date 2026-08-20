import { describe, expect, it } from "vitest";
import {
  GATEWAY_DATA_CLASSES,
  GATEWAY_OPERATION_TYPES,
  GATEWAY_PRIVACY_REQUIREMENTS,
  isGatewayDataClass,
  isGatewayOperationType,
  isGatewayPrivacyRequirement,
} from "@/server/model-gateway/types";
import { canonicalJson } from "@/server/model-gateway/evidence";

describe("Model Gateway closed-world types", () => {
  it("accepts only the V1 operation vocabulary", () => {
    expect(GATEWAY_OPERATION_TYPES).toEqual(["classification"]);
    expect(isGatewayOperationType("classification")).toBe(true);
    expect(isGatewayOperationType("planning")).toBe(false);
  });

  it("fails closed for unknown data and privacy identifiers", () => {
    for (const value of GATEWAY_DATA_CLASSES) expect(isGatewayDataClass(value)).toBe(true);
    for (const value of GATEWAY_PRIVACY_REQUIREMENTS)
      expect(isGatewayPrivacyRequirement(value)).toBe(true);
    expect(isGatewayDataClass("whatever")).toBe(false);
    expect(isGatewayPrivacyRequirement("provider_default")).toBe(false);
  });

  it("canonicalizes objects independent of key insertion order", () => {
    expect(canonicalJson({ b: 2, a: { z: 1, y: [3, 2] } })).toBe(
      canonicalJson({ a: { y: [3, 2], z: 1 }, b: 2 })
    );
  });

  it("rejects undefined and non-finite evidence", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow("NON_CANONICAL_VALUE");
    expect(() => canonicalJson({ a: Number.NaN })).toThrow("NON_CANONICAL_NUMBER");
  });
});
