import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  canonicalProjectBrainUnderstandingSnapshotSchema,
  type CanonicalProjectBrainUnderstandingSnapshot,
} from "@/lib/construction-operating-assistant-r36x/project-brain-understanding-review";

export const PROJECT_BRAIN_ASSISTANT_MEMORY_SCHEMA_VERSION = 1 as const;
const id = z.string().trim().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const commandId = z.string().uuid();

export const projectBrainMemoryQuestionKindSchema = z.enum([
  "PROJECT_SUMMARY",
  "PROJECT_SCOPE",
  "IMPORTANT_PEOPLE",
  "IMPORTANT_DATES",
  "BLOCKERS",
  "NEXT_DECISION",
  "REVIEWED_SOURCE_INVENTORY",
  "RESOLVED_CONTRADICTION_HISTORY",
]);
export type ProjectBrainMemoryQuestionKind = z.infer<typeof projectBrainMemoryQuestionKindSchema>;

export const projectBrainPreparedActionFamilySchema = z.enum([
  "OPEN_LOOP_EVIDENCE_REQUEST",
  "SMS_MMS",
  "VOICE_CALL",
  "EMAIL",
]);
export type ProjectBrainPreparedActionFamily = z.infer<typeof projectBrainPreparedActionFamilySchema>;

const baseCommand = {
  schemaVersion: z.literal(PROJECT_BRAIN_ASSISTANT_MEMORY_SCHEMA_VERSION),
  commandId,
  workspaceId: id,
  projectId: id,
  expectedConfirmedUnderstandingSequence: z.number().int().positive(),
  expectedMemoryCanonicalHash: hash,
};

const citationSelectionSchema = z.object({ kind: projectBrainMemoryQuestionKindSchema }).strict();

export const recallConfirmedProjectMemoryCommandSchema = z.object({
  ...baseCommand,
  action: z.literal("RECALL_CONFIRMED_PROJECT_MEMORY"),
  questionKind: projectBrainMemoryQuestionKindSchema,
}).strict();

export const prepareConfirmedMemoryProjectActionCommandSchema = z.object({
  ...baseCommand,
  action: z.literal("PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION"),
  family: projectBrainPreparedActionFamilySchema,
  recipientContactRef: id,
  channel: z.enum(["SMS", "MMS", "VOICE", "EMAIL"]),
  body: z.string().trim().min(1).max(10_000),
  subject: z.string().trim().min(1).max(998).optional(),
  openLoopId: id.optional(),
  expectedOpenLoopStateVersion: z.number().int().positive().optional(),
  emailAccountId: id.optional(),
  emailToRef: z.string().trim().min(3).max(320).optional(),
  citationSelections: z.array(citationSelectionSchema).min(1).max(8)
    .refine((values) => new Set(values.map((value) => value.kind)).size === values.length, "duplicate citation selection"),
}).strict().superRefine((value, context) => {
  const expectedChannel = value.family === "SMS_MMS" ? ["SMS", "MMS"]
    : value.family === "VOICE_CALL" ? ["VOICE"]
      : value.family === "EMAIL" ? ["EMAIL"] : ["SMS", "EMAIL"];
  if (!expectedChannel.includes(value.channel)) context.addIssue({ code: "custom", path: ["channel"], message: "family channel mismatch" });
  if (value.family === "OPEN_LOOP_EVIDENCE_REQUEST" && (!value.openLoopId || !value.expectedOpenLoopStateVersion)) {
    context.addIssue({ code: "custom", path: ["openLoopId"], message: "open-loop binding required" });
  }
  if (value.family === "EMAIL" && (!value.subject || !value.emailAccountId || !value.emailToRef)) {
    context.addIssue({ code: "custom", path: ["subject"], message: "email binding required" });
  }
});

export const projectBrainAssistantCommandSchema = z.union([
  recallConfirmedProjectMemoryCommandSchema,
  prepareConfirmedMemoryProjectActionCommandSchema,
]);
export type ProjectBrainAssistantCommand = z.infer<typeof projectBrainAssistantCommandSchema>;
export type RecallConfirmedProjectMemoryCommand = z.infer<typeof recallConfirmedProjectMemoryCommandSchema>;
export type PrepareConfirmedMemoryProjectActionCommand = z.infer<typeof prepareConfirmedMemoryProjectActionCommandSchema>;

