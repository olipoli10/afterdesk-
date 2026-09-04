import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export const PROJECT_BRAIN_UNDERSTANDING_SCHEMA_VERSION = 1 as const;
const id = z.string().trim().min(1).max(200);
const commandId = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const expectedStateVersion = z.number().int().positive();

export const projectBrainCandidateDispositionSchema = z.enum([
  "ACCEPT_AS_REVIEWED",
  "REJECT_AS_UNSUPPORTED",
  "RETAIN_FOR_CONTRADICTION",
]);
export const projectBrainResolutionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("SELECT_SUPPORTED_CANDIDATES"),
    selectedCandidateIds: z.array(id).min(1).max(146),
  }).strict().superRefine((value, context) => {
    if (new Set(value.selectedCandidateIds).size !== value.selectedCandidateIds.length) {
      context.addIssue({ code: "custom", message: "Duplicate selected candidate." });
    }
  }),
  z.object({ mode: z.literal("REJECT_ALL_UNSUPPORTED") }).strict(),
  z.object({
    mode: z.literal("OWNER_RESOLUTION"),
    ownerResolutionText: z.string().min(1).max(4_000),
  }).strict(),
]);

const base = {
  schemaVersion: z.literal(PROJECT_BRAIN_UNDERSTANDING_SCHEMA_VERSION),
  commandId,
  workspaceId: id,
  projectId: id,
};
const reviewMutation = {
  ...base,
  reviewId: id,
  expectedStateVersion,
};

export const projectBrainUnderstandingCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW") }).strict(),
  z.object({
    ...reviewMutation,
    action: z.literal("DISPOSITION_PROJECT_BRAIN_CANDIDATE"),
    candidateId: id,
    disposition: projectBrainCandidateDispositionSchema,
  }).strict(),
  z.object({
    ...reviewMutation,
    action: z.literal("DECLARE_PROJECT_BRAIN_CONTRADICTION"),
    candidateIds: z.array(id).min(2).max(146),
  }).strict().superRefine((value, context) => {
    if (new Set(value.candidateIds).size !== value.candidateIds.length) {
      context.addIssue({ code: "custom", message: "Contradiction members must be distinct." });
    }
  }),
  z.object({
    ...reviewMutation,
    action: z.literal("RESOLVE_PROJECT_BRAIN_CONTRADICTION"),
    contradictionId: id,
    resolution: projectBrainResolutionSchema,
  }).strict(),
  z.object({ ...reviewMutation, action: z.literal("PREPARE_PROJECT_BRAIN_UNDERSTANDING") }).strict(),
  z.object({
    ...reviewMutation,
    action: z.literal("CONFIRM_PROJECT_BRAIN_UNDERSTANDING"),
    reviewFingerprint: hash,
  }).strict(),
]);

export type ProjectBrainUnderstandingCommand = z.infer<typeof projectBrainUnderstandingCommandSchema>;
export type ProjectBrainCandidateDisposition = z.infer<typeof projectBrainCandidateDispositionSchema>;
export type ProjectBrainResolution = z.infer<typeof projectBrainResolutionSchema>;

export const projectBrainUnderstandingFalseEffectsSchema = z.object({
  providerExecutionPerformed: z.literal(false),
  binaryUnderstandingPerformed: z.literal(false),
  externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false),
  automaticResolutionPerformed: z.literal(false),
  automaticConfirmationPerformed: z.literal(false),
}).strict();

export const projectBrainUnderstandingFalseEffects = () => ({
  providerExecutionPerformed: false as const,
  binaryUnderstandingPerformed: false as const,
  externalTransportPerformed: false as const,
  externalWritePerformed: false as const,
  automaticResolutionPerformed: false as const,
  automaticConfirmationPerformed: false as const,
});

const sourceSchema = z.object({
  id,
  ordinal: z.number().int().positive(),
  kind: z.enum(["PHOTO", "DOCUMENT", "VOICE_NOTE"]),
  displayName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(160),
  sizeBytes: z.number().int().positive(),
  durationMs: z.number().int().positive().nullable(),
  contentHash: hash,
  transcriptionState: z.literal("NOT_REQUESTED_LOCAL_ONLY"),
  documentUnderstandingState: z.literal("NOT_REQUESTED_LOCAL_ONLY"),
}).strict();

const candidateProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("OWNER_TEXT"),
    ownerBriefField: z.enum(["summary", "scope", "importantPeople", "importantDates", "blockers", "nextDecision"]),
    rangeUnit: z.literal("UTF16_CODE_UNIT"),
    rangeStart: z.number().int().nonnegative(),
    rangeEnd: z.number().int().positive(),
  }).strict(),
  z.object({
    kind: z.literal("SOURCE_METADATA"),
    sourceId: id,
    sourceOrdinal: z.number().int().positive(),
    sourceContentHash: hash,
    metadataField: z.enum(["kind", "displayName", "mimeType", "sizeBytes", "durationMs", "ordinal", "contentHash"]),
  }).strict(),
]);

const reviewedCandidateSchema = z.object({
  candidateId: id,
  value: z.string().max(10_485_760),
  status: z.literal("CANDIDATE_UNCONFIRMED"),
  provenance: candidateProvenanceSchema,
  disposition: z.enum(["ACCEPT_AS_REVIEWED", "REJECT_AS_UNSUPPORTED"]),
}).strict();

const canonicalResolutionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("SELECT_SUPPORTED_CANDIDATES"), selectedCandidateIds: z.array(id).min(1) }).strict(),
  z.object({ mode: z.literal("REJECT_ALL_UNSUPPORTED") }).strict(),
  z.object({ mode: z.literal("OWNER_RESOLUTION"), ownerResolutionText: z.string().min(1).max(4_000) }).strict(),
]);

export const canonicalProjectBrainUnderstandingSnapshotSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_UNDERSTANDING_SCHEMA_VERSION),
  project: z.object({ id, code: z.string().min(1).max(120), name: z.string().min(1).max(240) }).strict(),
  inputs: z.object({
    intakeId: id,
    confirmedIntakeSnapshotHash: hash,
    candidateBatchId: id,
    candidateSetHash: hash,
  }).strict(),
  sources: z.array(sourceSchema).max(20),
  candidates: z.array(reviewedCandidateSchema).max(146),
  contradictions: z.array(z.object({
    contradictionId: id,
    memberCandidateIds: z.array(id).min(2).max(146),
    resolution: canonicalResolutionSchema,
  }).strict()),
  ownerResolutions: z.array(z.object({
    contradictionId: id,
    text: z.string().min(1).max(4_000),
    provenance: z.literal("OWNER_RESOLUTION"),
  }).strict()),
  limitations: z.array(z.enum([
    "VOICE_NOT_TRANSCRIBED",
    "DOCUMENT_CONTENT_NOT_INTERPRETED",
    "CANDIDATES_REQUIRE_EXPLICIT_REVIEW",
  ])).max(3),
}).strict();

export type CanonicalProjectBrainUnderstandingSnapshot = z.infer<typeof canonicalProjectBrainUnderstandingSnapshotSchema>;

export function deriveContradictionOutcomes(input: {
  memberCandidateIds: string[];
  resolution: ProjectBrainResolution;
}): Record<string, "ACCEPT_AS_REVIEWED" | "REJECT_AS_UNSUPPORTED"> {
  const members = [...new Set(input.memberCandidateIds)].sort();
  if (members.length < 2) throw new Error("PROJECT_BRAIN_CONTRADICTION_MEMBERS_INVALID");
  if (input.resolution.mode === "SELECT_SUPPORTED_CANDIDATES") {
    const selected = new Set(input.resolution.selectedCandidateIds);
    if ([...selected].some((candidateId) => !members.includes(candidateId))) {
      throw new Error("PROJECT_BRAIN_CONTRADICTION_NON_MEMBER");
    }
    return Object.fromEntries(members.map((candidateId) => [
      candidateId,
      selected.has(candidateId) ? "ACCEPT_AS_REVIEWED" : "REJECT_AS_UNSUPPORTED",
    ]));
  }
  return Object.fromEntries(members.map((candidateId) => [candidateId, "REJECT_AS_UNSUPPORTED"]));
}

