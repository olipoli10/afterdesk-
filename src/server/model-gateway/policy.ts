import "server-only";
import { canonicalFingerprint } from "./evidence";
import type {
  CertifiedAdapterKey,
  GatewayDataClass,
  GatewayOperationRequest,
  GatewayOperationType,
  GatewayPrivacyRequirement,
  GatewayProviderErrorClass,
  GatewayRefusalClass,
} from "./types";
import { isGatewayProviderErrorClass } from "./types";

export type GatewayPolicySnapshot = Readonly<{
  id: string;
  policyKey: string;
  status: string;
  operationType: string;
  routeOrder: readonly Readonly<{ routeKey: string; version: number }>[];
  fallbackRules: readonly GatewayFallbackRule[];
  maxAttempts: number;
  maxTotalCostMicros: bigint;
  requiredPrivacyPosture: string;
  canonicalHash: string;
}>;

export type GatewayFallbackRule = Readonly<{
  from: Readonly<{ routeKey: string; version: number }>;
  errorClass: GatewayProviderErrorClass;
  to: Readonly<{ routeKey: string; version: number }>;
}>;

export type GatewayRouteSnapshot = Readonly<{
  id: string;
  routeKey: string;
  version: number;
  status: string;
  pathKind: string;
  adapterKey: CertifiedAdapterKey;
  billingProvider: string;
  intermediary: string | null;
  endpointKey: string;
  modelKey: string;
  operationTypes: readonly string[];
  allowedDataClasses: readonly string[];
  privacyPosture: string;
  residency: readonly string[];
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

const PRIVACY_EVIDENCE_KEYS = [
  "adapterKey", "allowedDataClasses", "billingProvider", "certificationOwner",
  "effectiveAt", "endpointKey", "expiresAt", "intermediary", "modelKey",
  "operationTypes", "pathKind", "privacyPosture", "residency", "tenancyMode",
] as const;

function sameStringSet(actual: unknown, expected: readonly string[]): boolean {
  return Array.isArray(actual) && actual.length === expected.length &&
    [...actual].every((value) => typeof value === "string") &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function validDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A profile is not evidence for itself. Its certificate must restate every
 * path-bearing fact it authorizes, with a bounded effective period and a
 * closed tenancy posture. A provider-family marketing statement cannot pass
 * this comparison because it is missing exact fields.
 */
function certifiedRoutePrivacyStatus(
  route: GatewayRouteSnapshot,
  now: Date
): "eligible" | "missing_privacy_evidence" | "expired_privacy_evidence" {
  const evidence = route.privacyEvidence;
  const keys = Object.keys(evidence).sort();
  if (keys.length !== PRIVACY_EVIDENCE_KEYS.length || keys.some((key, index) => key !== PRIVACY_EVIDENCE_KEYS[index])) {
    return "missing_privacy_evidence";
  }
  const effectiveAt = validDate(evidence.effectiveAt);
  const expiresAt = validDate(evidence.expiresAt);
  if (!effectiveAt || !expiresAt || typeof evidence.certificationOwner !== "string" || evidence.certificationOwner.length === 0 ||
    evidence.tenancyMode !== "route_isolated" ||
    evidence.pathKind !== route.pathKind ||
    evidence.adapterKey !== route.adapterKey ||
    evidence.billingProvider !== route.billingProvider ||
    evidence.intermediary !== route.intermediary ||
    evidence.endpointKey !== route.endpointKey ||
    evidence.modelKey !== route.modelKey ||
    evidence.privacyPosture !== route.privacyPosture ||
    !sameStringSet(evidence.operationTypes, route.operationTypes) ||
    !sameStringSet(evidence.allowedDataClasses, route.allowedDataClasses) ||
    !sameStringSet(evidence.residency, route.residency)
  ) return "missing_privacy_evidence";
  if (effectiveAt.getTime() > now.getTime() || expiresAt.getTime() <= now.getTime()) {
    return "expired_privacy_evidence";
  }
  return "eligible";
}

export function parseGatewayFallbackRules(value: unknown): GatewayPolicySnapshot["fallbackRules"] {
  if (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) throw new Error("INVALID_GATEWAY_FALLBACK_RULES");
  return Object.freeze(
    value.map((rule) => {
      const from = rule && typeof rule === "object" ? (rule as Record<string, unknown>).from : null;
      const to = rule && typeof rule === "object" ? (rule as Record<string, unknown>).to : null;
      const errorClass = rule && typeof rule === "object" ? (rule as Record<string, unknown>).errorClass : null;
      const validPin = (pin: unknown): pin is { routeKey: string; version: number } =>
        pin !== null && typeof pin === "object" &&
        typeof (pin as { routeKey?: unknown }).routeKey === "string" &&
        Number.isInteger((pin as { version?: unknown }).version) &&
        Number((pin as { version: number }).version) > 0;
      if (!validPin(from) || !validPin(to) || !isGatewayProviderErrorClass(errorClass)) {
        throw new Error("INVALID_GATEWAY_FALLBACK_RULES");
      }
      return Object.freeze({
        from: Object.freeze({ routeKey: from.routeKey, version: from.version }),
        errorClass: errorClass as GatewayProviderErrorClass,
        to: Object.freeze({ routeKey: to.routeKey, version: to.version }),
      });
    })
  );
}

function routeEligible(request: GatewayOperationRequest, route: GatewayRouteSnapshot, now: Date): "eligible" | "missing_privacy_evidence" | "expired_privacy_evidence" | "ineligible_route" {
  if (route.status !== "published") return "ineligible_route";
  if (
    !route.operationTypes.includes(request.operationType as GatewayOperationType) ||
    !route.allowedDataClasses.includes(request.dataClass as GatewayDataClass) ||
    !privacySatisfies(route.privacyPosture, request.privacyRequirement)
  ) return "ineligible_route";
  return certifiedRoutePrivacyStatus(route, now);
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
    policy.maxAttempts < 1 ||
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
    if (!route) continue;
    const eligibility = routeEligible(request, route, now);
    if (eligibility === "missing_privacy_evidence") {
      sawMissingPrivacy = true;
      continue;
    }
    if (eligibility === "expired_privacy_evidence") {
      sawExpiredPrivacy = true;
      continue;
    }
    if (eligibility !== "eligible") continue;
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

export type GatewayFallbackResolution =
  | Readonly<{
      disposition: "route_authorized";
      reasonClass: "fallback_authorized";
      attempt: number;
      policy: GatewayPolicySnapshot;
      route: GatewayRouteSnapshot;
      privacyEvidenceHash: string;
    }>
  | Readonly<{ disposition: "refused"; reasonClass: GatewayRefusalClass }>;

/**
 * Resolve only the route named by the immutable published fallback rule.  It
 * does not choose an alternative when the target is unsafe or missing.
 */
export function resolveGatewayFallback(input: {
  request: GatewayOperationRequest;
  policy: GatewayPolicySnapshot | null;
  routes: readonly GatewayRouteSnapshot[];
  priorRoute: GatewayRouteSnapshot;
  errorClass: GatewayProviderErrorClass;
  priorAttempt: number;
  remainingCostMicros: bigint;
  now?: Date;
}): GatewayFallbackResolution {
  const { request, policy } = input;
  if (!policy || policy.status !== "published" || policy.policyKey !== request.policyKey) {
    return { disposition: "refused", reasonClass: "unpublished_policy" };
  }
  if (input.priorAttempt >= policy.maxAttempts || input.remainingCostMicros <= 0n) {
    return { disposition: "refused", reasonClass: "insufficient_spend_headroom" };
  }
  const rule = policy.fallbackRules.find(
    (candidate) =>
      candidate.from.routeKey === input.priorRoute.routeKey &&
      candidate.from.version === input.priorRoute.version &&
      candidate.errorClass === input.errorClass
  );
  if (!rule) return { disposition: "refused", reasonClass: "ineligible_route" };
  const sourceIndex = policy.routeOrder.findIndex(
    (pin) => pin.routeKey === rule.from.routeKey && pin.version === rule.from.version
  );
  const targetIndex = policy.routeOrder.findIndex(
    (pin) => pin.routeKey === rule.to.routeKey && pin.version === rule.to.version
  );
  if (sourceIndex < 0 || targetIndex <= sourceIndex) {
    return { disposition: "refused", reasonClass: "ineligible_route" };
  }
  const route = input.routes.find((candidate) => candidate.routeKey === rule.to.routeKey && candidate.version === rule.to.version);
  if (!route) return { disposition: "refused", reasonClass: "ineligible_route" };
  const eligibility = routeEligible(request, route, input.now ?? new Date());
  if (eligibility !== "eligible") return { disposition: "refused", reasonClass: eligibility };
  return Object.freeze({
    disposition: "route_authorized" as const,
    reasonClass: "fallback_authorized" as const,
    attempt: input.priorAttempt + 1,
    policy,
    route,
    privacyEvidenceHash: canonicalFingerprint(route.privacyEvidence),
  });
}