export const projectBrainAssistantFalseEffectsSchema = z.object({
  providerExecutionPerformed: z.literal(false),
  binaryUnderstandingPerformed: z.literal(false),
  externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false),
  approvalPerformed: z.literal(false),
  automaticResolutionPerformed: z.literal(false),
}).strict();

export const projectBrainAssistantFalseEffects = () => ({
  providerExecutionPerformed: false as const,
  binaryUnderstandingPerformed: false as const,
  externalTransportPerformed: false as const,
  externalWritePerformed: false as const,
  approvalPerformed: false as const,
  automaticResolutionPerformed: false as const,
});

export const projectBrainMemoryCitationSchema = z.object({
  ordinal: z.number().int().positive(),
  citationKind: z.enum(["REVIEWED_CANDIDATE", "OWNER_RESOLUTION", "SOURCE_METADATA"]),
  understandingSnapshotId: id,
  confirmationDecisionId: id,
  dispositionId: id.nullable(),
  resolutionId: id.nullable(),
  candidateId: id.nullable(),
  candidateBatchId: id,
  intakeId: id,
  confirmedIntakeSnapshotId: id.nullable(),
  sourceId: id.nullable(),
  provenanceFingerprint: hash,
}).strict();
export type ProjectBrainMemoryCitation = z.infer<typeof projectBrainMemoryCitationSchema>;

export const projectBrainMemoryAnswerSchema = z.object({
  questionKind: projectBrainMemoryQuestionKindSchema,
  answerKind: z.enum(["CONFIRMED_VALUES", "CONFIRMED_EMPTY", "LIMITATION"]),
  label: z.string().min(1).max(120),
  values: z.array(z.string().max(10_485_760)).max(146),
  citations: z.array(projectBrainMemoryCitationSchema).max(146),
  limitationCode: z.enum(["UNSUPPORTED_SEMANTIC_REASONING", "BINARY_UNDERSTANDING_UNAVAILABLE"]).nullable(),
}).strict();
export type ProjectBrainMemoryAnswer = z.infer<typeof projectBrainMemoryAnswerSchema>;

const fieldByQuestion: Partial<Record<ProjectBrainMemoryQuestionKind, "summary" | "scope" | "importantPeople" | "importantDates" | "blockers" | "nextDecision">> = {
  PROJECT_SUMMARY: "summary",
  PROJECT_SCOPE: "scope",
  IMPORTANT_PEOPLE: "importantPeople",
  IMPORTANT_DATES: "importantDates",
  BLOCKERS: "blockers",
  NEXT_DECISION: "nextDecision",
};

const labelByQuestion: Record<ProjectBrainMemoryQuestionKind, string> = {
  PROJECT_SUMMARY: "Résumé confirmé",
  PROJECT_SCOPE: "Portée confirmée",
  IMPORTANT_PEOPLE: "Personnes confirmées",
  IMPORTANT_DATES: "Dates confirmées",
  BLOCKERS: "Blocages confirmés",
  NEXT_DECISION: "Prochaine décision confirmée",
  REVIEWED_SOURCE_INVENTORY: "Sources examinées",
  RESOLVED_CONTRADICTION_HISTORY: "Contradictions résolues",
};

function citation(input: {
  ordinal: number;
  kind: "REVIEWED_CANDIDATE" | "OWNER_RESOLUTION" | "SOURCE_METADATA";
  confirmedSnapshotId: string;
  confirmationDecisionId: string;
  candidateBatchId: string;
  intakeId: string;
  confirmedIntakeSnapshotId?: string | null;
  candidateId?: string | null;
  dispositionId?: string | null;
  resolutionId?: string | null;
  sourceId?: string | null;
}): ProjectBrainMemoryCitation {
  const core = {
    ordinal: input.ordinal,
    citationKind: input.kind,
    understandingSnapshotId: input.confirmedSnapshotId,
    confirmationDecisionId: input.confirmationDecisionId,
    dispositionId: input.dispositionId ?? null,
    resolutionId: input.resolutionId ?? null,
    candidateId: input.candidateId ?? null,
    candidateBatchId: input.candidateBatchId,
    intakeId: input.intakeId,
    confirmedIntakeSnapshotId: input.confirmedIntakeSnapshotId ?? null,
    sourceId: input.sourceId ?? null,
  };
  return projectBrainMemoryCitationSchema.parse({ ...core, provenanceFingerprint: sha256Canonical(core) });
}

