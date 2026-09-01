import { z } from "zod";
import { operatingInterpretationSchema } from "@/lib/construction-operating-assistant-r2/contracts";

export const UNIFIED_INTENT_SCHEMA_VERSION = 1 as const;
export const UNIFIED_INTENT_SOURCE_KINDS = [
  "PORTAL_TEXT",
  "VOICE_TRANSCRIPT",
  "FILE_OBSERVATION",
] as const;

const commonSourceFields = {
  sourceId: z.string().uuid(),
};

export const unifiedIntentSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    ...commonSourceFields,
    kind: z.literal("PORTAL_TEXT"),
    text: z.string().trim().min(1).max(10_000),
  }).strict(),
  z.object({
    ...commonSourceFields,
    kind: z.literal("VOICE_TRANSCRIPT"),
    transcript: z.string().trim().min(1).max(10_000),
    verificationState: z.enum(["UNVERIFIED", "HUMAN_CONFIRMED"]),
  }).strict(),
  z.object({
    ...commonSourceFields,
    kind: z.literal("FILE_OBSERVATION"),
    evidenceId: z.string().min(1).max(160),
    observation: z.string().trim().min(1).max(10_000),
    verificationState: z.enum(["UNVERIFIED", "HUMAN_CONFIRMED"]),
  }).strict(),
]);

export const unifiedIntentEnvelopeSchema = z.object({
  schemaVersion: z.literal(UNIFIED_INTENT_SCHEMA_VERSION),
  envelopeId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  occurredAt: z.string().datetime(),
  mode: z.enum(["RESOLVE_ONLY", "APPLY_VALIDATED"]),
  context: z.object({
    projectId: z.string().min(1).max(160).nullable(),
    contactId: z.string().min(1).max(160).nullable(),
  }).strict(),
  source: unifiedIntentSourceSchema,
}).strict();

const provenanceSchema = z.object({
  sourceKind: z.enum(UNIFIED_INTENT_SOURCE_KINDS),
  sourceId: z.string().uuid(),
  suppliedByUserId: z.string().min(1),
  occurredAt: z.string().datetime(),
  bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceId: z.string().min(1).max(160).nullable(),
  verificationState: z.enum(["DIRECT_USER_INPUT", "UNVERIFIED", "HUMAN_CONFIRMED"]),
}).strict();

export const unifiedIntentResultSchema = z.object({
  schemaVersion: z.literal(UNIFIED_INTENT_SCHEMA_VERSION),
  envelopeId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  interpretation: operatingInterpretationSchema,
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
  provenance: provenanceSchema,
  externalTransportPerformed: z.literal(false),
}).strict();

export type UnifiedIntentEnvelope = z.infer<typeof unifiedIntentEnvelopeSchema>;
export type UnifiedIntentResult = z.infer<typeof unifiedIntentResultSchema>;
export type UnifiedIntentSource = z.infer<typeof unifiedIntentSourceSchema>;

export function unifiedIntentBody(envelope: UnifiedIntentEnvelope): string {
  if (envelope.source.kind === "PORTAL_TEXT") return envelope.source.text;
  if (envelope.source.kind === "VOICE_TRANSCRIPT") return envelope.source.transcript;
  return envelope.source.observation;
}

export function unifiedIntentVerificationState(
  envelope: UnifiedIntentEnvelope,
): UnifiedIntentResult["provenance"]["verificationState"] {
  return envelope.source.kind === "PORTAL_TEXT"
    ? "DIRECT_USER_INPUT"
    : envelope.source.verificationState;
}
