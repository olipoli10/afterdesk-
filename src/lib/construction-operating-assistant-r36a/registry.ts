import type {
  AssistantCapabilityKey,
  AssistantDataClass,
  AssistantPrivacyRequirement,
  AssistantRiskClass,
} from "./contracts";

export type AssistantRouteDefinition = Readonly<{
  routeKey: string;
  adapterKey: string;
  modelKey: string;
  routeVersion: number;
  capabilityKeys: readonly AssistantCapabilityKey[];
  allowedDataClasses: readonly AssistantDataClass[];
  privacyCapability: AssistantPrivacyRequirement;
  allowedRiskClasses: readonly AssistantRiskClass[];
  external: boolean;
  candidateOnly: boolean;
  planningEnabled: boolean;
  dispatchAuthorized: boolean;
  estimatedCostMicros: number;
  evidenceState: "certified_internal" | "candidate_only" | "bounded_human";
}>;

export type AssistantRoutingPolicy = Readonly<{
  policyKey: "assistant-routing-r36a-v1";
  version: 1;
  orderedRoutes: Readonly<Record<AssistantCapabilityKey, readonly string[]>>;
}>;

const ALL_NON_PROHIBITED_RISKS = ["low", "medium", "high"] as const;
const ALL_DATA_CLASSES = ["public", "business_confidential", "personal_data", "restricted_sensitive"] as const;

const ROUTES = {
  "internal-canonical-state-v1": {
    routeKey: "internal-canonical-state-v1",
    adapterKey: "endvera-canonical-state",
    modelKey: "deterministic-postgresql-projection",
    routeVersion: 1,
    capabilityKeys: ["CANONICAL_STATE"],
    allowedDataClasses: ALL_DATA_CLASSES,
    privacyCapability: "regional_zero_retention",
    allowedRiskClasses: ALL_NON_PROHIBITED_RISKS,
    external: false,
    candidateOnly: false,
    planningEnabled: true,
    dispatchAuthorized: true,
    estimatedCostMicros: 0,
    evidenceState: "certified_internal",
  },
  "internal-calendar-v1": {
    routeKey: "internal-calendar-v1",
    adapterKey: "endvera-calendar",
    modelKey: "deterministic-calendar-transition",
    routeVersion: 1,
    capabilityKeys: ["CALENDAR"],
    allowedDataClasses: ALL_DATA_CLASSES,
    privacyCapability: "regional_zero_retention",
    allowedRiskClasses: ["low", "medium"],
    external: false,
    candidateOnly: false,
    planningEnabled: true,
    dispatchAuthorized: true,
    estimatedCostMicros: 0,
    evidenceState: "certified_internal",
  },
  "internal-communication-preparation-v1": {
    routeKey: "internal-communication-preparation-v1",
    adapterKey: "endvera-prepared-communication",
    modelKey: "deterministic-prepared-unsent",
    routeVersion: 1,
    capabilityKeys: ["COMMUNICATION_PREPARATION"],
    allowedDataClasses: ALL_DATA_CLASSES,
    privacyCapability: "regional_zero_retention",
    allowedRiskClasses: ["low", "medium", "high"],
    external: false,
    candidateOnly: false,
    planningEnabled: true,
    dispatchAuthorized: true,
    estimatedCostMicros: 0,
    evidenceState: "certified_internal",
  },
  "perplexity-public-research-candidate-v1": {
    routeKey: "perplexity-public-research-candidate-v1",
    adapterKey: "perplexity-candidate",
    modelKey: "specialist-web-research-candidate",
    routeVersion: 1,
    capabilityKeys: ["WEB_RESEARCH"],
    allowedDataClasses: ["public", "personal_data"],
    privacyCapability: "zero_retention",
    allowedRiskClasses: ["low", "medium"],
    external: true,
    candidateOnly: true,
    planningEnabled: true,
    dispatchAuthorized: false,
    estimatedCostMicros: 15_000,
    evidenceState: "candidate_only",
  },
  "openrouter-frontier-controller-candidate-v1": {
    routeKey: "openrouter-frontier-controller-candidate-v1",
    adapterKey: "openrouter-candidate",
    modelKey: "frontier-controller-policy-alias",
    routeVersion: 1,
    capabilityKeys: ["WEB_RESEARCH", "DOCUMENT_UNDERSTANDING", "CONTROLLER_REASONING"],
    allowedDataClasses: ["public", "business_confidential", "personal_data"],
    privacyCapability: "zero_retention",
    allowedRiskClasses: ALL_NON_PROHIBITED_RISKS,
    external: true,
    candidateOnly: true,
    planningEnabled: true,
    dispatchAuthorized: false,
    estimatedCostMicros: 30_000,
    evidenceState: "candidate_only",
  },
  "direct-frontier-controller-candidate-v1": {
    routeKey: "direct-frontier-controller-candidate-v1",
    adapterKey: "direct-model-candidate",
    modelKey: "frontier-controller-policy-alias",
    routeVersion: 1,
    capabilityKeys: ["DOCUMENT_UNDERSTANDING", "CONTROLLER_REASONING"],
    allowedDataClasses: ["public", "business_confidential", "personal_data"],
    privacyCapability: "regional_zero_retention",
    allowedRiskClasses: ALL_NON_PROHIBITED_RISKS,
    external: true,
    candidateOnly: true,
    planningEnabled: true,
    dispatchAuthorized: false,
    estimatedCostMicros: 45_000,
    evidenceState: "candidate_only",
  },
  "bounded-human-review-v1": {
    routeKey: "bounded-human-review-v1",
    adapterKey: "endvera-human-work-unit",
    modelKey: "bounded-human-review",
    routeVersion: 1,
    capabilityKeys: ["WEB_RESEARCH", "DOCUMENT_UNDERSTANDING", "CONTROLLER_REASONING", "HUMAN_ESCALATION"],
    allowedDataClasses: ["public", "business_confidential", "personal_data"],
    privacyCapability: "regional_zero_retention",
    allowedRiskClasses: ALL_NON_PROHIBITED_RISKS,
    external: false,
    candidateOnly: false,
    planningEnabled: true,
    dispatchAuthorized: false,
    estimatedCostMicros: 0,
    evidenceState: "bounded_human",
  },
} as const satisfies Record<string, AssistantRouteDefinition>;

