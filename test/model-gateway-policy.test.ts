import { describe, expect, it } from "vitest";
import {
  resolveGatewayPolicy,
  type GatewayPolicySnapshot,
  type GatewayRouteSnapshot,
} from "@/server/model-gateway/policy";
import type { GatewayOperationRequest } from "@/server/model-gateway/types";

const hash = (char: string): `sha256:${string}` => `sha256:${char.repeat(64)}`;
const now = new Date("2026-08-19T12:00:00.000Z");

const certifiedEvidence = (overrides: Record<string, unknown> = {}) => ({
  adapterKey: "synthetic",
  allowedDataClasses: ["business_confidential"],
  billingProvider: "synthetic",
  certificationOwner: "privacy-reviewer:test",
  effectiveAt: "2026-08-18T00:00:00.000Z",
  endpointKey: "messages",
  expiresAt: "2027-08-19T00:00:00.000Z",
  intermediary: null,
  modelKey: "synthetic-classifier",
  operationTypes: ["classification"],
  pathKind: "direct_provider",
  privacyPosture: "zero_retention",
  residency: ["CA"],
  tenancyMode: "route_isolated",
  ...overrides,
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

const route: GatewayRouteSnapshot = {
  id: "route-1",
  routeKey: "classification-synthetic-v1",
  version: 1,
  status: "published",
  pathKind: "direct_provider",
  adapterKey: "synthetic",
  billingProvider: "synthetic",
  intermediary: null,
  endpointKey: "messages",
  modelKey: "synthetic-classifier",
  operationTypes: ["classification"],
  allowedDataClasses: ["business_confidential"],
  privacyPosture: "zero_retention",
  residency: ["CA"],
  privacyEvidence: certifiedEvidence(),
  maxInputTokens: 10_000,
  maxOutputTokens: 4_000,
  canonicalHash: hash("3"),
};

const policy: GatewayPolicySnapshot = {
  id: "policy-1",
  policyKey: "classification-v1",
  status: "published",
  operationType: "classification",
  routeOrder: [{ routeKey: route.routeKey, version: route.version }],
  fallbackRules: [],
  maxAttempts: 1,
  maxTotalCostMicros: 100_000n,
  requiredPrivacyPosture: "zero_retention",
  canonicalHash: hash("4"),
};

describe("Model Gateway policy admission", () => {
  it("authorizes one exact published route when every certified fact agrees", () => {
    const result = resolveGatewayPolicy({ request, policy, routes: [route], now });
    expect(result).toMatchObject({ disposition: "route_authorized", route: { id: route.id } });
  });

  it.each([
    ["unknown policy", null, [route], "unpublished_policy"],
    ["expired privacy evidence", policy, [{ ...route, privacyEvidence: certifiedEvidence({ expiresAt: "2026-01-01T00:00:00.000Z" }) }], "expired_privacy_evidence"],
    ["contradictory data class", policy, [{ ...route, allowedDataClasses: ["public"] }], "ineligible_route"],
  ] as const)("refuses %s without inventing a fallback", (_name, candidatePolicy, routes, reasonClass) => {
    const result = resolveGatewayPolicy({ request, policy: candidatePolicy, routes: [...routes], now });
    expect(result).toEqual({ disposition: "refused", reasonClass });
  });

  it("refuses every operation other than the certified classification canary", () => {
    const result = resolveGatewayPolicy({
      request: { ...request, operationType: "planning" as never },
      policy,
      routes: [route],
      now,
    });
    expect(result).toEqual({ disposition: "refused", reasonClass: "unsupported_operation" });
  });

  it.each([
    ["path kind", { pathKind: "gateway" }],
    ["endpoint", { endpointKey: "responses" }],
    ["model", { modelKey: "synthetic-classifier-v2" }],
    ["billing provider", { billingProvider: "other-provider" }],
    ["operation scope", { operationTypes: ["planning"] }],
    ["data-class scope", { allowedDataClasses: ["public"] }],
    ["tenancy posture", { tenancyMode: "shared" }],
  ])("refuses privacy evidence with a mismatched exact %s claim", (_name, mutation) => {
    const result = resolveGatewayPolicy({
      request,
      policy,
      routes: [{ ...route, privacyEvidence: certifiedEvidence(mutation) }],
      now,
    });
    expect(result).toEqual({ disposition: "refused", reasonClass: "missing_privacy_evidence" });
  });
});
