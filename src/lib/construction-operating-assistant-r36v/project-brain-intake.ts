import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export const PROJECT_BRAIN_SCHEMA_VERSION = 1 as const;
export const PROJECT_BRAIN_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const PROJECT_BRAIN_MAX_VOICE_DURATION_MS = 2 * 60 * 1_000;

const boundedId = z.string().trim().min(1).max(200);
const commandId = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const boundedOwnerText = z.string().trim().max(4_000);

export const projectBrainIntakeStatusSchema = z.enum([
  "DRAFT",
  "READY_FOR_REVIEW",
  "CONFIRMED",
  "REJECTED",
]);

export const projectBrainSourceKindSchema = z.enum([
  "PHOTO",
  "DOCUMENT",
  "VOICE_NOTE",
]);

export const projectBrainSnapshotStatusSchema = z.enum([
  "PROPOSED",
  "CONFIRMED",
]);

export const projectBrainInterpretationStateSchema = z.literal(
  "NOT_REQUESTED_LOCAL_ONLY",
);

export const projectBrainLimitationSchema = z.enum([
  "VOICE_NOT_TRANSCRIBED",
  "DOCUMENT_CONTENT_NOT_INTERPRETED",
]);

export const projectBrainOwnerBriefSchema = z.object({
  summary: z.string().trim().min(1).max(4_000),
  scope: boundedOwnerText,
  importantPeople: boundedOwnerText,
  importantDates: boundedOwnerText,
  blockers: boundedOwnerText,
  nextDecision: boundedOwnerText,
}).strict();

const baseCommand = {
  schemaVersion: z.literal(PROJECT_BRAIN_SCHEMA_VERSION),
  commandId,
  workspaceId: boundedId,
  projectId: boundedId,
};

const intakeMutationBase = {
  ...baseCommand,
  intakeId: boundedId,
  expectedStateVersion: z.number().int().positive(),
};

export const createProjectBrainIntakeCommandSchema = z.object({
  ...baseCommand,
  action: z.literal("CREATE_PROJECT_BRAIN_INTAKE"),
}).strict();

export const addProjectBrainOwnerBriefCommandSchema = z.object({
  ...intakeMutationBase,
  action: z.literal("ADD_OWNER_BRIEF"),
  brief: projectBrainOwnerBriefSchema,
}).strict();

export const submitProjectBrainIntakeCommandSchema = z.object({
  ...intakeMutationBase,
  action: z.literal("SUBMIT_PROJECT_BRAIN_INTAKE"),
}).strict();

export const confirmProjectBrainIntakeCommandSchema = z.object({
  ...intakeMutationBase,
  action: z.literal("CONFIRM_PROJECT_BRAIN_INTAKE"),
  reviewFingerprint: hash,
}).strict();

export const rejectProjectBrainIntakeCommandSchema = z.object({
  ...intakeMutationBase,
  action: z.literal("REJECT_PROJECT_BRAIN_INTAKE"),
  reviewFingerprint: hash,
}).strict();

export const projectBrainCommandSchema = z.discriminatedUnion("action", [
  createProjectBrainIntakeCommandSchema,
  addProjectBrainOwnerBriefCommandSchema,
  submitProjectBrainIntakeCommandSchema,
  confirmProjectBrainIntakeCommandSchema,
  rejectProjectBrainIntakeCommandSchema,
]);

const projectBrainSourceCommandObjectSchema = z.object({
  ...intakeMutationBase,
  action: z.literal("ADMIT_PROJECT_BRAIN_SOURCE"),
  kind: projectBrainSourceKindSchema,
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
  ]),
  sizeBytes: z.number().int().positive().max(PROJECT_BRAIN_MAX_SOURCE_BYTES),
  durationMs: z.number().int().positive().max(PROJECT_BRAIN_MAX_VOICE_DURATION_MS).nullable(),
}).strict();