export const ASSISTANT_ROUTING_POLICY: AssistantRoutingPolicy = {
  policyKey: "assistant-routing-r36a-v1",
  version: 1,
  orderedRoutes: {
    CANONICAL_STATE: ["internal-canonical-state-v1"],
    CALENDAR: ["internal-calendar-v1"],
    COMMUNICATION_PREPARATION: ["internal-communication-preparation-v1"],
    WEB_RESEARCH: [
      "perplexity-public-research-candidate-v1",
      "openrouter-frontier-controller-candidate-v1",
      "bounded-human-review-v1",
    ],
    DOCUMENT_UNDERSTANDING: [
      "direct-frontier-controller-candidate-v1",
      "openrouter-frontier-controller-candidate-v1",
      "bounded-human-review-v1",
    ],
    CONTROLLER_REASONING: [
      "openrouter-frontier-controller-candidate-v1",
      "direct-frontier-controller-candidate-v1",
      "bounded-human-review-v1",
    ],
    HUMAN_ESCALATION: ["bounded-human-review-v1"],
  },
};

export const ASSISTANT_ROUTE_KEYS = Object.freeze(Object.keys(ROUTES));

export function requireAssistantRoute(routeKey: string): AssistantRouteDefinition {
  const route = ROUTES[routeKey as keyof typeof ROUTES];
  if (!route) throw new Error(`UNKNOWN_ASSISTANT_ROUTE:${routeKey}`);
  return route;
}

export function requireAssistantCapability(capabilityKey: string): AssistantCapabilityKey {
  if (!Object.hasOwn(ASSISTANT_ROUTING_POLICY.orderedRoutes, capabilityKey)) {
    throw new Error(`UNKNOWN_ASSISTANT_CAPABILITY:${capabilityKey}`);
  }
  return capabilityKey as AssistantCapabilityKey;
}

