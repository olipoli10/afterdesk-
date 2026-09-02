import {
  openRouterRequestPlanUnsignedSchema,
  providerRequestPlanSchema,
  r36bFingerprint,
  type ProviderRequestPlan,
  type SandboxCase,
} from "./contracts";
import { requireCurrentCandidatePacket } from "./candidates";

export const R36B_MODEL_PROFILES = Object.freeze({
  FRONTIER_CONTROLLER_PRIMARY_CANDIDATE: Object.freeze({
    profileVersion: 1,
    providerModelId: null,
    bindingState: "R37_SELECTION_REQUIRED" as const,
  }),
});

export function prepareOpenRouterControllerPlan(planId: string, sandboxCase: SandboxCase): ProviderRequestPlan {
  const packet = requireCurrentCandidatePacket("OPENROUTER_CONTROLLER");
  if (sandboxCase.intent !== "CONTROLLER_REASONING") throw new Error("R36B_CONTROLLER_INTENT_REQUIRED");
  if (!packet.allowedDataClasses.includes(sandboxCase.dataClass as "public" | "business_confidential")) {
    throw new Error("R36B_CONTROLLER_DATA_CLASS_REFUSED");
  }
  const profile = R36B_MODEL_PROFILES.FRONTIER_CONTROLLER_PRIMARY_CANDIDATE;
  const unsigned = openRouterRequestPlanUnsignedSchema.parse({
    schemaVersion: 1,
    planId,
    providerKey: "OPENROUTER_CONTROLLER",
    endpointFamily: "OPENROUTER_CHAT_COMPLETIONS",
    method: "POST",
    path: "/api/v1/chat/completions",
    packetFingerprint: packet.packetFingerprint,
    caseFingerprint: sandboxCase.caseFingerprint,
    ceilingFingerprint: sandboxCase.ceilingFingerprint,
    secretReferenceName: "R37_OPENROUTER_CONTROLLER_API_KEY",
    payload: {
      modelProfileKey: "FRONTIER_CONTROLLER_PRIMARY_CANDIDATE",
      providerModelId: profile.providerModelId,
      modelBindingState: profile.bindingState,
      orderedFacts: sandboxCase.orderedFacts,
      responseContractKey: sandboxCase.outputContractKey,
      provider: { allowFallbacks: false, requireParameters: true, dataCollection: "deny", zdr: true },
    },
    dispatchable: false,
    credentialResolved: false,
    providerExecutionAuthorized: false,
    externalDispatchPerformed: false,
  });
  return providerRequestPlanSchema.parse({ ...unsigned, planFingerprint: r36bFingerprint(unsigned) });
}

export function assertR37ModelBinding(plan: ProviderRequestPlan): never | void {
  if (plan.providerKey !== "OPENROUTER_CONTROLLER") throw new Error("R36B_OPENROUTER_PLAN_REQUIRED");
  if (plan.payload.modelBindingState !== "R37_SELECTION_REQUIRED" || plan.payload.providerModelId !== null) {
    throw new Error("R36B_UNEXPECTED_MODEL_BINDING_STATE");
  }
  throw new Error("R37_EXACT_MODEL_SELECTION_REQUIRED");
}
