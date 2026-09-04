import { z } from "zod";
import type { MobileWorkspace } from "@/lib/contracts";

export const mobileAssistantRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    message: z.string().trim().min(1).max(10_000),
    occurredAt: z.string().datetime(),
  })
  .strict();

export const mobileAssistantRoutingProjectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    intentClass: z.enum([
      "CANONICAL_STATE_QUERY",
      "CALENDAR_OPERATION",
      "COMMUNICATION_DRAFT",
      "PUBLIC_WEB_RESEARCH",
      "DOCUMENT_UNDERSTANDING",
      "COMPLEX_REASONING",
      "MIXED_CONSEQUENTIAL",
      "RESTRICTED_PERSONAL_RESEARCH",
      "UNSUPPORTED",
    ]),
    capabilityKey: z.enum([
      "CANONICAL_STATE",
      "CALENDAR",
      "COMMUNICATION_PREPARATION",
      "WEB_RESEARCH",
      "DOCUMENT_UNDERSTANDING",
      "CONTROLLER_REASONING",
      "HUMAN_ESCALATION",
    ]).nullable(),
    disposition: z.enum([
      "INTERNAL_TOOL",
      "CANDIDATE_PREPARED",
      "HUMAN_HANDOFF",
      "CLARIFICATION_REQUIRED",
      "REFUSED",
    ]),
    readiness: z.enum([
      "INTERNAL_READY",
      "PROVIDER_REQUIRED_NOT_AUTHORIZED",
      "HUMAN_SUPPORT_AVAILABLE",
      "CLARIFICATION_REQUIRED",
      "REFUSED",
    ]),
    citationsRequired: z.boolean(),
    approvalRequired: z.boolean(),
    providerExecutionAuthorized: z.literal(false),
    externalDispatchPerformed: z.literal(false),
  })
  .strict();

export const mobileAssistantResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    messageId: z.string().min(1),
    assistantMessageId: z.string().min(1),
    intent: z.enum([
      "AGENDA_QUERY",
      "DAILY_BRIEFING",
      "REMINDER_CREATE",
      "CALENDAR_ITEM_RESCHEDULE",
      "CALENDAR_ITEM_CREATE",
      "OUTBOUND_MESSAGE_DRAFT",
      "REPORT_WORK_FINISHED",
      "PROJECT_BRAIN_QUERY",
      "CLARIFICATION_REQUIRED",
      "UNSUPPORTED",
    ]),
    status: z.enum([
      "APPLIED",
      "PREPARED_UNSENT",
      "CLARIFICATION_REQUIRED",
      "ANSWERED",
      "REFUSED",
    ]),
    reply: z.string().min(1),
    canonicalEffectId: z.string().min(1).nullable(),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
    routing: mobileAssistantRoutingProjectionSchema.optional(),
  })
  .strict();

export const mobileAssistantHistorySchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    workspaceId: z.string().min(1).max(160),
    messages: z
      .array(
        z
          .object({
            id: z.string().min(1),
            direction: z.enum(["inbound", "outbound"]),
            body: z.string().min(1),
            status: z.string().min(1),
            createdAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(100),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type MobileAssistantRequest = z.infer<typeof mobileAssistantRequestSchema>;
export type MobileAssistantResult = z.infer<typeof mobileAssistantResultSchema>;
export type MobileAssistantHistory = z.infer<typeof mobileAssistantHistorySchema>;
export type AssistantAttemptState =
  | "READY"
  | "SENDING"
  | "CONFIRMED"
  | "REPLAYED"
  | "OUTCOME_UNKNOWN"
  | "REFUSED";

export type AssistantAttempt = Readonly<{
  request: MobileAssistantRequest;
  state: AssistantAttemptState;
  result: MobileAssistantResult | null;
  publicError: string | null;
}>;

function defaultId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("MOBILE_RANDOM_ID_UNAVAILABLE");
  }
  return globalThis.crypto.randomUUID();
}

export function createAssistantAttempt(input: {
  workspace: MobileWorkspace;
  message: string;
  occurredAt?: string;
  idFactory?: () => string;
}): AssistantAttempt {
  if (input.workspace.role === "FIELD_WORKER") {
    throw new Error("MOBILE_ASSISTANT_PERMISSION_REFUSED");
  }
  const request = mobileAssistantRequestSchema.parse({
    schemaVersion: 1,
    requestId: (input.idFactory ?? defaultId)(),
    workspaceId: input.workspace.id,
    message: input.message,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });
  return Object.freeze({ request, state: "READY", result: null, publicError: null });
}

export function beginAssistantAttempt(value: AssistantAttempt): AssistantAttempt {
  if (value.state !== "READY" && value.state !== "OUTCOME_UNKNOWN") {
    throw new Error("MOBILE_ASSISTANT_ALREADY_DISPATCHED");
  }
  return Object.freeze({ ...value, state: "SENDING", publicError: null });
}

export function finishAssistantAttempt(
  value: AssistantAttempt,
  input: {
    state: Exclude<AssistantAttemptState, "READY" | "SENDING">;
    result?: MobileAssistantResult | null;
    publicError?: string | null;
  },
): AssistantAttempt {
  if (value.state !== "SENDING") throw new Error("MOBILE_ASSISTANT_NOT_SENDING");
  return Object.freeze({
    ...value,
    state: input.state,
    result: input.result ?? null,
    publicError: input.publicError ?? null,
  });
}
