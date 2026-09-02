import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { classifyAssistantIntent } from "./classifier";
import {
  assistantRoutingDecisionSchema,
  assistantRoutingRequestSchema,
  type AssistantCapabilityKey,
  type AssistantDataClass,
  type AssistantPrivacyRequirement,
  type AssistantRoutingDecision,
  type AssistantRoutingRequest,
} from "./contracts";
import {
  ASSISTANT_ROUTING_POLICY,
  requireAssistantRoute,
  type AssistantRouteDefinition,
  type AssistantRoutingPolicy,
} from "./registry";

export type AssistantRouteRuntimeState = Readonly<{
  planningAvailable: boolean;
  breakerOpen: boolean;
  privacyEvidenceCurrent: boolean;
}>;

export type AssistantRoutingOptions = Readonly<{
  policy?: AssistantRoutingPolicy;
  routeStates?: Readonly<Record<string, Partial<AssistantRouteRuntimeState>>>;
}>;

const DATA_CLASS_RANK: Record<AssistantDataClass, number> = {
  public: 0,
  business_confidential: 1,
  personal_data: 2,
  restricted_sensitive: 3,
};

const PRIVACY_RANK: Record<AssistantPrivacyRequirement, number> = {
  standard: 0,
  no_training: 1,
  zero_retention: 2,
  regional_zero_retention: 3,
};

function fingerprint(value: unknown): `sha256:${string}` {
  return `sha256:${sha256Canonical(value)}`;
}

function stricterDataClass(left: AssistantDataClass, right: AssistantDataClass): AssistantDataClass {
  return DATA_CLASS_RANK[left] >= DATA_CLASS_RANK[right] ? left : right;
}

function stricterPrivacy(
  left: AssistantPrivacyRequirement,
  right: AssistantPrivacyRequirement,
): AssistantPrivacyRequirement {
  return PRIVACY_RANK[left] >= PRIVACY_RANK[right] ? left : right;
}

function capabilityForIntent(intentClass: string): AssistantCapabilityKey | null {
  switch (intentClass) {
    case "CANONICAL_STATE_QUERY": return "CANONICAL_STATE";
    case "CALENDAR_OPERATION": return "CALENDAR";
    case "COMMUNICATION_DRAFT": return "COMMUNICATION_PREPARATION";
    case "PUBLIC_WEB_RESEARCH": return "WEB_RESEARCH";
    case "DOCUMENT_UNDERSTANDING": return "DOCUMENT_UNDERSTANDING";
    case "COMPLEX_REASONING": return "CONTROLLER_REASONING";
    default: return null;
  }
}

function runtimeState(
  route: AssistantRouteDefinition,
  overrides: AssistantRoutingOptions["routeStates"],
): AssistantRouteRuntimeState {
  return {
    planningAvailable: overrides?.[route.routeKey]?.planningAvailable ?? route.planningEnabled,
    breakerOpen: overrides?.[route.routeKey]?.breakerOpen ?? false,
    privacyEvidenceCurrent: overrides?.[route.routeKey]?.privacyEvidenceCurrent ?? true,
  };
}

function eligible(
  route: AssistantRouteDefinition,
  request: AssistantRoutingRequest,
  capabilityKey: AssistantCapabilityKey,
  dataClass: AssistantDataClass,
  privacy: AssistantPrivacyRequirement,
  overrides: AssistantRoutingOptions["routeStates"],
): boolean {
  const state = runtimeState(route, overrides);
  return state.planningAvailable
    && !state.breakerOpen
    && state.privacyEvidenceCurrent
    && route.capabilityKeys.includes(capabilityKey)
    && route.allowedDataClasses.includes(dataClass)
    && route.allowedRiskClasses.includes(request.riskClass)
    && PRIVACY_RANK[route.privacyCapability] >= PRIVACY_RANK[privacy]
    && route.estimatedCostMicros <= request.maxTotalCostMicros;
}

function selectedRoute(route: AssistantRouteDefinition) {
  return {
    routeKey: route.routeKey,
    adapterKey: route.adapterKey,
    modelKey: route.modelKey,
    routeVersion: route.routeVersion,
    external: route.external,
    candidateOnly: route.candidateOnly,
    estimatedCostMicros: route.estimatedCostMicros,
  };
}