export function buildProjectBrainMemoryAnswer(input: {
  questionKind: ProjectBrainMemoryQuestionKind;
  snapshot: CanonicalProjectBrainUnderstandingSnapshot | unknown;
  confirmedSnapshotId: string;
  confirmationDecisionId: string;
  confirmedIntakeSnapshotId?: string | null;
  dispositionIdsByCandidateId: ReadonlyMap<string, string>;
  resolutionIdsByContradictionId: ReadonlyMap<string, string>;
}): ProjectBrainMemoryAnswer {
  const snapshot = canonicalProjectBrainUnderstandingSnapshotSchema.parse(input.snapshot);
  const values: string[] = [];
  const citations: ProjectBrainMemoryCitation[] = [];
  const field = fieldByQuestion[input.questionKind];

  if (field) {
    for (const candidate of snapshot.candidates) {
      if (candidate.disposition !== "ACCEPT_AS_REVIEWED" || candidate.provenance.kind !== "OWNER_TEXT" || candidate.provenance.ownerBriefField !== field) continue;
      const dispositionId = input.dispositionIdsByCandidateId.get(candidate.candidateId);
      if (!dispositionId) throw new Error("PROJECT_BRAIN_MEMORY_CITATION_INCOMPLETE");
      values.push(candidate.value);
      citations.push(citation({ ordinal: citations.length + 1, kind: "REVIEWED_CANDIDATE", confirmedSnapshotId: input.confirmedSnapshotId, confirmationDecisionId: input.confirmationDecisionId, candidateBatchId: snapshot.inputs.candidateBatchId, intakeId: snapshot.inputs.intakeId, confirmedIntakeSnapshotId: input.confirmedIntakeSnapshotId, candidateId: candidate.candidateId, dispositionId }));
    }
  } else if (input.questionKind === "REVIEWED_SOURCE_INVENTORY") {
    for (const source of snapshot.sources) {
      values.push(`${source.ordinal}. ${source.displayName} — ${source.kind} — ${source.mimeType} — ${source.sizeBytes} octets`);
      const sourceCandidate = snapshot.candidates.find((candidate) => candidate.provenance.kind === "SOURCE_METADATA" && candidate.provenance.sourceId === source.id && candidate.disposition === "ACCEPT_AS_REVIEWED");
      if (!sourceCandidate) throw new Error("PROJECT_BRAIN_MEMORY_CITATION_INCOMPLETE");
      const dispositionId = input.dispositionIdsByCandidateId.get(sourceCandidate.candidateId);
      if (!dispositionId) throw new Error("PROJECT_BRAIN_MEMORY_CITATION_INCOMPLETE");
      citations.push(citation({ ordinal: citations.length + 1, kind: "SOURCE_METADATA", confirmedSnapshotId: input.confirmedSnapshotId, confirmationDecisionId: input.confirmationDecisionId, candidateBatchId: snapshot.inputs.candidateBatchId, intakeId: snapshot.inputs.intakeId, confirmedIntakeSnapshotId: input.confirmedIntakeSnapshotId, candidateId: sourceCandidate.candidateId, dispositionId, sourceId: source.id }));
    }
  } else {
    for (const resolution of snapshot.ownerResolutions) {
      const resolutionId = input.resolutionIdsByContradictionId.get(resolution.contradictionId);
      if (!resolutionId) throw new Error("PROJECT_BRAIN_MEMORY_CITATION_INCOMPLETE");
      values.push(resolution.text);
      citations.push(citation({ ordinal: citations.length + 1, kind: "OWNER_RESOLUTION", confirmedSnapshotId: input.confirmedSnapshotId, confirmationDecisionId: input.confirmationDecisionId, candidateBatchId: snapshot.inputs.candidateBatchId, intakeId: snapshot.inputs.intakeId, confirmedIntakeSnapshotId: input.confirmedIntakeSnapshotId, resolutionId }));
    }
  }
  if (values.length !== citations.length) throw new Error("PROJECT_BRAIN_MEMORY_CITATION_INCOMPLETE");
  return projectBrainMemoryAnswerSchema.parse({
    questionKind: input.questionKind,
    answerKind: values.length ? "CONFIRMED_VALUES" : "CONFIRMED_EMPTY",
    label: labelByQuestion[input.questionKind],
    values,
    citations,
    limitationCode: null,
  });
}

