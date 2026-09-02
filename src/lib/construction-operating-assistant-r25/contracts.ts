import { z } from "zod";
import { opaqueCommunicationIdentityRefSchema } from "@/lib/construction-operating-assistant-r4/communication-contracts";

export const VOICE_CALL_SCHEMA_VERSION = 1 as const;
export const VOICE_CALL_POLICY_VERSION = "r25-local-disabled-v1" as const;
export const VOICE_NOTE_MAX_DURATION_MS = 120_000;
export const VOICE_NOTE_MAX_BYTES = 10 * 1024 * 1024;

export const callPurposeSchema = z.enum(["internal", "service", "commercial"]);
export const callLifecycleSchema = z.enum([
  "RECEIVED",
  "PROCESSING",
  "CLARIFICATION_REQUIRED",
  "COMPLETED",
  "REFUSED",
]);
export const transcriptProofLevelSchema = z.enum([
  "SYNTHETIC_LOCAL",
  "HUMAN_TRANSCRIBED",
]);

export const callTranscriptInboundEventSchema = z.object({
  schemaVersion: z.literal(VOICE_CALL_SCHEMA_VERSION),
  eventId: z.string().uuid(),
  callId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  projectId: z.string().min(1).max(160).nullable(),
  callerIdentityRef: opaqueCommunicationIdentityRefSchema,
  occurredAt: z.string().datetime(),
  direction: z.literal("INBOUND"),
  purpose: callPurposeSchema,
  disclosure: z.object({
    version: z.string().trim().min(1).max(120),
    presented: z.boolean(),
    acknowledged: z.boolean(),
  }).strict(),
  recordingConsent: z.enum(["UNKNOWN", "GRANTED", "DENIED", "NOT_RECORDED"]),
  transcriptionConsent: z.enum(["UNKNOWN", "GRANTED", "DENIED"]),
  normalizedTranscript: z.string().trim().min(1).max(10_000),
  transcriptProofLevel: transcriptProofLevelSchema,
  sourceAudioPersisted: z.literal(false),
  externalTransportPerformed: z.literal(false),
}).strict();

export const selectedVoiceNoteCommandSchema = z.object({
  schemaVersion: z.literal(VOICE_CALL_SCHEMA_VERSION),
  action: z.literal("ADMIT_SELECTED_VOICE_NOTE"),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  projectId: z.string().min(1).max(160),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.literal("audio/mp4"),
  durationMs: z.number().int().positive().max(VOICE_NOTE_MAX_DURATION_MS),
  sizeBytes: z.number().int().positive().max(VOICE_NOTE_MAX_BYTES),
  foregroundRecorded: z.literal(true),
  transcriptionRequested: z.literal(false),
}).strict();

export const callResultFieldSchema = z.enum([
  "CONTACT_REACHED",
  "RESULT_SUMMARY",
  "FOLLOW_UP_DATE",
  "EVIDENCE_REFERENCE",
]);

export const prepareOutboundCallWorkCommandSchema = z.object({
  schemaVersion: z.literal(VOICE_CALL_SCHEMA_VERSION),
  action: z.literal("PREPARE_OUTBOUND_CALL_WORK"),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  projectId: z.string().min(1).max(160),
  contactId: z.string().min(1).max(160),
  purpose: callPurposeSchema,
  objective: z.string().trim().min(1).max(1_000),
  disclosureVersion: z.string().trim().min(1).max(120),
  disclosureScript: z.string().trim().min(1).max(1_000),
  resultSchema: z.array(callResultFieldSchema).min(1).max(4)
    .refine((items) => new Set(items).size === items.length, "duplicate result field"),
  expectedPolicyVersion: z.literal(VOICE_CALL_POLICY_VERSION),
}).strict();

export const callTranscriptResultSchema = z.object({
  schemaVersion: z.literal(VOICE_CALL_SCHEMA_VERSION),
  eventId: z.string().uuid(),
  callId: z.string().uuid(),
  sessionId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  status: z.enum(["APPLIED", "PREPARED_UNSENT", "CLARIFICATION_REQUIRED", "ANSWERED", "REFUSED"]),
  reply: z.string().min(1).nullable(),
  canonicalEffectId: z.string().min(1).nullable(),
  transcriptProofLevel: transcriptProofLevelSchema,
  replayed: z.boolean(),
  sourceAudioPersisted: z.literal(false),
  externalTransportPerformed: z.literal(false),
}).strict();

