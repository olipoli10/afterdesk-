import "server-only";

import type { AssistantRoutingDecision, AssistantRoutingRequest } from "@/lib/construction-operating-assistant-r36a/contracts";
import {
  constructionMobileAssistantRequestSchema,
  type ConstructionMobileAssistantRequest,
} from "@/lib/construction-operating-assistant-r9/mobile-assistant-contracts";
import {
  clientAssistantRoutingProjectionSchema,
  trustedAdmittedAssistantSourceSchema,
  unifiedAssistantResultSchema,
  type ClientAssistantRoutingProjection,
  type TrustedAdmittedAssistantSource,
  type UnifiedAssistantResult,
} from "@/lib/construction-operating-assistant-r36c/contracts";
import { prisma } from "@/lib/db";
import {
  operatingCommandEnvelopeSchema,
  type OperatingCommandEnvelope,
} from "@/lib/construction-operating-assistant-r2/contracts";
import { requireActiveConstructionMember, ConstructionAccessDenied } from "@/server/construction-assistant-v1/workspace";
import { processOperatingAssistantCommand } from "@/server/construction-operating-assistant-r2/core";
import { processConstructionMobileAssistantRequest } from "@/server/construction-operating-assistant-r9/mobile-assistant";
import { prepareAssistantRoutingDecision } from "@/server/model-gateway/assistant-routing";
import {
  persistDeferredAssistantExchange,
  type DeferredAssistantReply,
} from "./deferred-exchange";

export type UnifiedAssistantChannel = AssistantRoutingRequest["channel"];

async function requireUnifiedAssistantRole(userId: string, workspaceId: string) {
  const membership = await requireActiveConstructionMember(prisma, userId, workspaceId);
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new ConstructionAccessDenied();
  }
}

export function createTrustedAssistantRoutingRequest(input: {
  userId: string;
  channel: UnifiedAssistantChannel;
  request: ConstructionMobileAssistantRequest;
}): AssistantRoutingRequest {
  return {
    schemaVersion: 1,
    requestId: input.request.requestId,
    workspaceId: input.request.workspaceId,
    actorId: input.userId,
    channel: input.channel,
    message: input.request.message,
    declaredDataClass: "business_confidential",
    privacyRequirement: "no_training",
    riskClass: "medium",
    maxTotalCostMicros: 100_000,
    policyKey: "assistant-routing-r36a-v1",
    acceptedAt: input.request.occurredAt,
  };
}

export function createInternalAssistantEnvelope(input: {
  userId: string;
  channel: UnifiedAssistantChannel;
  request: ConstructionMobileAssistantRequest;
  admittedSource?: TrustedAdmittedAssistantSource | unknown;
}) {
  if (input.channel === "MOBILE_APP" || input.channel === "PORTAL") {
    if (input.admittedSource !== undefined) {
      throw new Error("ASSISTANT_PORTAL_SOURCE_MUST_BE_SERVER_DERIVED");
    }
    return operatingCommandEnvelopeSchema.parse({
      schemaVersion: 1,
      commandId: input.request.requestId,
      workspaceId: input.request.workspaceId,
      channel: "PORTAL",
      body: input.request.message,
      occurredAt: input.request.occurredAt,
      senderAddress: `user:${input.userId}`,
    });
  }
  const source = trustedAdmittedAssistantSourceSchema.parse(input.admittedSource);
  return operatingCommandEnvelopeSchema.parse({
    schemaVersion: 1,
    commandId: input.request.requestId,
    workspaceId: input.request.workspaceId,
    channel: input.channel,
    body: input.request.message,
    occurredAt: input.request.occurredAt,
    senderAddress: source.senderAddress,
    provider: source.provider,
    providerMessageId: source.providerMessageId,
  });
}

export async function processAuthenticatedPortalCommand(input: {
  userId: string;
  envelope: OperatingCommandEnvelope | unknown;
}): Promise<UnifiedAssistantResult> {
  const envelope = operatingCommandEnvelopeSchema.parse(input.envelope);
  if (
    envelope.channel !== "PORTAL"
    || envelope.senderAddress !== `user:${input.userId}`
    || envelope.provider !== undefined
    || envelope.providerMessageId !== undefined
  ) {
    throw new Error("ASSISTANT_PORTAL_COMMAND_SOURCE_REFUSED");
  }
  return processUnifiedAssistantRequest({
    userId: input.userId,
    channel: "PORTAL",
    request: {
      schemaVersion: 1,
      requestId: envelope.commandId,
      workspaceId: envelope.workspaceId,
      message: envelope.body,
      occurredAt: envelope.occurredAt,
    },
  });
}

