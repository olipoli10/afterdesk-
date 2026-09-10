import { z } from "zod";

export const PROJECT_BRAIN_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const PROJECT_BRAIN_MAX_VOICE_DURATION_MS = 600_000;

const id = z.string().trim().min(1).max(200);
const commandId = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const ownerText = z.string().trim().max(4_000);

export const mobileProjectBrainOwnerBriefSchema = z.object({
  summary: z.string().trim().min(1).max(4_000),
  scope: ownerText,
  importantPeople: ownerText,
  importantDates: ownerText,
  blockers: ownerText,
  nextDecision: ownerText,
}).strict();

const base = {
  schemaVersion: z.literal(1),
  commandId,
  workspaceId: id,
  projectId: id,
};
const mutationBase = {
  ...base,
  intakeId: id,
  expectedStateVersion: z.number().int().positive(),
};

export const mobileProjectBrainCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("CREATE_PROJECT_BRAIN_INTAKE") }).strict(),
  z.object({
    ...mutationBase,
    action: z.literal("ADD_OWNER_BRIEF"),
    brief: mobileProjectBrainOwnerBriefSchema,
  }).strict(),
  z.object({ ...mutationBase, action: z.literal("SUBMIT_PROJECT_BRAIN_INTAKE") }).strict(),
  z.object({
    ...mutationBase,
    action: z.literal("CONFIRM_PROJECT_BRAIN_INTAKE"),
    reviewFingerprint: hash,
  }).strict(),
  z.object({
    ...mutationBase,
    action: z.literal("REJECT_PROJECT_BRAIN_INTAKE"),
    reviewFingerprint: hash,
  }).strict(),
]);

const sourceKind = z.enum(["PHOTO", "DOCUMENT", "VOICE_NOTE"]);
const sourceMime = z.enum([
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
]);

export const mobileProjectBrainSourceCommandSchema = z.object({
  ...mutationBase,
  action: z.literal("ADMIT_PROJECT_BRAIN_SOURCE"),
  kind: sourceKind,
  fileName: z.string().trim().min(1).max(240),
  mimeType: sourceMime,
  sizeBytes: z.number().int().positive().max(PROJECT_BRAIN_MAX_SOURCE_BYTES),
  durationMs: z.number().int().positive().max(PROJECT_BRAIN_MAX_VOICE_DURATION_MS).nullable(),
  uri: z.string().min(1),
}).strict().superRefine((value, context) => {
  const allowed = {
    PHOTO: ["image/jpeg", "image/png"],
    DOCUMENT: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    VOICE_NOTE: ["audio/mp4", "audio/m4a", "audio/x-m4a"],
  }[value.kind];
  if (!allowed.includes(value.mimeType)) {
    context.addIssue({ code: "custom", path: ["mimeType"], message: "SOURCE_KIND_MIME_MISMATCH" });
  }
  if ((value.kind === "VOICE_NOTE") !== (value.durationMs !== null)) {
    context.addIssue({ code: "custom", path: ["durationMs"], message: "SOURCE_DURATION_MISMATCH" });
  }
});

const limitation = z.enum(["VOICE_NOT_TRANSCRIBED", "DOCUMENT_CONTENT_NOT_INTERPRETED"]);
const interpretation = z.literal("NOT_REQUESTED_LOCAL_ONLY");
const sourceProjection = z.object({
  id,
  ordinal: z.number().int().positive(),
  kind: sourceKind,
  fileId: id,
  contentHash: hash,
  displayName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(160),
  sizeBytes: z.number().int().positive().max(PROJECT_BRAIN_MAX_SOURCE_BYTES),
  durationMs: z.number().int().positive().nullable(),
  transcriptionState: interpretation,
  documentUnderstandingState: interpretation,
  createdAt: z.string().datetime(),
}).strict();

const canonicalSnapshot = z.object({
  schemaVersion: z.literal(1),
  project: z.object({
    id,
    code: z.string().min(1).max(120),
    name: z.string().min(1).max(240),
  }).strict(),
  ownerBrief: mobileProjectBrainOwnerBriefSchema.extend({
    provenance: z.literal("OWNER_CONFIRMED"),
  }).strict(),
  sources: z.array(z.object({
    sourceId: id,
    kind: sourceKind,
    displayName: z.string().min(1).max(240),
    contentHash: hash,
    transcriptionState: interpretation,
    documentUnderstandingState: interpretation,
  }).strict()).max(20),
  limitations: z.array(limitation).max(2),
}).strict();

