import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export const PROJECT_BRAIN_FACT_CANDIDATE_SCHEMA_VERSION = 1 as const;
export const PROJECT_BRAIN_FACT_CANDIDATE_ADAPTER_SET_VERSION =
  "PROJECT_BRAIN_FACT_CANDIDATES_V1" as const;

export const FACT_CANDIDATE_ADAPTERS = [
  "OWNER_BRIEF_FIELDS_V1",
  "ADMITTED_SOURCE_METADATA_V1",
] as const;

export const FACT_CANDIDATE_OWNER_FIELDS = [
  "summary",
  "scope",
  "importantPeople",
  "importantDates",
  "blockers",
  "nextDecision",
] as const;

export const FACT_CANDIDATE_METADATA_FIELDS = [
  "kind",
  "displayName",
  "mimeType",
  "sizeBytes",
  "durationMs",
  "ordinal",
  "contentHash",
] as const;

const boundedId = z.string().trim().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const commandId = z.string().uuid();

export const factCandidateGenerationCommandSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_FACT_CANDIDATE_SCHEMA_VERSION),
  action: z.literal("GENERATE_PROJECT_BRAIN_FACT_CANDIDATES"),
  commandId,
  workspaceId: boundedId,
  projectId: boundedId,
  intakeId: boundedId,
  confirmedSnapshotHash: hash,
  adapterSetVersion: z.literal(PROJECT_BRAIN_FACT_CANDIDATE_ADAPTER_SET_VERSION),
}).strict();

export const projectBrainFactCandidateProjectionSchema = z.object({
  id: boundedId.optional(),
  candidateFingerprint: hash,
  workspaceId: boundedId,
  projectId: boundedId,
  intakeId: boundedId,
  confirmedSnapshotId: boundedId,
  confirmedSnapshotHash: hash,
  adapter: z.enum(FACT_CANDIDATE_ADAPTERS),
  kind: z.enum(["OWNER_TEXT", "SOURCE_METADATA"]),
  status: z.literal("CANDIDATE_UNCONFIRMED"),
  confidenceClass: z.enum(["EXACT_OWNER_TEXT", "EXACT_CANONICAL_METADATA"]),
  value: z.string().max(10_485_760),
  ownerBriefField: z.enum(FACT_CANDIDATE_OWNER_FIELDS).nullable(),
  rangeUnit: z.literal("UTF16_CODE_UNIT").nullable(),
  rangeStart: z.number().int().nonnegative().nullable(),
  rangeEnd: z.number().int().positive().nullable(),
  sourceId: boundedId.nullable(),
  sourceOrdinal: z.number().int().positive().nullable(),
  sourceContentHash: hash.nullable(),
  metadataField: z.enum(FACT_CANDIDATE_METADATA_FIELDS).nullable(),
}).strict().superRefine((value, context) => {
  if (value.kind === "OWNER_TEXT") {
    if (
      value.adapter !== "OWNER_BRIEF_FIELDS_V1" ||
      value.confidenceClass !== "EXACT_OWNER_TEXT" ||
      value.ownerBriefField === null ||
      value.rangeUnit !== "UTF16_CODE_UNIT" ||
      value.rangeStart === null || value.rangeEnd === null ||
      value.rangeStart >= value.rangeEnd ||
      value.sourceId !== null || value.sourceOrdinal !== null ||
      value.sourceContentHash !== null || value.metadataField !== null
    ) {
      context.addIssue({ code: "custom", message: "Invalid owner-text provenance." });
    }
  } else if (
    value.adapter !== "ADMITTED_SOURCE_METADATA_V1" ||
    value.confidenceClass !== "EXACT_CANONICAL_METADATA" ||
    value.ownerBriefField !== null || value.rangeUnit !== null ||
    value.rangeStart !== null || value.rangeEnd !== null ||
    value.sourceId === null || value.sourceOrdinal === null ||
    value.sourceContentHash === null || value.metadataField === null
  ) {
    context.addIssue({ code: "custom", message: "Invalid source-metadata provenance." });
  }
});

export const projectBrainFactCandidateBatchProjectionSchema = z.object({
  id: boundedId,
  workspaceId: boundedId,
  projectId: boundedId,
  intakeId: boundedId,
  confirmedSnapshotId: boundedId,
  confirmedSnapshotHash: hash,
  schemaVersion: z.literal(PROJECT_BRAIN_FACT_CANDIDATE_SCHEMA_VERSION),
  adapterSetVersion: z.literal(PROJECT_BRAIN_FACT_CANDIDATE_ADAPTER_SET_VERSION),
  status: z.literal("COMPLETED_LOCAL"),
  candidateCount: z.number().int().nonnegative().max(146),
  candidateSetHash: hash,
  candidates: z.array(projectBrainFactCandidateProjectionSchema).max(146),
  limitations: z.array(z.enum([
    "VOICE_NOT_TRANSCRIBED",
    "DOCUMENT_CONTENT_NOT_INTERPRETED",
  ])).max(2),
  createdAt: z.string().datetime(),
}).strict();

const falseEffects = {
  providerExecutionPerformed: z.literal(false),
  binaryUnderstandingPerformed: z.literal(false),
  externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false),
  automaticConfirmationPerformed: z.literal(false),
};

export const projectBrainFactCandidateResultSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_FACT_CANDIDATE_SCHEMA_VERSION),
  commandId,
  action: z.literal("GENERATE_PROJECT_BRAIN_FACT_CANDIDATES"),
  workspaceId: boundedId,
  projectId: boundedId,
  intakeId: boundedId,
  batchId: boundedId,
  confirmedSnapshotHash: hash,
  adapterSetVersion: z.literal(PROJECT_BRAIN_FACT_CANDIDATE_ADAPTER_SET_VERSION),
  candidateCount: z.number().int().nonnegative().max(146),
  candidateSetHash: hash,
  replayed: z.boolean(),
  ...falseEffects,
}).strict();

export const projectBrainFactCandidateReadResultSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_FACT_CANDIDATE_SCHEMA_VERSION),
  batch: projectBrainFactCandidateBatchProjectionSchema.nullable(),
  ...falseEffects,
}).strict();

export type FactCandidateGenerationCommand = z.infer<typeof factCandidateGenerationCommandSchema>;
export type ProjectBrainFactCandidate = z.infer<typeof projectBrainFactCandidateProjectionSchema>;
export type ProjectBrainFactCandidateResult = z.infer<typeof projectBrainFactCandidateResultSchema>;
export type ProjectBrainFactCandidateReadResult = z.infer<typeof projectBrainFactCandidateReadResultSchema>;

export type FactCandidateBuildInput = {
  workspaceId: string;
  projectId: string;
  intakeId: string;
  confirmedSnapshotId: string;
  confirmedSnapshotHash: string;
  ownerBrief: Record<(typeof FACT_CANDIDATE_OWNER_FIELDS)[number], string>;
  sources: Array<{
    id: string;
    ordinal: number;
    kind: "PHOTO" | "DOCUMENT" | "VOICE_NOTE";
    displayName: string;
    mimeType: string;
    sizeBytes: number;
    durationMs: number | null;
    contentHash: string;
  }>;
};

function candidateFingerprint(input: Omit<ProjectBrainFactCandidate, "id" | "candidateFingerprint">): string {
  return sha256Canonical({
    schemaVersion: PROJECT_BRAIN_FACT_CANDIDATE_SCHEMA_VERSION,
    adapterSetVersion: PROJECT_BRAIN_FACT_CANDIDATE_ADAPTER_SET_VERSION,
    ...input,
  });
}

function completeCandidate(
  input: Omit<ProjectBrainFactCandidate, "id" | "candidateFingerprint">,
): ProjectBrainFactCandidate {
  return projectBrainFactCandidateProjectionSchema.parse({
    ...input,
    candidateFingerprint: candidateFingerprint(input),
  });
}

export function buildProjectBrainFactCandidates(input: FactCandidateBuildInput): ProjectBrainFactCandidate[] {
  const common = {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    intakeId: input.intakeId,
    confirmedSnapshotId: input.confirmedSnapshotId,
    confirmedSnapshotHash: input.confirmedSnapshotHash,
    status: "CANDIDATE_UNCONFIRMED" as const,
  };
  const candidates: ProjectBrainFactCandidate[] = [];

  for (const ownerBriefField of FACT_CANDIDATE_OWNER_FIELDS) {
    const value = input.ownerBrief[ownerBriefField];
    if (value.length === 0) continue;
    candidates.push(completeCandidate({
      ...common,
      adapter: "OWNER_BRIEF_FIELDS_V1",
      kind: "OWNER_TEXT",
      confidenceClass: "EXACT_OWNER_TEXT",
      value,
      ownerBriefField,
      rangeUnit: "UTF16_CODE_UNIT",
      rangeStart: 0,
      rangeEnd: value.length,
      sourceId: null,
      sourceOrdinal: null,
      sourceContentHash: null,
      metadataField: null,
    }));
  }

  for (const source of [...input.sources].sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id))) {
    const values = {
      kind: source.kind,
      displayName: source.displayName,
      mimeType: source.mimeType,
      sizeBytes: String(source.sizeBytes),
      durationMs: source.durationMs === null ? null : String(source.durationMs),
      ordinal: String(source.ordinal),
      contentHash: source.contentHash,
    } as const;
    for (const metadataField of FACT_CANDIDATE_METADATA_FIELDS) {
      const value = values[metadataField];
      if (value === null) continue;
      candidates.push(completeCandidate({
        ...common,
        adapter: "ADMITTED_SOURCE_METADATA_V1",
        kind: "SOURCE_METADATA",
        confidenceClass: "EXACT_CANONICAL_METADATA",
        value,
        ownerBriefField: null,
        rangeUnit: null,
        rangeStart: null,
        rangeEnd: null,
        sourceId: source.id,
        sourceOrdinal: source.ordinal,
        sourceContentHash: source.contentHash,
        metadataField,
      }));
    }
  }

  return candidates;
}

export function hashFactCandidateCommand(input: unknown): string {
  return sha256Canonical(input);
}

export function hashProjectBrainFactCandidateSet(candidates: ProjectBrainFactCandidate[]): string {
  return sha256Canonical(candidates.map((candidate) =>
    Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "id"))));
}
