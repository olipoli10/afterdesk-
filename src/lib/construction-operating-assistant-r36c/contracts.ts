import { z } from "zod";
import { operatingCommandResultSchema } from "@/lib/construction-operating-assistant-r2/contracts";
import {
  ASSISTANT_CAPABILITY_KEYS,
  ASSISTANT_INTENT_CLASSES,
  ASSISTANT_ROUTING_DISPOSITIONS,
} from "@/lib/construction-operating-assistant-r36a/contracts";

export const ASSISTANT_ROUTING_READINESS = [
  "INTERNAL_READY",
  "PROVIDER_REQUIRED_NOT_AUTHORIZED",
  "HUMAN_SUPPORT_AVAILABLE",
  "CLARIFICATION_REQUIRED",
  "REFUSED",
] as const;

export const trustedAdmittedAssistantSourceSchema = z
  .object({
    senderAddress: z.string().min(3).max(320),
    provider: z.string().min(1).max(80),
    providerMessageId: z.string().min(1).max(160),
  })
  .strict();

export const clientAssistantRoutingProjectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    intentClass: z.enum(ASSISTANT_INTENT_CLASSES),
    capabilityKey: z.enum(ASSISTANT_CAPABILITY_KEYS).nullable(),
    disposition: z.enum(ASSISTANT_ROUTING_DISPOSITIONS),
    readiness: z.enum(ASSISTANT_ROUTING_READINESS),
    citationsRequired: z.boolean(),
    approvalRequired: z.boolean(),
    providerExecutionAuthorized: z.literal(false),
    externalDispatchPerformed: z.literal(false),
  })
  .strict();

export const unifiedAssistantResultSchema = operatingCommandResultSchema
  .extend({ routing: clientAssistantRoutingProjectionSchema })
  .strict();

export const deferredAssistantSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("R36C_DEFERRED_ROUTING"),
    routing: clientAssistantRoutingProjectionSchema,
    result: z
      .object({
        intent: z.enum(["CLARIFICATION_REQUIRED", "UNSUPPORTED"]),
        status: z.enum(["CLARIFICATION_REQUIRED", "REFUSED"]),
        reply: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ClientAssistantRoutingProjection = z.infer<
  typeof clientAssistantRoutingProjectionSchema
>;
export type UnifiedAssistantResult = z.infer<typeof unifiedAssistantResultSchema>;
export type DeferredAssistantSnapshot = z.infer<typeof deferredAssistantSnapshotSchema>;
export type TrustedAdmittedAssistantSource = z.infer<
  typeof trustedAdmittedAssistantSourceSchema
>;
