import { describe, expect, it } from "vitest";
import {
  requireAdapterDefinition,
  requireOperationDefinition,
  requirePolicyKey,
  requireRouteKey,
} from "@/server/model-gateway/registry";

describe("Model Gateway closed registries", () => {
  it("resolves only registered operation and adapter identifiers", () => {
    expect(requireOperationDefinition("classification").key).toBe("classification");
    expect(requireAdapterDefinition("synthetic").key).toBe("synthetic");
    expect(() => requireOperationDefinition("planning")).toThrow("UNKNOWN_GATEWAY_OPERATION");
    expect(() => requireAdapterDefinition("magic-proxy")).toThrow("UNKNOWN_GATEWAY_ADAPTER");
  });

  it("rejects unknown route and policy identifiers", () => {
    expect(requirePolicyKey("classification-v1")).toBe("classification-v1");
    expect(requireRouteKey("classification-synthetic-v1")).toBe(
      "classification-synthetic-v1"
    );
    expect(() => requirePolicyKey("latest")).toThrow("UNKNOWN_GATEWAY_POLICY");
    expect(() => requireRouteKey("cheapest")).toThrow("UNKNOWN_GATEWAY_ROUTE");
  });
});
