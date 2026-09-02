import { z } from "zod";
import type { MobileWorkspace } from "@/lib/contracts";

export const VOICE_NOTE_MAX_DURATION_MS = 120_000;
export const VOICE_NOTE_MAX_BYTES = 10 * 1024 * 1024;
export const VOICE_CALL_POLICY_VERSION = "r25-local-disabled-v1" as const;

const identifier = z.string().min(1).max(200);
const opaqueRef = z.string().regex(/^ref_[a-f0-9]{64}$/u);
const purposeSchema = z.enum(["internal", "service", "commercial"]);
const resultFieldSchema = z.enum([
  "CONTACT_REACHED",
  "RESULT_SUMMARY",
  "FOLLOW_UP_DATE",
  "EVIDENCE_REFERENCE",
]);

export const mobilePrepareCallWorkCommandSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.literal("PREPARE_OUTBOUND_CALL_WORK"),
  commandId: z.string().uuid(),
  workspaceId: identifier,
  projectId: identifier,
  contactId: identifier,
  purpose: purposeSchema,
  objective: z.string().trim().min(1).max(1_000),
  disclosureVersion: z.string().trim().min(1).max(120),
  disclosureScript: z.string().trim().min(1).max(1_000),
  resultSchema: z.array(resultFieldSchema).min(1).max(4)
    .refine((items) => new Set(items).size === items.length, "duplicate result field"),
  expectedPolicyVersion: z.literal(VOICE_CALL_POLICY_VERSION),
}).strict();

export const mobilePrepareCallWorkResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: identifier,
  projectId: identifier,
  contactId: identifier,
  workId: identifier,
  recipientRef: opaqueRef,
  purpose: purposeSchema,
  objective: z.string().min(1).max(1_000),
  disclosureVersion: z.string().min(1).max(120),
  disclosureScript: z.string().min(1).max(1_000),
  resultSchema: z.array(resultFieldSchema).min(1),
  policyVersion: z.literal(VOICE_CALL_POLICY_VERSION),
  status: z.literal("PREPARED_UNSENT"),
  nextOwnerRole: z.literal("HUMAN_CALLER"),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

const sessionSchema = z.object({
  id: identifier,
  projectId: identifier.nullable(),
  contactId: identifier.nullable(),
  direction: z.enum(["inbound", "outbound"]),
  purpose: purposeSchema,
  lifecycleState: z.enum(["RECEIVED", "PROCESSING", "CLARIFICATION_REQUIRED", "COMPLETED", "REFUSED"]),
  disclosureVersion: z.string().min(1),
  disclosureStatus: z.enum(["acknowledged", "refused"]),
  recordingConsentStatus: z.enum(["unknown", "granted", "denied", "not_recorded"]),
  transcriptionConsentStatus: z.enum(["unknown", "granted", "denied"]),
  transcript: z.string().max(10_000).nullable(),
  transcriptProofLevel: z.enum(["SYNTHETIC_LOCAL", "HUMAN_TRANSCRIBED"]),
  nextOwnerUserId: identifier.nullable(),
  createdAt: z.string().datetime(),
}).strict();

const noteProjectionSchema = z.object({
  id: identifier,
  projectId: identifier,
  durationMs: z.number().int().positive().max(VOICE_NOTE_MAX_DURATION_MS),
  sizeBytes: z.number().int().positive().max(VOICE_NOTE_MAX_BYTES),
  transcriptionState: z.literal("TRANSCRIPTION_PREPARED"),
  createdByCurrentUser: z.boolean(),
  createdAt: z.string().datetime(),
}).strict();

const workProjectionSchema = z.object({
  id: identifier,
  projectId: identifier,
  contactId: identifier,
  contactName: z.string().min(1).max(240),
  recipientRef: opaqueRef,
  purpose: purposeSchema,
  objective: z.string().min(1).max(1_000),
  disclosureVersion: z.string().min(1),
  disclosureScript: z.string().min(1).max(1_000),
  resultSchema: z.array(resultFieldSchema),
  status: z.literal("PREPARED_UNSENT"),
  createdAt: z.string().datetime(),
}).strict();

const cockpitSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: identifier,
  role: z.enum(["owner", "admin", "field_worker"]),
  sessions: z.array(sessionSchema),
  voiceNotes: z.array(noteProjectionSchema),
  preparedWork: z.array(workProjectionSchema),
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

const FIELD_FORBIDDEN_KEYS = new Set([
  "transcript",
  "contactId",
  "contactName",
  "recipientRef",
  "objective",
  "disclosureScript",
  "nextOwnerUserId",
]);

function containsFieldLeak(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsFieldLeak);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) => FIELD_FORBIDDEN_KEYS.has(key) || containsFieldLeak(nested),
  );
}

export function parseMobileVoiceCallsCockpit(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { role?: unknown }).role === "field_worker" &&
    containsFieldLeak(value)
  ) {
    throw new Error("MOBILE_VOICE_FIELD_LEAK_REFUSED");
  }
  return cockpitSchema.parse(value);
}

export const mobileVoiceNoteCommandSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.literal("ADMIT_SELECTED_VOICE_NOTE"),
  commandId: z.string().uuid(),
  workspaceId: identifier,
  projectId: identifier,
  fileName: z.string().trim().min(1).max(255).refine((value) => value.toLowerCase().endsWith(".m4a")),
  mimeType: z.literal("audio/mp4"),
  durationMs: z.number().int().positive().max(VOICE_NOTE_MAX_DURATION_MS),
  sizeBytes: z.number().int().positive().max(VOICE_NOTE_MAX_BYTES),
  foregroundRecorded: z.literal(true),
  transcriptionRequested: z.literal(false),
  uri: z.string().min(1),
}).strict();

export const mobileVoiceNoteResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: identifier,
  projectId: identifier,
  voiceNoteId: identifier,
  evidenceId: identifier,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  mimeType: z.literal("audio/mp4"),
  durationMs: z.number().int().positive().max(VOICE_NOTE_MAX_DURATION_MS),
  sizeBytes: z.number().int().positive().max(VOICE_NOTE_MAX_BYTES),
  transcriptionState: z.literal("TRANSCRIPTION_PREPARED"),
  transcriptCreated: z.literal(false),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export type MobileVoiceCallsCockpit = ReturnType<typeof parseMobileVoiceCallsCockpit>;
export type MobilePrepareCallWorkCommand = z.infer<typeof mobilePrepareCallWorkCommandSchema>;
export type MobileVoiceNoteCommand = z.infer<typeof mobileVoiceNoteCommandSchema>;
export type MobileVoiceNoteResult = z.infer<typeof mobileVoiceNoteResultSchema>;
export type VoiceNoteAttemptState =
  | "READY"
  | "SENDING"
  | "CONFIRMED"
  | "REPLAYED"
  | "CONFLICT"
  | "OUTCOME_UNKNOWN"
  | "REFUSED";
export type VoiceNoteAttempt = Readonly<{
  command: MobileVoiceNoteCommand;
  state: VoiceNoteAttemptState;
  result: MobileVoiceNoteResult | null;
  publicError: string | null;
}>;

function assertManager(workspace: MobileWorkspace) {
  if (workspace.role !== "OWNER" && workspace.role !== "OFFICE_MANAGER") {
    throw new Error("MOBILE_VOICE_MANAGEMENT_REFUSED");
  }
}

export function createPrepareCallWorkCommand(input: {
  workspace: MobileWorkspace;
  commandId: string;
  projectId: string;
  contactId: string;
  objective: string;
}) {
  assertManager(input.workspace);
  return mobilePrepareCallWorkCommandSchema.parse({
    schemaVersion: 1,
    action: "PREPARE_OUTBOUND_CALL_WORK",
    commandId: input.commandId,
    workspaceId: input.workspace.id,
    projectId: input.projectId,
    contactId: input.contactId,
    purpose: "service",
    objective: input.objective,
    disclosureVersion: "r25-disclosure-v1",
    disclosureScript: "Bonjour, ici l’assistant ENDVERA de votre contact.",
    resultSchema: ["CONTACT_REACHED", "RESULT_SUMMARY", "FOLLOW_UP_DATE"],
    expectedPolicyVersion: VOICE_CALL_POLICY_VERSION,
  });
}

export function createVoiceNoteAttempt(input: {
  workspace: MobileWorkspace;
  projectId: string;
  commandId: string;
  uri: string;
  fileName: string;
  durationMs: number;
  sizeBytes: number;
}): VoiceNoteAttempt {
  if (!input.workspace.permissions.canAddEvidence) {
    throw new Error("MOBILE_VOICE_NOTE_PERMISSION_REFUSED");
  }
  const command = mobileVoiceNoteCommandSchema.parse({
    schemaVersion: 1,
    action: "ADMIT_SELECTED_VOICE_NOTE",
    commandId: input.commandId,
    workspaceId: input.workspace.id,
    projectId: input.projectId,
    fileName: input.fileName,
    mimeType: "audio/mp4",
    durationMs: input.durationMs,
    sizeBytes: input.sizeBytes,
    foregroundRecorded: true,
    transcriptionRequested: false,
    uri: input.uri,
  });
  return Object.freeze({ command, state: "READY", result: null, publicError: null });
}

export function beginVoiceNoteAttempt(value: VoiceNoteAttempt): VoiceNoteAttempt {
  if (value.state !== "READY" && value.state !== "OUTCOME_UNKNOWN") {
    throw new Error("MOBILE_VOICE_NOTE_ALREADY_DISPATCHED");
  }
  return Object.freeze({ ...value, state: "SENDING", publicError: null });
}

export function finishVoiceNoteAttempt(
  value: VoiceNoteAttempt,
  input: {
    state: Exclude<VoiceNoteAttemptState, "READY" | "SENDING">;
    result?: MobileVoiceNoteResult | null;
    publicError?: string | null;
  },
): VoiceNoteAttempt {
  if (value.state !== "SENDING") throw new Error("MOBILE_VOICE_NOTE_NOT_SENDING");
  return Object.freeze({
    ...value,
    state: input.state,
    result: input.result ?? null,
    publicError: input.publicError ?? null,
  });
}