export function normalizeTrustedAdmittedAssistantSource(input: {
  channel: UnifiedAssistantChannel;
  admittedSource?: TrustedAdmittedAssistantSource | unknown;
}): TrustedAdmittedAssistantSource | undefined {
  if (input.channel === "MOBILE_APP" || input.channel === "PORTAL") {
    if (input.admittedSource !== undefined) {
      throw new Error("ASSISTANT_PORTAL_SOURCE_MUST_BE_SERVER_DERIVED");
    }
    return undefined;
  }
  return trustedAdmittedAssistantSourceSchema.parse(input.admittedSource);
}

export function projectClientAssistantRouting(
  decision: AssistantRoutingDecision,
): ClientAssistantRoutingProjection {
  const readiness = decision.disposition === "INTERNAL_TOOL"
    ? "INTERNAL_READY"
    : decision.disposition === "CANDIDATE_PREPARED"
      ? "PROVIDER_REQUIRED_NOT_AUTHORIZED"
      : decision.disposition === "HUMAN_HANDOFF"
        ? "HUMAN_SUPPORT_AVAILABLE"
        : decision.disposition === "CLARIFICATION_REQUIRED"
          ? "CLARIFICATION_REQUIRED"
          : "REFUSED";
  return clientAssistantRoutingProjectionSchema.parse({
    schemaVersion: 1,
    intentClass: decision.intentClass,
    capabilityKey: decision.capabilityKey,
    disposition: decision.disposition,
    readiness,
    citationsRequired: decision.citationsRequired,
    approvalRequired: decision.approvalRequired,
    providerExecutionAuthorized: false,
    externalDispatchPerformed: false,
  });
}

export function replyForNonInternalRouting(decision: AssistantRoutingDecision): DeferredAssistantReply {
  switch (decision.disposition) {
    case "CANDIDATE_PREPARED":
      return {
        intent: "UNSUPPORTED",
        status: "REFUSED",
        reply: "ENDVERA reconnaît cette demande de recherche ou d’analyse, mais aucun service externe n’est autorisé dans cette version. Aucune recherche n’a été exécutée et aucun résultat n’est prétendu.",
      };
    case "HUMAN_HANDOFF":
      return {
        intent: "UNSUPPORTED",
        status: "REFUSED",
        reply: "Cette demande nécessite un soutien humain borné. Aucune tâche humaine n’a été créée automatiquement et aucune action externe n’a été effectuée.",
      };
    case "CLARIFICATION_REQUIRED":
      return {
        intent: "CLARIFICATION_REQUIRED",
        status: "CLARIFICATION_REQUIRED",
        reply: "Sépare la recherche de l’action demandée, puis confirme laquelle ENDVERA doit traiter en premier. Rien n’a été modifié.",
      };
    case "REFUSED":
      return {
        intent: "UNSUPPORTED",
        status: "REFUSED",
        reply: "ENDVERA refuse cette demande parce qu’elle exige des données personnelles restreintes ou dépasse les capacités autorisées. Rien n’a été exécuté.",
      };
    case "INTERNAL_TOOL":
      throw new Error("R36C_INTERNAL_DECISION_REQUIRES_INTERNAL_EXECUTOR");
  }
}

export async function processUnifiedAssistantRequest(input: {
  userId: string;
  channel: UnifiedAssistantChannel;
  request: ConstructionMobileAssistantRequest | unknown;
  admittedSource?: TrustedAdmittedAssistantSource | unknown;
}): Promise<UnifiedAssistantResult> {
  const request = constructionMobileAssistantRequestSchema.parse(input.request);
  const admittedSource = normalizeTrustedAdmittedAssistantSource(input);
  await requireUnifiedAssistantRole(input.userId, request.workspaceId);
  const decision = prepareAssistantRoutingDecision(createTrustedAssistantRoutingRequest({ ...input, request }));
  const routing = projectClientAssistantRouting(decision);

  if (decision.disposition === "INTERNAL_TOOL") {
    const result = input.channel === "MOBILE_APP" || input.channel === "PORTAL"
      ? await processConstructionMobileAssistantRequest({ userId: input.userId, request })
      : await processOperatingAssistantCommand({
          userId: input.userId,
          envelope: createInternalAssistantEnvelope({ ...input, request, admittedSource }),
        });
    return unifiedAssistantResultSchema.parse({ ...result, routing });
  }

  return persistDeferredAssistantExchange({
    userId: input.userId,
    request,
    channel: input.channel,
    deferred: replyForNonInternalRouting(decision),
    routing,
    admittedSource,
  });
}
