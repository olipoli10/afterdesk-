import { z } from "zod";
import type { MobileWorkspace } from "@/lib/contracts";

const sourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PORTAL_TEXT"),
    sourceId: z.string().uuid(),
    text: z.string().trim().min(1).max(10_000),
  }).strict(),
  z.object({
    kind: z.literal("VOICE_TRANSCRIPT"),
    sourceId: z.string().uuid(),
    transcript: z.string().trim().min(1).max(10_000),
    verificationState: z.enum(["UNVERIFIED", "HUMAN_CONFIRMED"]),
  }).strict(),
  z.object({
    kind: z.literal("FILE_OBSERVATION"),
    sourceId: z.string().uuid(),
    evidenceId: z.string().min(1).max(160),
    observation: z.string().trim().min(1).max(10_000),
    verificationState: z.enum(["UNVERIFIED", "HUMAN_CONFIRMED"]),
  }).strict(),
]);

export const mobileUnifiedIntentEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  envelopeId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  occurredAt: z.string().datetime(),
  mode: z.enum(["RESOLVE_ONLY", "APPLY_VALIDATED"]),
  context: z.object({
    projectId: z.string().min(1).max(160).nullable(),
    contactId: z.string().min(1).max(160).nullable(),
  }).strict(),
  source: sourceSchema,
}).strict();

const interpretationSchema = z.object({
  schemaVersion: z.literal(2),
  intent: z.enum([
    "AGENDA_QUERY",
    "DAILY_BRIEFING",
    "REMINDER_CREATE",
    "CALENDAR_ITEM_RESCHEDULE",
    "CALENDAR_ITEM_CREATE",
    "OUTBOUND_MESSAGE_DRAFT",
    "REPORT_WORK_FINISHED",
    "CLARIFICATION_REQUIRED",
    "UNSUPPORTED",
  ]),
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
  queryWindow: z.object({ kind: z.enum(["TODAY", "TOMORROW"]) }).strict().nullable(),
  clarification: z.object({
    reason: z.string().min(1),
    question: z.string().min(1).max(280),
    candidateCount: z.number().int().min(0).max(100),
  }).strict().nullable(),
  legacy: z.unknown().nullable(),
}).strict();

export const mobileUnifiedIntentResultSchema = z.object({
  schemaVersion: z.literal(1),
  envelopeId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  interpretation: interpretationSchema,
  status: z.enum([
    "RESOLVED",
    "CLARIFICATION_REQUIRED",
    "APPLIED",
    "PREPARED_UNSENT",
    "ANSWERED",
    "REFUSED",
  ]),
  reply: z.string().min(1).nullable(),
  refusalReason: z.enum([
    "UNVERIFIED_SOURCE",
    "UNSUPPORTED_INTENT",
    "CONTEXT_TRANSITION_MISMATCH",
  ]).nullable(),
  transition: z.object({
    requested: z.boolean(),
    validated: z.boolean(),
    performed: z.boolean(),
    canonicalCommandId: z.string().uuid().nullable(),
    canonicalEffectId: z.string().min(1).nullable(),
    replayed: z.boolean(),
  }).strict(),
  provenance: z.object({
    sourceKind: z.enum(["PORTAL_TEXT", "VOICE_TRANSCRIPT", "FILE_OBSERVATION"]),
    sourceId: z.string().uuid(),
    suppliedByUserId: z.string().min(1),
    occurredAt: z.string().datetime(),
    bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
    evidenceId: z.string().min(1).max(160).nullable(),
    verificationState: z.enum(["DIRECT_USER_INPUT", "UNVERIFIED", "HUMAN_CONFIRMED"]),
  }).strict(),
  externalTransportPerformed: z.literal(false),
}).strict();

export type MobileUnifiedIntentEnvelope = z.infer<typeof mobileUnifiedIntentEnvelopeSchema>;
export type MobileUnifiedIntentResult = z.infer<typeof mobileUnifiedIntentResultSchema>;

function defaultId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("MOBILE_RANDOM_ID_UNAVAILABLE");
  }
  return globalThis.crypto.randomUUID();
}

export function createPortalIntentEnvelope(input: {
  workspace: MobileWorkspace;
  text: string;
  mode: "RESOLVE_ONLY" | "APPLY_VALIDATED";
  projectId?: string | null;
  contactId?: string | null;
  occurredAt?: string;
  idFactory?: () => string;
}): MobileUnifiedIntentEnvelope {
  if (input.workspace.role === "FIELD_WORKER") {
    throw new Error("MOBILE_INTENT_PERMISSION_REFUSED");
  }
  const idFactory = input.idFactory ?? defaultId;
  const sourceId = idFactory();
  return mobileUnifiedIntentEnvelopeSchema.parse({
    schemaVersion: 1,
    envelopeId: idFactory(),
    workspaceId: input.workspace.id,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    mode: input.mode,
    context: {
      projectId: input.projectId ?? null,
      contactId: input.contactId ?? null,
    },
    source: { kind: "PORTAL_TEXT", sourceId, text: input.text },
  });
}
