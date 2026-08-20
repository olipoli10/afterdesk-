import { describe, expect, it } from "vitest";
import { normalizeGatewayProviderError } from "@/lib/ai-work-engine/provider-error";
import {
  resolveGatewayFallback,
  type GatewayPolicySnapshot,
  type GatewayRouteSnapshot,
} from "@/server/model-gateway/policy";
import type { GatewayOperationRequest } from "@/server/model-gateway/types";
import { projectGatewayAttemptLineage } from "@/server/model-gateway/evidence";

const hash = (char: string): `sha256:${string}` => `sha256:${char.repeat(64)}`;
const now = new Date("2026-08-19T12:00:00.000Z");
const certifiedEvidence = (modelKey: string) => ({
  adapterKey: "synthetic", allowedDataClasses: ["business_confidential"], billingProvider: "synthetic",
  certificationOwner: "privacy-reviewer:test", effectiveAt: "2026-08-18T00:00:00.000Z",
  endpointKey: "messages", expiresAt: "2027-08-19T00:00:00.000Z", intermediary: null,
  modelKey, operationTypes: ["classification"], pathKind: "direct_provider",
  privacyPosture: "zero_retention", residency: ["CA"], tenancyMode: "route_isolated",
});
const request: GatewayOperationRequest = {
  logicalOperationKey: "engine:task-1:initial:classify",
  tenantId: "tenant-1",
  taskId: "task-1",
  operationType: "classification",
  requestFingerprint: hash("1"),
  outputContractHash: hash("2"),
  dataClass: "business_confidential",
  privacyRequirement: "zero_retention",
  policyKey: "classification-v1",
  maxTotalCostMicros: 100_000n,
  contentRef: { kind: "classification_input", id: "task-1", fingerprint: hash("1") },
  createdAt: now,
};

const primary: GatewayRouteSnapshot = {
  id: "route-primary",
  routeKey: "primary",
  version: 1,
  status: "published",
  pathKind: "direct_provider",
  adapterKey: "synthetic",
  billingProvider: "synthetic",
  intermediary: null,
  endpointKey: "messages",
  modelKey: "synthetic-primary",
  operationTypes: ["classification"],
  allowedDataClasses: ["business_confidential"],
  privacyPosture: "zero_retention",
  residency: ["CA"],
  privacyEvidence: certifiedEvidence("synthetic-primary"),
  maxInputTokens: 10_000,
  maxOutputTokens: 4_000,
  canonicalHash: hash("3"),
};
const fallback: GatewayRouteSnapshot = { ...primary, id: "route-fallback", routeKey: "fallback", modelKey: "synthetic-fallback", privacyEvidence: certifiedEvidence("synthetic-fallback"), canonicalHash: hash("4") };
const policy: GatewayPolicySnapshot = {
  id: "policy-1",
  policyKey: "classification-v1",
  status: "published",
  operationType: "classification",
  routeOrder: [
    { routeKey: "primary", version: 1 },
    { routeKey: "fallback", version: 1 },
  ],
  fallbackRules: [{ from: { routeKey: "primary", version: 1 }, errorClass: "rate_limit", to: { routeKey: "fallback", version: 1 } }],
  maxAttempts: 2,
  maxTotalCostMicros: 100_000n,
  requiredPrivacyPosture: "zero_retention",
  canonicalHash: hash("5"),
};

describe("Model Gateway fallback policy", () => {
  it.each([
    [429, "rate_limit"],
    [401, "authentication"],
    [400, "malformed_request"],
    [503, "provider_server_failure"],
  ])("normalizes HTTP %i to the closed gateway class %s", (status, expected) => {
    expect(normalizeGatewayProviderError({ status, message: "provider fixture" })).toMatchObject({ errorClass: expected });
  });

  it("allows only the frozen next exact route for an eligible failure", () => {
    expect(
      resolveGatewayFallback({ request, policy, routes: [primary, fallback], priorRoute: primary, errorClass: "rate_limit", priorAttempt: 1, remainingCostMicros: 99_000n, now })
    ).toMatchObject({ disposition: "route_authorized", route: { id: fallback.id }, attempt: 2 });
  });

  it("refuses a fallback rule that points backward to the source route", () => {
    const backward = { ...policy, fallbackRules: [{ from: { routeKey: "primary", version: 1 }, errorClass: "rate_limit" as const, to: { routeKey: "primary", version: 1 } }] };
    expect(resolveGatewayFallback({ request, policy: backward, routes: [primary, fallback], priorRoute: primary, errorClass: "rate_limit", priorAttempt: 1, remainingCostMicros: 99_000n, now }))
      .toEqual({ disposition: "refused", reasonClass: "ineligible_route" });
  });

  it.each([
    ["authentication", "ineligible_route", 99_000n],
    ["rate_limit", "insufficient_spend_headroom", 0n],
  ] as const)("refuses %s without guessing another route", (errorClass, reasonClass, remainingCostMicros) => {
    expect(
      resolveGatewayFallback({ request, policy, routes: [primary, fallback], priorRoute: primary, errorClass, priorAttempt: 1, remainingCostMicros, now })
    ).toEqual({ disposition: "refused", reasonClass });
  });

  it("projects a content-free primary/fallback lineage for an operator", () => {
    expect(projectGatewayAttemptLineage([
      { attempt: 2, routeKey: "fallback", routeVersion: 1, decision: "route_authorized", reasonClass: "fallback_authorized", holdStatus: "held", heldMicros: 99_000n, settledMicros: null, dispatchState: "not_dispatched", attemptStatus: "prepared", errorClass: null, providerRequestRef: null },
      { attempt: 1, routeKey: "primary", routeVersion: 1, decision: "route_authorized", reasonClass: "initial_route", holdStatus: "settled", heldMicros: 100_000n, settledMicros: 1_000n, dispatchState: "settled", attemptStatus: "failed", errorClass: "rate_limit", providerRequestRef: "provider:1" },
    ])).toEqual([
      expect.objectContaining({ attempt: 1, route: "primary@1", exposureMicros: 1_000n, errorClass: "rate_limit" }),
      expect.objectContaining({ attempt: 2, route: "fallback@1", exposureMicros: 99_000n, errorClass: null }),
    ]);
  });
});