export const projectBrainSourceCommandSchema = projectBrainSourceCommandObjectSchema.superRefine(
  (value, context) => {
    const allowed = {
      PHOTO: ["image/jpeg", "image/png"],
      DOCUMENT: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      VOICE_NOTE: ["audio/mp4", "audio/m4a", "audio/x-m4a"],
    }[value.kind];

    if (!allowed.includes(value.mimeType)) {
      context.addIssue({
        code: "custom",
        path: ["mimeType"],
        message: "The declared source kind and MIME type do not match.",
      });
    }

    if (value.kind === "VOICE_NOTE" && value.durationMs === null) {
      context.addIssue({
        code: "custom",
        path: ["durationMs"],
        message: "A bounded voice duration is required.",
      });
    }

    if (value.kind !== "VOICE_NOTE" && value.durationMs !== null) {
      context.addIssue({
        code: "custom",
        path: ["durationMs"],
        message: "Only a voice note may declare a duration.",
      });
    }
  },
);

export const projectBrainSourceProjectionSchema = z.object({
  id: boundedId,
  ordinal: z.number().int().positive(),
  kind: projectBrainSourceKindSchema,
  fileId: boundedId,
  contentHash: hash,
  displayName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(160),
  sizeBytes: z.number().int().positive().max(PROJECT_BRAIN_MAX_SOURCE_BYTES),
  durationMs: z.number().int().positive().nullable(),
  transcriptionState: projectBrainInterpretationStateSchema,
  documentUnderstandingState: projectBrainInterpretationStateSchema,
  createdAt: z.string().datetime(),
}).strict();

export const canonicalProjectBrainSnapshotSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_SCHEMA_VERSION),
  project: z.object({
    id: boundedId,
    code: z.string().min(1).max(120),
    name: z.string().min(1).max(240),
  }).strict(),
  ownerBrief: projectBrainOwnerBriefSchema.extend({
    provenance: z.literal("OWNER_CONFIRMED"),
  }).strict(),
  sources: z.array(z.object({
    sourceId: boundedId,
    kind: projectBrainSourceKindSchema,
    displayName: z.string().min(1).max(240),
    contentHash: hash,
    transcriptionState: projectBrainInterpretationStateSchema,
    documentUnderstandingState: projectBrainInterpretationStateSchema,
  }).strict()).max(20),
  limitations: z.array(projectBrainLimitationSchema).max(2),
}).strict();

const projectBrainSnapshotProjectionSchema = z.object({
  id: boundedId,
  stateVersion: z.number().int().positive(),
  status: projectBrainSnapshotStatusSchema,
  canonicalHash: hash,
  snapshot: canonicalProjectBrainSnapshotSchema,
  createdAt: z.string().datetime(),
}).strict();

const projectBrainDecisionProjectionSchema = z.object({
  id: boundedId,
  decision: z.enum([
    "CREATE",
    "ADD_OWNER_BRIEF",
    "ADMIT_SOURCE",
    "SUBMIT_FOR_REVIEW",
    "CONFIRM_EXACT",
    "REJECT",
  ]),
  priorStateVersion: z.number().int().nonnegative(),
  nextStateVersion: z.number().int().positive(),
  snapshotHash: hash.nullable(),
  createdAt: z.string().datetime(),
}).strict();

export const projectBrainIntakeSchema = z.object({
  id: boundedId,
  workspaceId: boundedId,
  projectId: boundedId,
  intakeSequence: z.number().int().positive(),
  status: projectBrainIntakeStatusSchema,
  stateVersion: z.number().int().positive(),
  ownerBrief: projectBrainOwnerBriefSchema.nullable(),
  reviewFingerprint: hash.nullable(),
  sources: z.array(projectBrainSourceProjectionSchema).max(20),
  snapshots: z.array(projectBrainSnapshotProjectionSchema),
  decisions: z.array(projectBrainDecisionProjectionSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const projectBrainIntakeProjectionSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_SCHEMA_VERSION),
  intake: projectBrainIntakeSchema.nullable(),
  limitations: z.array(projectBrainLimitationSchema).max(2),
  providerExecutionPerformed: z.literal(false),
  externalTransportPerformed: z.literal(false),
}).strict();

