import { z } from "zod";
import { operatingCommandResultSchema } from "@/lib/construction-operating-assistant-r2/contracts";

export const CONSTRUCTION_MOBILE_ASSISTANT_API_VERSION = 1 as const;

export const constructionMobileAssistantRequestSchema = z
  .object({
    schemaVersion: z.literal(CONSTRUCTION_MOBILE_ASSISTANT_API_VERSION),
    requestId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    message: z.string().trim().min(1).max(10_000),
    occurredAt: z.string().datetime(),
  })
  .strict();

export const constructionMobileAssistantResultSchema = operatingCommandResultSchema;

export const constructionMobileAssistantHistoryMessageSchema = z
  .object({
    id: z.string().min(1),
    direction: z.enum(["inbound", "outbound"]),
    body: z.string().min(1),
    status: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();

export const constructionMobileAssistantHistorySchema = z
  .object({
    schemaVersion: z.literal(CONSTRUCTION_MOBILE_ASSISTANT_API_VERSION),
    generatedAt: z.string().datetime(),
    workspaceId: z.string().min(1).max(160),
    messages: z.array(constructionMobileAssistantHistoryMessageSchema).max(100),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type ConstructionMobileAssistantRequest = z.infer<
  typeof constructionMobileAssistantRequestSchema
>;
export type ConstructionMobileAssistantResult = z.infer<
  typeof constructionMobileAssistantResultSchema
>;
export type ConstructionMobileAssistantHistory = z.infer<
  typeof constructionMobileAssistantHistorySchema
>;