function createDecision(
  request: AssistantRoutingRequest,
  options: AssistantRoutingOptions = {},
): AssistantRoutingDecision {
  const policy = options.policy ?? ASSISTANT_ROUTING_POLICY;
  if (request.policyKey !== policy.policyKey) throw new Error(`UNKNOWN_ASSISTANT_POLICY:${request.policyKey}`);
  const classification = classifyAssistantIntent(request);
  const effectiveDataClass = stricterDataClass(request.declaredDataClass, classification.inferredDataClass);
  const effectivePrivacyRequirement = stricterPrivacy(
    request.privacyRequirement,
    classification.inferredPrivacyRequirement,
  );
  const requestFingerprint = fingerprint({
    schemaVersion: request.schemaVersion,
    requestId: request.requestId,
    workspaceId: request.workspaceId,
    actorId: request.actorId,
    channel: request.channel,
    messageHash: fingerprint(request.message),
    declaredDataClass: request.declaredDataClass,
    privacyRequirement: request.privacyRequirement,
    riskClass: request.riskClass,
    maxTotalCostMicros: request.maxTotalCostMicros,
    policyKey: request.policyKey,
    acceptedAt: request.acceptedAt,
  });
  const policyHash = fingerprint(policy);

  const base = {
    schemaVersion: 1 as const,
    requestId: request.requestId,
    workspaceId: request.workspaceId,
    requestFingerprint,
    intentClass: classification.intentClass,
    effectiveDataClass,
    effectivePrivacyRequirement,
    riskClass: request.riskClass,
    citationsRequired: classification.citationsRequired,
    approvalRequired: false,
    maxTotalCostMicros: request.maxTotalCostMicros,
    policyKey: policy.policyKey,
    policyHash,
    providerExecutionAuthorized: false as const,
    externalDispatchPerformed: false as const,
  };

  if (request.riskClass === "prohibited" || classification.intentClass === "RESTRICTED_PERSONAL_RESEARCH") {
    const unsigned = {
      ...base,
      capabilityKey: null,
      disposition: "REFUSED" as const,
      reasonCode: "RESTRICTED_PERSONAL_DATA" as const,
      selectedRoute: null,
      fallbackRouteKeys: [],
      routeHash: null,
      humanHandoff: null,
    };
    return assistantRoutingDecisionSchema.parse({ ...unsigned, decisionFingerprint: fingerprint(unsigned) });
  }

  if (classification.intentClass === "MIXED_CONSEQUENTIAL") {
    const unsigned = {
      ...base,
      capabilityKey: null,
      disposition: "CLARIFICATION_REQUIRED" as const,
      reasonCode: "MIXED_INTENT_REQUIRES_SPLIT" as const,
      selectedRoute: null,
      fallbackRouteKeys: [],
      routeHash: null,
      humanHandoff: null,
    };
    return assistantRoutingDecisionSchema.parse({ ...unsigned, decisionFingerprint: fingerprint(unsigned) });
  }

  const capabilityKey = capabilityForIntent(classification.intentClass);
  if (!capabilityKey) {
    const handoff = {
      capabilityKey: "HUMAN_ESCALATION" as const,
      expectedOutputContract: "assistant-unsupported-intent-review-v1",
      verificationChecks: ["identify requested outcome", "confirm registered capability or explicit refusal"],
      resumePoint: "ASSISTANT_ROUTING_RECLASSIFY",
      contextFingerprint: fingerprint({ requestFingerprint, classification: classification.intentClass }),
    };
    const unsigned = {
      ...base,
      capabilityKey: "HUMAN_ESCALATION" as const,
      disposition: "HUMAN_HANDOFF" as const,
      reasonCode: "UNSUPPORTED_INTENT" as const,
      selectedRoute: null,
      fallbackRouteKeys: ["bounded-human-review-v1"],
      routeHash: null,
      humanHandoff: handoff,
    };
    return assistantRoutingDecisionSchema.parse({ ...unsigned, decisionFingerprint: fingerprint(unsigned) });
  }

  const orderedRouteKeys = policy.orderedRoutes[capabilityKey];
  const routes = orderedRouteKeys.map(requireAssistantRoute);
  const selectedIndex = routes.findIndex((route) => eligible(
    route,
    request,
    capabilityKey,
    effectiveDataClass,
    effectivePrivacyRequirement,
    options.routeStates,
  ));

  if (selectedIndex < 0) {
    const budgetBlocked = routes.some((route) => route.estimatedCostMicros > request.maxTotalCostMicros);
    const unsigned = {
      ...base,
      capabilityKey,
      disposition: "REFUSED" as const,
      reasonCode: budgetBlocked ? "BUDGET_CEILING" as const : "NO_ELIGIBLE_ROUTE" as const,
      selectedRoute: null,
      fallbackRouteKeys: orderedRouteKeys.slice(1),
      routeHash: null,
      humanHandoff: null,
    };
    return assistantRoutingDecisionSchema.parse({ ...unsigned, decisionFingerprint: fingerprint(unsigned) });
  }

  const route = routes[selectedIndex];
  const selection = selectedRoute(route);
  const fallbacks = orderedRouteKeys.slice(selectedIndex + 1);
  const routeHash = fingerprint(route);
  const isHuman = route.evidenceState === "bounded_human";
  const isInternal = route.evidenceState === "certified_internal";
  const humanHandoff = isHuman ? {
    capabilityKey: "HUMAN_ESCALATION" as const,
    expectedOutputContract: `${capabilityKey.toLowerCase()}-verified-result-v1`,
    verificationChecks: classification.citationsRequired
      ? ["return direct sources", "separate facts from inference", "exclude restricted personal data"]
      : ["return the bounded requested result", "record verification evidence"],
    resumePoint: `ASSISTANT_ROUTING_RESUME_${capabilityKey}`,
    contextFingerprint: fingerprint({ requestFingerprint, capabilityKey, policyHash }),
  } : null;

  const reasonCode = isHuman
    ? "BOUNDED_HUMAN_FALLBACK" as const
    : capabilityKey === "CANONICAL_STATE"
      ? "CANONICAL_TRUTH_FIRST" as const
      : capabilityKey === "CALENDAR" || capabilityKey === "COMMUNICATION_PREPARATION"
        ? "DETERMINISTIC_TOOL_FIRST" as const
        : capabilityKey === "WEB_RESEARCH"
          ? "SPECIALIST_RESEARCH_PREFERRED" as const
          : "STRONGEST_ELIGIBLE_CONTROLLER" as const;
  const disposition = isHuman
    ? "HUMAN_HANDOFF" as const
    : isInternal
      ? "INTERNAL_TOOL" as const
      : "CANDIDATE_PREPARED" as const;
  const unsigned = {
    ...base,
    approvalRequired: capabilityKey === "COMMUNICATION_PREPARATION" || request.riskClass === "high",
    capabilityKey: isHuman ? "HUMAN_ESCALATION" as const : capabilityKey,
    disposition,
    reasonCode,
    selectedRoute: selection,
    fallbackRouteKeys: fallbacks,
    routeHash,
    humanHandoff,
  };
  return assistantRoutingDecisionSchema.parse({ ...unsigned, decisionFingerprint: fingerprint(unsigned) });
}

export function routeAssistantRequest(
  rawRequest: unknown,
  options: AssistantRoutingOptions = {},
): AssistantRoutingDecision {
  return createDecision(assistantRoutingRequestSchema.parse(rawRequest), options);
}

export function createAssistantRoutingBrain(options: AssistantRoutingOptions = {}) {
  const acceptedDecisions = new Map<string, AssistantRoutingDecision>();
  return {
    route(rawRequest: unknown): AssistantRoutingDecision {
      const request = assistantRoutingRequestSchema.parse(rawRequest);
      const decision = createDecision(request, options);
      const replayKey = `${request.workspaceId}:${request.requestId}`;
      const existing = acceptedDecisions.get(replayKey);
      if (existing) {
        if (existing.requestFingerprint !== decision.requestFingerprint) {
          throw new Error("ASSISTANT_ROUTING_REPLAY_MISMATCH");
        }
        return existing;
      }
      acceptedDecisions.set(replayKey, decision);
      return decision;
    },
  };
}