const snapshotProjection = z.object({
  id,
  stateVersion: z.number().int().positive(),
  status: z.enum(["PROPOSED", "CONFIRMED"]),
  canonicalHash: hash,
  snapshot: canonicalSnapshot,
  createdAt: z.string().datetime(),
}).strict();

const decisionProjection = z.object({
  id,
  decision: z.enum(["CREATE", "ADD_OWNER_BRIEF", "ADMIT_SOURCE", "SUBMIT_FOR_REVIEW", "CONFIRM_EXACT", "REJECT"]),
  priorStateVersion: z.number().int().nonnegative(),
  nextStateVersion: z.number().int().positive(),
  snapshotHash: hash.nullable(),
  createdAt: z.string().datetime(),
}).strict();

export const mobileProjectBrainIntakeProjectionSchema = z.object({
  schemaVersion: z.literal(1),
  intake: z.object({
    id,
    workspaceId: id,
    projectId: id,
    intakeSequence: z.number().int().positive(),
    status: z.enum(["DRAFT", "READY_FOR_REVIEW", "CONFIRMED", "REJECTED"]),
    stateVersion: z.number().int().positive(),
    ownerBrief: mobileProjectBrainOwnerBriefSchema.nullable(),
    reviewFingerprint: hash.nullable(),
    sources: z.array(sourceProjection).max(20),
    snapshots: z.array(snapshotProjection),
    decisions: z.array(decisionProjection),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }).strict().nullable(),
  limitations: z.array(limitation).max(2),
  providerExecutionPerformed: z.literal(false),
  externalTransportPerformed: z.literal(false),
}).strict();

export const mobileProjectBrainCommandResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId,
  action: z.enum([
    "CREATE_PROJECT_BRAIN_INTAKE",
    "ADD_OWNER_BRIEF",
    "ADMIT_PROJECT_BRAIN_SOURCE",
    "SUBMIT_PROJECT_BRAIN_INTAKE",
    "CONFIRM_PROJECT_BRAIN_INTAKE",
    "REJECT_PROJECT_BRAIN_INTAKE",
  ]),
  intakeId: id,
  workspaceId: id,
  projectId: id,
  stateVersion: z.number().int().positive(),
  status: z.enum(["DRAFT", "READY_FOR_REVIEW", "CONFIRMED", "REJECTED"]),
  reviewFingerprint: hash.nullable(),
  canonicalEffectId: id,
  replayed: z.boolean(),
  providerExecutionPerformed: z.literal(false),
  externalTransportPerformed: z.literal(false),
}).strict();

export type MobileProjectBrainCommand = z.infer<typeof mobileProjectBrainCommandSchema>;
export type MobileProjectBrainSourceCommand = z.infer<typeof mobileProjectBrainSourceCommandSchema>;
export type MobileProjectBrainIntakeProjection = z.infer<typeof mobileProjectBrainIntakeProjectionSchema>;
export type MobileProjectBrainCommandResult = z.infer<typeof mobileProjectBrainCommandResultSchema>;
export type MobileProjectBrainOwnerBrief = z.infer<typeof mobileProjectBrainOwnerBriefSchema>;
export type ProjectBrainSourceAttemptState = "READY" | "SENDING" | "CONFIRMED" | "REPLAYED" | "CONFLICT" | "OUTCOME_UNKNOWN" | "REFUSED";
export type ProjectBrainSourceAttempt = Readonly<{
  command: MobileProjectBrainSourceCommand;
  state: ProjectBrainSourceAttemptState;
  result: MobileProjectBrainCommandResult | null;
  publicError: string | null;
}>;

export function projectBrainFailureStateForApiCode(
  code: string | undefined,
): Exclude<ProjectBrainSourceAttemptState, "READY" | "SENDING" | "CONFIRMED" | "REPLAYED"> {
  if (code === "CONFLICT") return "CONFLICT";
  if (
    code === "OUTCOME_UNKNOWN"
    || code === "INVALID_RESPONSE"
    || code === "RATE_LIMITED"
    || code === "SERVER_ERROR"
  ) {
    return "OUTCOME_UNKNOWN";
  }
  return "REFUSED";
}

export function projectBrainIntakeForContext(
  projection: MobileProjectBrainIntakeProjection | null,
  workspaceId: string | undefined,
  projectId: string | undefined,
) {
  const intake = projection?.intake ?? null;
  return intake && intake.workspaceId === workspaceId && intake.projectId === projectId ? intake : null;
}