export const selectedVoiceNoteResultSchema = z.object({
  schemaVersion: z.literal(VOICE_CALL_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  voiceNoteId: z.string().min(1),
  evidenceId: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  mimeType: z.literal("audio/mp4"),
  durationMs: z.number().int().positive().max(VOICE_NOTE_MAX_DURATION_MS),
  sizeBytes: z.number().int().positive().max(VOICE_NOTE_MAX_BYTES),
  transcriptionState: z.literal("TRANSCRIPTION_PREPARED"),
  transcriptCreated: z.literal(false),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export const preparedOutboundCallWorkResultSchema = z.object({
  schemaVersion: z.literal(VOICE_CALL_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  contactId: z.string().min(1),
  workId: z.string().min(1),
  recipientRef: opaqueCommunicationIdentityRefSchema,
  purpose: callPurposeSchema,
  objective: z.string().min(1).max(1_000),
  disclosureVersion: z.string().min(1).max(120),
  disclosureScript: z.string().min(1).max(1_000),
  resultSchema: z.array(callResultFieldSchema).min(1),
  policyVersion: z.literal(VOICE_CALL_POLICY_VERSION),
  status: z.literal("PREPARED_UNSENT"),
  nextOwnerRole: z.literal("HUMAN_CALLER"),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

const callSessionProjectionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  contactId: z.string().min(1).nullable(),
  direction: z.enum(["inbound", "outbound"]),
  purpose: callPurposeSchema,
  lifecycleState: callLifecycleSchema,
  disclosureVersion: z.string().min(1),
  disclosureStatus: z.enum(["acknowledged", "refused"]),
  recordingConsentStatus: z.enum(["unknown", "granted", "denied", "not_recorded"]),
  transcriptionConsentStatus: z.enum(["unknown", "granted", "denied"]),
  transcript: z.string().max(10_000).nullable(),
  transcriptProofLevel: transcriptProofLevelSchema,
  nextOwnerUserId: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
}).strict();

const voiceNoteProjectionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  durationMs: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  transcriptionState: z.literal("TRANSCRIPTION_PREPARED"),
  createdByCurrentUser: z.boolean(),
  createdAt: z.string().datetime(),
}).strict();

const preparedWorkProjectionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  contactId: z.string().min(1),
  contactName: z.string().min(1),
  recipientRef: opaqueCommunicationIdentityRefSchema,
  purpose: callPurposeSchema,
  objective: z.string().min(1),
  disclosureVersion: z.string().min(1),
  disclosureScript: z.string().min(1),
  resultSchema: z.array(callResultFieldSchema),
  status: z.literal("PREPARED_UNSENT"),
  createdAt: z.string().datetime(),
}).strict();

export const voiceCallsCockpitSchema = z.object({
  schemaVersion: z.literal(VOICE_CALL_SCHEMA_VERSION),
  workspaceId: z.string().min(1),
  role: z.enum(["owner", "admin", "field_worker"]),
  sessions: z.array(callSessionProjectionSchema),
  voiceNotes: z.array(voiceNoteProjectionSchema),
  preparedWork: z.array(preparedWorkProjectionSchema),
  counts: z.object({
    sessions: z.number().int().nonnegative(),
    voiceNotes: z.number().int().nonnegative(),
    preparedUnsent: z.number().int().nonnegative(),
  }).strict(),
  rawPhoneVisible: z.literal(false),
  providerRecordingUrlVisible: z.literal(false),
  providerCallObserved: z.literal(false),
  externalTransportEnabled: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.role === "field_worker" && (value.sessions.length || value.preparedWork.length)) {
    context.addIssue({ code: "custom", path: ["role"], message: "FIELD_CALL_DETAILS_MUST_BE_EMPTY" });
  }
});

export type CallTranscriptInboundEvent = z.infer<typeof callTranscriptInboundEventSchema>;
export type CallTranscriptResult = z.infer<typeof callTranscriptResultSchema>;
export type SelectedVoiceNoteCommand = z.infer<typeof selectedVoiceNoteCommandSchema>;
export type PrepareOutboundCallWorkCommand = z.infer<typeof prepareOutboundCallWorkCommandSchema>;
export type VoiceCallsCockpit = z.infer<typeof voiceCallsCockpitSchema>;
