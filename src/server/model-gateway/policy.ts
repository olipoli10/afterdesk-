import "server-only";
import { canonicalFingerprint } from "./evidence";
import type {
  CertifiedAdapterKey,
  GatewayDataClass,
  GatewayOperationRequest,
  GatewayOperationType,
  GatewayPrivacyRequirement,
  GatewayRefusalClass,
} from "./types";

export type GatewayPolicySnapshot = Readonly<{
  id: string;
  policyKey: string;
  status: string;
  operationType: string;
  routeOrder: readonly Readonly<{ routeKey: string; version: number }>[];
  maxAttempts: number;
  maxTotalCostMicros: bigint;
  requiredPrivacyPosture: string;
  canonicalHash: string;
}>;

export type GatewayRouteSnapshot = Readonly<{
  id: string;
  routeKey: string;
  version: number;
  status: string;
  adapterKey: CertifiedAdapterKey;
  billingProvider: string;
  intermediary: string | null;
  endpointKey: string;
  modelKey: string;
  operationTypes: readonly string[];
  allowedDataClasses: readonly string[];
  privacyPosture: string;
  privacyEvidence: Readonly<Record<string, unknown>>;
  maxInputTokens: number;
  maxOutputTokens: number;
  canonicalHash: string;
}>;

export type GatewayPolicyResolution =
  | Readonly<{
      disposition: "route_authorized";
      reasonClass: "initial_route";
      policy: GatewayPolicySnapshot;
      route: GatewayRouteSnapshot;
      privacyEvidenceHash: string;
    }>
  | Readonly<{ disposition: "refused"; reasonClass: GatewayRefusalClass }>;

const privacyRank: Record<GatewayPrivacyRequirement, number> = {
  standard: 0,
  no_training: 1,
  zero_retention: 2,
  regional_zero_retention: 3,
};

function privacySatisfies(actual: string, required: GatewayPrivacyRequirement): boolean {
  return actual in privacyRank && privacyRank[actual as GatewayPrivacyRequirement] >= privacyRank[required];
}

function evidenceExpiry(evidence: Readonly<Record<string, unknown>>): Date | null {
  const raw = evidence.expiresAt;
  if (typeof raw !== "string") return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveGatewayPolicy(input: {
  request: GatewayOperationRequest;
  policy: GatewayPolicySnapshot | null;
  routes: readonly GatewayRouteSnapshot[];
  now?: Date;
}): GatewayPolicyResolution {
  const { request, policy } = input;
  if ((request.operationType as string) !== "classification") {
    return { disposition: "refused", reasonClass: "unsupported_operation" };
  }
  if (!policy || policy.status !== "published" || policy.policyKey !== request.policyKey) {
    return { disposition: "refused", reasonClass: "unpublished_policy" };
  }
  if (
    policy.operationType !== request.operationType ||
    policy.maxAttempts !== 1 ||
    request.maxTotalCostMicros > policy.maxTotalCostMicros ||
    policy.requiredPrivacyPosture !== request.privacyRequirement
  ) {
    return { disposition: "refused", reasonClass: "ineligible_route" };
  }

  let sawMissingPrivacy = false;
  let sawExpiredPrivacy = false;
  const now = input.now ?? new Date();
  for (const pin of policy.routeOrder) {
    const route = input.routes.find(
      (candidate) => candidate.routeKey === pin.routeKey && candidate.version === pin.version
    );
    if (!route || route.status !== "published") continue;
    if (
      !route.operationTypes.includes(request.operationType as GatewayOperationType) ||
      !route.allowedDataClasses.includes(request.dataClass as GatewayDataClass) ||
      !privacySatisfies(route.privacyPosture, request.privacyRequirement)
    ) continue;
    const expiresAt = evidenceExpiry(route.privacyEvidence);
    if (!expiresAt) {
      sawMissingPrivacy = true;
      continue;
    }
    if (expiresAt.getTime() <= now.getTime()) {
      sawExpiredPrivacy = true;
      continue;
    }
    return Object.freeze({
      disposition: "route_authorized" as const,
      reasonClass: "initial_route" as const,
      policy,
      route,
      privacyEvidenceHash: canonicalFingerprint(route.privacyEvidence),
    });
  }
  if (sawExpiredPrivacy) return { disposition: "refused", reasonClass: "expired_privacy_evidence" };
  if (sawMissingPrivacy) return { disposition: "refused", reasonClass: "missing_privacy_evidence" };
  return { disposition: "refused", reasonClass: "ineligible_route" };
}
