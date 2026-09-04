import { z } from "zod";

const id = z.string().trim().min(1).max(320);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const questionKind = z.enum([
  "PROJECT_SUMMARY",
  "PROJECT_SCOPE",
  "IMPORTANT_PEOPLE",
  "IMPORTANT_DATES",
  "BLOCKERS",
  "NEXT_DECISION",
  "REVIEWED_SOURCE_INVENTORY",
  "RESOLVED_CONTRADICTION_HISTORY",
]);
const family = z.enum(["OPEN_LOOP_EVIDENCE_REQUEST", "SMS_MMS", "VOICE_CALL", "EMAIL"]);
const base = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: id,
  projectId: id,
  expectedConfirmedUnderstandingSequence: z.number().int().positive(),
  expectedMemoryCanonicalHash: hash,
};

export const mobileProjectBrainRecallCommandSchema = z.object({
  ...base,
  action: z.literal("RECALL_CONFIRMED_PROJECT_MEMORY"),
  questionKind,
}).strict();

export const mobileProjectBrainPrepareActionCommandSchema = z.object({
  ...base,
  action: z.literal("PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION"),
  family,
  recipientContactRef: id,
  channel: z.enum(["SMS", "MMS", "VOICE", "EMAIL"]),
  body: z.string().trim().min(1).max(10_000),
  subject: z.string().trim().min(1).max(998).optional(),
  openLoopId: id.optional(),
  expectedOpenLoopStateVersion: z.number().int().positive().optional(),
  emailAccountId: id.optional(),
  emailToRef: z.string().trim().min(3).max(320).optional(),
  citationSelections: z.array(z.object({ kind: questionKind }).strict()).min(1).max(8),
}).strict();

export const mobileProjectBrainAssistantCommandSchema = z.union([
  mobileProjectBrainRecallCommandSchema,
  mobileProjectBrainPrepareActionCommandSchema,
]);
export type MobileProjectBrainAssistantCommand = z.infer<typeof mobileProjectBrainAssistantCommandSchema>;

const falseEffects = z.object({
  providerExecutionPerformed: z.literal(false),
  binaryUnderstandingPerformed: z.literal(false),
  externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false),
  approvalPerformed: z.literal(false),
  automaticResolutionPerformed: z.literal(false),
}).strict();
const citation = z.object({
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
const answer = z.object({
  questionKind,
  answerKind: z.enum(["CONFIRMED_VALUES", "CONFIRMED_EMPTY", "LIMITATION"]),
  label: z.string().min(1),
  values: z.array(z.string()),
  citations: z.array(citation),
  limitationCode: z.enum(["UNSUPPORTED_SEMANTIC_REASONING", "BINARY_UNDERSTANDING_UNAVAILABLE"]).nullable(),
}).strict();
const preparedAction = z.object({
  bindingId: id,
  family,
  familyEntityId: id,
  familyEntityVersion: z.number().int().positive(),
  payloadFingerprint: hash,
  recipientContactId: id,
  recipientDisplayName: z.string().min(1),
  recipientRef: z.string().min(1),
  channel: z.enum(["SMS", "MMS", "VOICE", "EMAIL"]),
  subject: z.string().nullable(),
  body: z.string().min(1),
  status: z.literal("PREPARED_UNSENT"),
  approvalRequired: z.literal(true),
  requiredApprovingRole: z.enum(["OWNER", "OFFICE_MANAGER", "HUMAN_CALLER"]),
  citations: z.array(citation).min(1),
}).strict();
const resultBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: id,
  projectId: id,
  confirmedUnderstandingSequence: z.number().int().positive(),
  confirmedUnderstandingSnapshotId: id,
  memoryCanonicalHash: hash,
  resultHash: hash,
  replayed: z.boolean(),
  falseEffects,
};
export const mobileProjectBrainAssistantResultSchema = z.union([
  z.object({ ...resultBase, action: z.literal("RECALL_CONFIRMED_PROJECT_MEMORY"), receiptId: id, answer }).strict(),
  z.object({ ...resultBase, action: z.literal("PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION"), preparedAction }).strict(),
]);
export type MobileProjectBrainAssistantResult = z.infer<typeof mobileProjectBrainAssistantResultSchema>;

export const mobileProjectBrainAssistantMemoryProjectionSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: id,
  projectId: id,
  currentMemory: z.object({
    confirmedUnderstandingSequence: z.number().int().positive(),
    confirmedUnderstandingSnapshotId: id,
    memoryCanonicalHash: hash,
    supportedQuestions: z.array(questionKind).length(8),
  }).strict().nullable(),
  recallHistory: z.array(z.object({ ...resultBase, action: z.literal("RECALL_CONFIRMED_PROJECT_MEMORY"), receiptId: id, answer }).strict()).max(100),
  preparedActions: z.array(preparedAction).max(100),
  falseEffects,
}).strict();
export type MobileProjectBrainAssistantMemoryProjection = z.infer<typeof mobileProjectBrainAssistantMemoryProjectionSchema>;

type IdFactory = () => string;

export function createProjectBrainRecallCommand(input: {
  workspaceId: string;
  projectId: string;
  confirmedUnderstandingSequence: number;
  memoryCanonicalHash: string;
  questionKind: z.infer<typeof questionKind>;
  idFactory?: IdFactory;
}) {
  return mobileProjectBrainRecallCommandSchema.parse({
    schemaVersion: 1,
    commandId: (input.idFactory ?? (() => globalThis.crypto.randomUUID()))(),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    expectedConfirmedUnderstandingSequence: input.confirmedUnderstandingSequence,
    expectedMemoryCanonicalHash: input.memoryCanonicalHash,
    questionKind: input.questionKind,
    action: "RECALL_CONFIRMED_PROJECT_MEMORY",
  });
}

export function projectBrainAssistantMemoryRoute(projectId: string): string {
  return `/(app)/assistant?projectId=${encodeURIComponent(projectId)}`;
}