export const projectBrainRecallResultSchema = z.object({
  schemaVersion: z.literal(1), commandId, action: z.literal("RECALL_CONFIRMED_PROJECT_MEMORY"),
  workspaceId: id, projectId: id, receiptId: id, confirmedUnderstandingSequence: z.number().int().positive(),
  confirmedUnderstandingSnapshotId: id, memoryCanonicalHash: hash, answer: projectBrainMemoryAnswerSchema,
  resultHash: hash, replayed: z.boolean(), falseEffects: projectBrainAssistantFalseEffectsSchema,
}).strict();

export const projectBrainPreparedActionProjectionSchema = z.object({
  bindingId: id,
  family: projectBrainPreparedActionFamilySchema,
  familyEntityId: id,
  familyEntityVersion: z.number().int().positive(),
  payloadFingerprint: hash,
  recipientContactId: id,
  recipientDisplayName: z.string().min(1).max(240),
  recipientRef: z.string().min(1).max(320),
  channel: z.enum(["SMS", "MMS", "VOICE", "EMAIL"]),
  subject: z.string().max(998).nullable(),
  body: z.string().min(1).max(10_000),
  status: z.literal("PREPARED_UNSENT"),
  approvalRequired: z.literal(true),
  requiredApprovingRole: z.enum(["OWNER", "OFFICE_MANAGER", "HUMAN_CALLER"]),
  citations: z.array(projectBrainMemoryCitationSchema).min(1).max(146),
}).strict();

export const projectBrainPrepareActionResultSchema = z.object({
  schemaVersion: z.literal(1), commandId, action: z.literal("PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION"),
  workspaceId: id, projectId: id, confirmedUnderstandingSequence: z.number().int().positive(),
  confirmedUnderstandingSnapshotId: id, memoryCanonicalHash: hash,
  preparedAction: projectBrainPreparedActionProjectionSchema,
  resultHash: hash, replayed: z.boolean(), falseEffects: projectBrainAssistantFalseEffectsSchema,
}).strict();

export const projectBrainAssistantCommandResultSchema = z.union([
  projectBrainRecallResultSchema,
  projectBrainPrepareActionResultSchema,
]);
export type ProjectBrainAssistantCommandResult = z.infer<typeof projectBrainAssistantCommandResultSchema>;

export const projectBrainAssistantMemoryProjectionSchema = z.object({
  schemaVersion: z.literal(1), workspaceId: id, projectId: id,
  currentMemory: z.object({ confirmedUnderstandingSequence: z.number().int().positive(), confirmedUnderstandingSnapshotId: id, memoryCanonicalHash: hash, supportedQuestions: z.array(projectBrainMemoryQuestionKindSchema).length(8) }).strict().nullable(),
  recallHistory: z.array(projectBrainRecallResultSchema).max(100),
  preparedActions: z.array(projectBrainPreparedActionProjectionSchema).max(100),
  falseEffects: projectBrainAssistantFalseEffectsSchema,
}).strict();
export type ProjectBrainAssistantMemoryProjection = z.infer<typeof projectBrainAssistantMemoryProjectionSchema>;

export const PROJECT_BRAIN_MEMORY_QUESTIONS = projectBrainMemoryQuestionKindSchema.options;
