import { describe, expect, it } from "vitest";
import { gatewayBreakerScopes, resolveGatewayBreakers } from "@/server/model-gateway/breakers";

const policy = { policyKey: "classification-v1" };
const route = { routeKey: "classification-primary", version: 2, modelKey: "model-a", billingProvider: "provider-a" };
const scopes = gatewayBreakerScopes({ policy, route });

describe("Model Gateway breaker scope and generation", () => {
  it("uses the four closed policy/route/model/provider scopes", () => {
    expect(scopes).toEqual([
      { scopeKind: "policy", scopeKey: "classification-v1" },
      { scopeKind: "route", scopeKey: "classification-primary@2" },
      { scopeKind: "model", scopeKey: "model-a" },
      { scopeKind: "provider", scopeKey: "provider-a" },
    ]);
  });

  it("allows a route with no breaker rows at generation zero", () => {
    expect(resolveGatewayBreakers({ scopes, snapshots: [] })).toEqual({ status: "clear", generation: 0n });
  });

  it.each([
    ["policy", "classification-v1"],
    ["route", "classification-primary@2"],
    ["model", "model-a"],
    ["provider", "provider-a"],
  ] as const)("fails closed when the %s breaker is open", (scopeKind, scopeKey) => {
    expect(
      resolveGatewayBreakers({
        scopes,
        snapshots: [{ scopeKind, scopeKey, generation: 3n, state: "open", reasonClass: "operator_stop" }],
      })
    ).toMatchObject({ status: "open", scope: { scopeKind, scopeKey }, generation: 3n });
  });

  it("changes the summed generation whenever any relevant scope changes", () => {
    expect(
      resolveGatewayBreakers({
        scopes,
        snapshots: [
          { scopeKind: "policy", scopeKey: "classification-v1", generation: 4n, state: "closed", reasonClass: "reset" },
          { scopeKind: "provider", scopeKey: "provider-a", generation: 2n, state: "closed", reasonClass: "reset" },
        ],
      })
    ).toEqual({ status: "clear", generation: 6n });
  });
});
