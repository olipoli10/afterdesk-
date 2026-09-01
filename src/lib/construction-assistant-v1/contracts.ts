import { z } from "zod";

export const CONSTRUCTION_INTENTS = [
  "CALENDAR_ITEM_CREATE",
  "CALENDAR_QUERY",
  "OUTBOUND_MESSAGE_DRAFT",
  "REPORT_WORK_FINISHED",
  "CLARIFICATION_REQUIRED",
  "UNSUPPORTED",
] as const;

export const constructionIntentSchema = z.enum(CONSTRUCTION_INTENTS);

export const clarificationSchema = z
  .object({
    reason: z.enum([
      "AMBIGUOUS_PROJECT",
      "PROJECT_NOT_FOUND",
      "AMBIGUOUS_CONTACT",
      "CONTACT_NOT_FOUND",
      "AMBIGUOUS_DATE",
      "AMBIGUOUS_TIME",
      "AMBIGUOUS_AMOUNT",
      "UNSUPPORTED_REQUEST",
    ]),
    question: z.string().min(1).max(280),
    candidateCount: z.number().int().min(0).max(20),
  })
  .strict();

export const constructionInterpretationSchema = z
  .object({
    schemaVersion: z.literal(1),
    intent: constructionIntentSchema,
    confidence: z.number().min(0).max(1),
    language: z.enum(["fr", "en"]),
    projectId: z.string().min(1).nullable(),
    contactId: z.string().min(1).nullable(),
    originalDatePhrase: z.string().max(120).nullable(),
    startsAtUtc: z.string().datetime().nullable(),
    endsAtUtc: z.string().datetime().nullable(),
    timezone: z.string().min(1).max(80),
    title: z.string().max(240).nullable(),
    clarification: clarificationSchema.nullable(),
    queryWindow: z
      .object({
        kind: z.literal("TOMORROW"),
      })
      .strict()
      .nullable(),
    outboundDraft: z
      .object({
        body: z.string().min(1).max(1600),
        channel: z.enum(["SMS", "EMAIL"]),
        sendAuthorized: z.literal(false),
      })
      .strict()
      .nullable(),
    openLoopDraft: z
      .object({
        billingBasis: z.literal("CHANGE_ORDER"),
        workDescription: z.string().min(1).max(4000),
        amountMinor: z.number().int().positive().nullable(),
        currency: z.literal("CAD"),
        completion: z.literal(true),
        approvalState: z.enum(["APPROVED", "REJECTED", "UNKNOWN"]),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();

export type ConstructionInterpretation = z.infer<typeof constructionInterpretationSchema>;

export type InterpreterProject = {
  id: string;
  code: string;
  name: string;
};

export type InterpreterContact = {
  id: string;
  displayName: string;
  preferredLanguage: string;
};

export type InterpreterContext = {
  referenceNow: string;
  locale: "fr-CA" | "en-CA";
  timezone: string;
  projects: InterpreterProject[];
  contacts: InterpreterContact[];
};