export function buildProjectBrainUnderstandingSnapshot(
  input: Omit<CanonicalProjectBrainUnderstandingSnapshot, "schemaVersion">,
): { snapshot: CanonicalProjectBrainUnderstandingSnapshot; canonicalHash: string } {
  const snapshot = canonicalProjectBrainUnderstandingSnapshotSchema.parse({
    schemaVersion: PROJECT_BRAIN_UNDERSTANDING_SCHEMA_VERSION,
    ...input,
    sources: [...input.sources].sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id)),
    candidates: [...input.candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
    contradictions: [...input.contradictions]
      .map((item) => ({ ...item, memberCandidateIds: [...item.memberCandidateIds].sort() }))
      .sort((a, b) => a.contradictionId.localeCompare(b.contradictionId)),
    ownerResolutions: [...input.ownerResolutions].sort((a, b) => a.contradictionId.localeCompare(b.contradictionId)),
    limitations: [...new Set(input.limitations)].sort(),
  });
  return { snapshot, canonicalHash: sha256Canonical(snapshot) };
}

const dispositionHistorySchema = z.object({
  id,
  candidateId: id,
  disposition: projectBrainCandidateDispositionSchema,
  priorStateVersion: z.number().int().positive(),
  nextStateVersion: z.number().int().positive(),
  createdAt: z.string().datetime(),
}).strict();

const resolutionHistorySchema = z.object({
  id,
  contradictionId: id,
  resolution: projectBrainResolutionSchema,
  provenance: z.enum(["OWNER_DECISION", "OWNER_RESOLUTION"]),
  priorStateVersion: z.number().int().positive(),
  nextStateVersion: z.number().int().positive(),
  createdAt: z.string().datetime(),
}).strict();

const reviewProjectionSchema = z.object({
  id,
  workspaceId: id,
  projectId: id,
  intakeId: id,
  candidateBatchId: id,
  stateVersion: z.number().int().positive(),
  status: z.enum(["DRAFT", "READY_FOR_CONFIRMATION", "CONFIRMED"]),
  reviewFingerprint: hash.nullable(),
  confirmedUnderstandingSequence: z.number().int().positive().nullable(),
  sources: z.array(sourceSchema).max(20),
  candidates: z.array(z.object({
    id,
    value: z.string().max(10_485_760),
    status: z.literal("CANDIDATE_UNCONFIRMED"),
    confidenceClass: z.enum(["EXACT_OWNER_TEXT", "EXACT_CANONICAL_METADATA"]),
    provenance: candidateProvenanceSchema,
    dispositions: z.array(dispositionHistorySchema),
  }).strict()).max(146),
  contradictions: z.array(z.object({
    id,
    memberCandidateIds: z.array(id).min(2),
    resolutions: z.array(resolutionHistorySchema),
  }).strict()),
  proposedSnapshotHash: hash.nullable(),
  confirmedSnapshotHash: hash.nullable(),
  limitations: z.array(z.string()),
}).strict();

export const projectBrainUnderstandingProjectionSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_UNDERSTANDING_SCHEMA_VERSION),
  review: reviewProjectionSchema.nullable(),
  falseEffects: projectBrainUnderstandingFalseEffectsSchema,
}).strict();

export const projectBrainUnderstandingCommandResultSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_UNDERSTANDING_SCHEMA_VERSION),
  commandId,
  action: z.enum([
    "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW",
    "DISPOSITION_PROJECT_BRAIN_CANDIDATE",
    "DECLARE_PROJECT_BRAIN_CONTRADICTION",
    "RESOLVE_PROJECT_BRAIN_CONTRADICTION",
    "PREPARE_PROJECT_BRAIN_UNDERSTANDING",
    "CONFIRM_PROJECT_BRAIN_UNDERSTANDING",
  ]),
  workspaceId: id,
  projectId: id,
  reviewId: id,
  stateVersion: z.number().int().positive(),
  status: z.enum(["DRAFT", "READY_FOR_CONFIRMATION", "CONFIRMED"]),
  reviewFingerprint: hash.nullable(),
  canonicalEffectId: id,
  replayed: z.boolean(),
  falseEffects: projectBrainUnderstandingFalseEffectsSchema,
}).strict();

export type ProjectBrainUnderstandingProjection = z.infer<typeof projectBrainUnderstandingProjectionSchema>;
export type ProjectBrainUnderstandingCommandResult = z.infer<typeof projectBrainUnderstandingCommandResultSchema>;