export const projectBrainCommandResultSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_SCHEMA_VERSION),
  commandId,
  action: z.enum([
    "CREATE_PROJECT_BRAIN_INTAKE",
    "ADD_OWNER_BRIEF",
    "ADMIT_PROJECT_BRAIN_SOURCE",
    "SUBMIT_PROJECT_BRAIN_INTAKE",
    "CONFIRM_PROJECT_BRAIN_INTAKE",
    "REJECT_PROJECT_BRAIN_INTAKE",
  ]),
  intakeId: boundedId,
  workspaceId: boundedId,
  projectId: boundedId,
  stateVersion: z.number().int().positive(),
  status: projectBrainIntakeStatusSchema,
  reviewFingerprint: hash.nullable(),
  canonicalEffectId: boundedId,
  replayed: z.boolean(),
  providerExecutionPerformed: z.literal(false),
  externalTransportPerformed: z.literal(false),
}).strict();

export type ProjectBrainCommand = z.infer<typeof projectBrainCommandSchema>;
export type ProjectBrainSourceCommand = z.infer<typeof projectBrainSourceCommandSchema>;
export type ProjectBrainOwnerBrief = z.infer<typeof projectBrainOwnerBriefSchema>;
export type CanonicalProjectBrainSnapshot = z.infer<typeof canonicalProjectBrainSnapshotSchema>;
export type ProjectBrainIntakeProjection = z.infer<typeof projectBrainIntakeProjectionSchema>;
export type ProjectBrainCommandResult = z.infer<typeof projectBrainCommandResultSchema>;

export function normalizeProjectBrainOwnerBrief(input: unknown): ProjectBrainOwnerBrief {
  return projectBrainOwnerBriefSchema.parse(input);
}

export function hashProjectBrainCommand(input: unknown): string {
  return sha256Canonical(input);
}

export function buildCanonicalProjectBrainSnapshot(input: {
  project: { id: string; code: string; name: string };
  ownerBrief: ProjectBrainOwnerBrief;
  sources: Array<{
    sourceId: string;
    ordinal: number;
    kind: z.infer<typeof projectBrainSourceKindSchema>;
    displayName: string;
    contentHash: string;
  }>;
}): { snapshot: CanonicalProjectBrainSnapshot; canonicalHash: string } {
  const hasVoice = input.sources.some((source) => source.kind === "VOICE_NOTE");
  const hasDocumentLike = input.sources.some((source) => source.kind !== "VOICE_NOTE");
  const limitations = [
    ...(hasVoice ? (["VOICE_NOT_TRANSCRIBED"] as const) : []),
    ...(hasDocumentLike ? (["DOCUMENT_CONTENT_NOT_INTERPRETED"] as const) : []),
  ];

  const snapshot = canonicalProjectBrainSnapshotSchema.parse({
    schemaVersion: PROJECT_BRAIN_SCHEMA_VERSION,
    project: input.project,
    ownerBrief: {
      provenance: "OWNER_CONFIRMED",
      ...normalizeProjectBrainOwnerBrief(input.ownerBrief),
    },
    sources: [...input.sources]
      .sort((left, right) => left.ordinal - right.ordinal || left.sourceId.localeCompare(right.sourceId))
      .map((source) => ({
        sourceId: source.sourceId,
        kind: source.kind,
        displayName: source.displayName,
        contentHash: source.contentHash,
        transcriptionState: "NOT_REQUESTED_LOCAL_ONLY",
        documentUnderstandingState: "NOT_REQUESTED_LOCAL_ONLY",
      })),
    limitations,
  });

  return {
    snapshot,
    canonicalHash: sha256Canonical(snapshot),
  };
}
