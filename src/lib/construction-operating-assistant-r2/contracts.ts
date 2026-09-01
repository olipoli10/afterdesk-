import { z } from "zod";
import { constructionInterpretationSchema } from "@/lib/construction-assistant-v1/contracts";

export const OPERATING_CHANNELS = ["PORTAL", "SMS", "EMAIL", "VOICE_TRANSCRIPT"] as const;

export const operatingCommandEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    channel: z.enum(OPERATING_CHANNELS),
    body: z.string().trim().min(1).max(10_000),
    occurredAt: z.string().datetime(),
    senderAddress: z.string().min(3).max(320),
    provider: z.string().min(1).max(80).optional(),
    providerMessageId: z.string().min(1).max(160).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.provider && !value.providerMessageId) || (!value.provider && value.providerMessageId)) {
      context.addIssue({
        code: "custom",
        path: ["providerMessageId"],
        message: "provider and providerMessageId must be supplied together",
      });
    }
  });

export type OperatingCommandEnvelope = z.infer<typeof operatingCommandEnvelopeSchema>;

export const OPERATING_INTENTS = [
  "AGENDA_QUERY",
  "DAILY_BRIEFING",
  "REMINDER_CREATE",
  "CALENDAR_ITEM_RESCHEDULE",
  "CALENDAR_ITEM_CREATE",
  "OUTBOUND_MESSAGE_DRAFT",
  "REPORT_WORK_FINISHED",
  "CLARIFICATION_REQUIRED",
  "UNSUPPORTED",
] as const;

export const operatingClarificationSchema = z
  .object({
    reason: z.enum([
      "AMBIGUOUS_PROJECT",
      "PROJECT_NOT_FOUND",
      "AMBIGUOUS_CONTACT",
      "CONTACT_NOT_FOUND",
      "AMBIGUOUS_DATE",
      "AMBIGUOUS_TIME",
      "AMBIGUOUS_AMOUNT",
      "AMBIGUOUS_CALENDAR_ITEM",
      "CALENDAR_ITEM_NOT_FOUND",
      "UNSUPPORTED_REQUEST",
    ]),
    question: z.string().min(1).max(280),
    candidateCount: z.number().int().min(0).max(100),
  })
  .strict();

export const operatingInterpretationSchema = z
  .object({
    schemaVersion: z.literal(2),
    intent: z.enum(OPERATING_INTENTS),
    confidence: z.number().min(0).max(1),
    language: z.enum(["fr", "en"]),
    timezone: z.string().min(1).max(80),
    projectId: z.string().min(1).nullable(),
    contactId: z.string().min(1).nullable(),
    calendarItemId: z.string().min(1).nullable(),
    startsAtUtc: z.string().datetime().nullable(),
    endsAtUtc: z.string().datetime().nullable(),
    dueAtUtc: z.string().datetime().nullable(),
    title: z.string().min(1).max(240).nullable(),
    approvalRequired: z.boolean(),
    queryWindow: z
      .object({ kind: z.enum(["TODAY", "TOMORROW"]) })
      .strict()
      .nullable(),
    clarification: operatingClarificationSchema.nullable(),
    legacy: constructionInterpretationSchema.nullable(),
  })
  .strict();

export type OperatingInterpretation = z.infer<typeof operatingInterpretationSchema>;

export type OperatingCalendarItem = {
  id: string;
  projectId: string | null;
  contactId: string | null;
  title: string;
  startsAtUtc: string;
  endsAtUtc: string | null;
  status: string;
};

export type OperatingInterpreterContext = {
  referenceNow: string;
  locale: "fr-CA" | "en-CA";
  timezone: string;
  projects: Array<{ id: string; code: string; name: string }>;
  contacts: Array<{ id: string; displayName: string; preferredLanguage: string }>;
  calendarItems: OperatingCalendarItem[];
};

export const operatingCommandResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    messageId: z.string().min(1),
    assistantMessageId: z.string().min(1),
    intent: z.enum(OPERATING_INTENTS),
    status: z.enum(["APPLIED", "PREPARED_UNSENT", "CLARIFICATION_REQUIRED", "ANSWERED", "REFUSED"]),
    reply: z.string().min(1),
    canonicalEffectId: z.string().min(1).nullable(),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type OperatingCommandResult = z.infer<typeof operatingCommandResultSchema>;
