import "server-only";
import {
  assistantRoutingDecisionSchema,
  type AssistantRoutingDecision,
} from "@/lib/construction-operating-assistant-r36a/contracts";
import {
  createAssistantRoutingBrain,
  routeAssistantRequest,
  type AssistantRoutingOptions,
} from "@/lib/construction-operating-assistant-r36a/router";

export function prepareAssistantRoutingDecision(
  request: unknown,
  options: AssistantRoutingOptions = {},
): AssistantRoutingDecision {
  const decision = routeAssistantRequest(request, options);
  if (decision.providerExecutionAuthorized || decision.externalDispatchPerformed) {
    throw new Error("R36A_EXTERNAL_DISPATCH_FORBIDDEN");
  }
  return decision;
}

export function createReplaySafeAssistantRoutingBrain(options: AssistantRoutingOptions = {}) {
  const brain = createAssistantRoutingBrain(options);
  return {
    route(request: unknown) {
      const decision = brain.route(request);
      if (decision.providerExecutionAuthorized || decision.externalDispatchPerformed) {
        throw new Error("R36A_EXTERNAL_DISPATCH_FORBIDDEN");
      }
      return decision;
    },
  };
}

export function projectAssistantRoutingAudit(rawDecision: unknown) {
  const decision = assistantRoutingDecisionSchema.parse(rawDecision);
  return Object.freeze({
    schemaVersion: decision.schemaVersion,
    requestId: decision.requestId,
    workspaceId: decision.workspaceId,
    requestFingerprint: decision.requestFingerprint,
    decisionFingerprint: decision.decisionFingerprint,
    intentClass: decision.intentClass,
    capabilityKey: decision.capabilityKey,
    disposition: decision.disposition,
    reasonCode: decision.reasonCode,
    policyKey: decision.policyKey,
    policyHash: decision.policyHash,
    routeKey: decision.selectedRoute?.routeKey ?? null,
    routeHash: decision.routeHash,
    effectiveDataClass: decision.effectiveDataClass,
    effectivePrivacyRequirement: decision.effectivePrivacyRequirement,
    riskClass: decision.riskClass,
    maxTotalCostMicros: decision.maxTotalCostMicros,
    citationsRequired: decision.citationsRequired,
    approvalRequired: decision.approvalRequired,
    providerExecutionAuthorized: false as const,
    externalDispatchPerformed: false as const,
  });
}