export function projectBrainSourceQueueForContext(
  queue: readonly ProjectBrainSourceAttempt[],
  workspaceId: string | undefined,
  projectId: string | undefined,
) {
  return queue.filter(
    (attempt) => attempt.command.workspaceId === workspaceId && attempt.command.projectId === projectId,
  );
}

export function stageProjectBrainSourceAttempts(
  queue: readonly ProjectBrainSourceAttempt[],
  attempts: readonly ProjectBrainSourceAttempt[],
) {
  const stagedIds = new Set(attempts.map((attempt) => attempt.command.commandId));
  return [...queue.filter((attempt) => !stagedIds.has(attempt.command.commandId)), ...attempts];
}

export function removeProjectBrainSourceAttempt(
  queue: readonly ProjectBrainSourceAttempt[],
  commandIdValue: string,
) {
  return queue.filter((attempt) => attempt.command.commandId !== commandIdValue);
}

export function createProjectBrainSourceAttempts(
  commands: readonly Omit<MobileProjectBrainSourceCommand, "expectedStateVersion">[],
  initialStateVersion: number,
) {
  return commands.map((command, index) => createProjectBrainSourceAttempt({
    ...command,
    expectedStateVersion: initialStateVersion + index,
  }));
}

export function projectBrainOwnerBriefMatches(
  durable: MobileProjectBrainOwnerBrief | null,
  draft: MobileProjectBrainOwnerBrief,
) {
  if (!durable) return false;
  return durable.summary === draft.summary
    && durable.scope === draft.scope
    && durable.importantPeople === draft.importantPeople
    && durable.importantDates === draft.importantDates
    && durable.blockers === draft.blockers
    && durable.nextDecision === draft.nextDecision;
}

export function projectBrainOwnerBriefDraft(
  durable: MobileProjectBrainOwnerBrief | null | undefined,
): MobileProjectBrainOwnerBrief {
  return durable
    ? {
        summary: durable.summary,
        scope: durable.scope,
        importantPeople: durable.importantPeople,
        importantDates: durable.importantDates,
        blockers: durable.blockers,
        nextDecision: durable.nextDecision,
      }
    : {
        summary: "",
        scope: "",
        importantPeople: "",
        importantDates: "",
        blockers: "",
        nextDecision: "",
      };
}

export function projectBrainBriefHydrationKey(input: {
  workspaceId: string | undefined;
  projectId: string | undefined;
  intakeId: string | undefined;
  durable: MobileProjectBrainOwnerBrief | null | undefined;
}) {
  const draft = projectBrainOwnerBriefDraft(input.durable);
  return JSON.stringify([
    input.workspaceId ?? "",
    input.projectId ?? "",
    input.intakeId ?? "",
    draft.summary,
    draft.scope,
    draft.importantPeople,
    draft.importantDates,
    draft.blockers,
    draft.nextDecision,
  ]);
}

export function rebaseReadyProjectBrainSourceAttempt(
  value: ProjectBrainSourceAttempt,
  expectedStateVersion: number,
) {
  if (value.state !== "READY") throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_REBASE_REFUSED");
  return createProjectBrainSourceAttempt({ ...value.command, expectedStateVersion });
}

export function createProjectBrainSourceAttempt(command: unknown): ProjectBrainSourceAttempt {
  return Object.freeze({
    command: mobileProjectBrainSourceCommandSchema.parse(command),
    state: "READY",
    result: null,
    publicError: null,
  });
}

export function beginProjectBrainSourceAttempt(value: ProjectBrainSourceAttempt): ProjectBrainSourceAttempt {
  if (value.state !== "READY" && value.state !== "OUTCOME_UNKNOWN") {
    throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_ALREADY_DISPATCHED");
  }
  return Object.freeze({ ...value, state: "SENDING", publicError: null });
}

export function finishProjectBrainSourceAttempt(
  value: ProjectBrainSourceAttempt,
  input: { state: Exclude<ProjectBrainSourceAttemptState, "READY" | "SENDING">; result?: MobileProjectBrainCommandResult | null; publicError?: string | null },
): ProjectBrainSourceAttempt {
  if (value.state !== "SENDING") throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_NOT_SENDING");
  return Object.freeze({ ...value, state: input.state, result: input.result ?? null, publicError: input.publicError ?? null });
}

export function parseMobileProjectBrainIntake(value: unknown) {
  return mobileProjectBrainIntakeProjectionSchema.parse(value);
}
