import { z } from "zod";

const identifier = z.string().min(1).max(160);
const instant = z.string().datetime();
const commandBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  requestId: identifier,
  idempotencyKey: identifier,
  workspaceId: identifier,
};

const prepareSchema = z.object({
  ...commandBase,
  action: z.literal("PREPARE"),
  projectId: identifier,
  openLoopId: identifier,
  expectedStateVersion: z.number().int().positive(),
  purpose: z.literal("OBTAIN_MISSING_EVIDENCE"),
  evidenceKind: z.enum(["WRITTEN_APPROVAL", "PHOTO", "DOCUMENT"]),
  acceptedClientPriceCents: z.number().int().positive().max(2_000_000),
  acceptedWorkerPayoutCents: z.number().int().positive().max(1_000_000),
  acceptedEstimatedMinutes: z.number().int().positive().max(480),
  acceptedCurrency: z.literal("CAD"),
}).strict().superRefine((value, context) => {
  if (value.acceptedWorkerPayoutCents > value.acceptedClientPriceCents) {
    context.addIssue({
      code: "custom",
      path: ["acceptedWorkerPayoutCents"],
      message: "Worker payout cannot exceed the accepted client price.",
    });
  }
});

const withdrawSchema = z.object({
  ...commandBase,
  action: z.literal("WITHDRAW"),
  escalationId: identifier,
  reason: z.string().trim().min(1).max(1_000),
}).strict();

export const mobileHumanEscalationCommandSchema = z.union([
  prepareSchema,
  withdrawSchema,
]);

export type MobileHumanEscalationCommand = z.infer<
  typeof mobileHumanEscalationCommandSchema
>;

const stateSchema = z.enum([
  "PREPARED",
  "WAITING_FOR_WORKER",
  "WORK_IN_PROGRESS",
  "WAITING_FOR_REVIEW",
  "REVISION_REQUIRED",
  "ACCEPTED_PENDING_RESUME",
  "RESUMED_PENDING_APPLICATION",
  "APPLIED",
  "WITHDRAWN",
  "PAUSED",
  "EXHAUSTED",
  "OPERATOR_ATTENTION_REQUIRED",
]);

const cockpitBase = {
  schemaVersion: z.literal(1),
  generatedAt: instant,
  workspaceId: identifier,
  externalTransportPerformed: z.literal(false),
};

const eligibleLoopSchema = z.object({
  loopId: identifier,
  projectId: identifier,
  projectCode: z.string().min(1),
  projectName: z.string().min(1),
  stateVersion: z.number().int().positive(),
  missingEvidenceKinds: z.array(
    z.enum(["WRITTEN_APPROVAL", "SUPPORTING_EVIDENCE"]),
  ).min(1),
  nextAction: z.string().min(1),
}).strict();

const escalationSchema = z.object({
  escalationId: identifier,
  projectId: identifier,
  projectCode: z.string().min(1),
  projectName: z.string().min(1),
  openLoopId: identifier,
  purpose: z.literal("OBTAIN_MISSING_EVIDENCE"),
  evidenceKind: z.enum(["WRITTEN_APPROVAL", "PHOTO", "DOCUMENT"]),
  state: stateSchema,
  nextResponsibleRole: z.enum([
    "OWNER",
    "OFFICE",
    "SYSTEM",
    "WORKER",
    "REVIEWER",
    "OPERATOR",
    "NONE",
  ]),
  nextAction: z.string().min(1),
  deadlineAt: instant.nullable(),
  remainingRevisions: z.number().int().nonnegative(),
  sourceStateVersion: z.number().int().positive(),
  acceptedClientPriceCents: z.number().int().positive(),
  acceptedCurrency: z.literal("CAD"),
  acceptanceId: identifier.nullable(),
  acceptedResultHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  appliedAt: instant.nullable(),
  fundingRequired: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

const ownerSchema = z.object({
  ...cockpitBase,
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  eligibleLoops: z.array(eligibleLoopSchema),
  escalations: z.array(escalationSchema),
}).strict();

const fieldSchema = z.object({
  ...cockpitBase,
  role: z.literal("FIELD_WORKER"),
  eligibleLoops: z.array(z.never()).max(0),
  escalations: z.array(z.never()).max(0),
  financialDataVisible: z.literal(false),
}).strict();

const cockpitSchema = z.discriminatedUnion("role", [ownerSchema, fieldSchema]);

const FIELD_FORBIDDEN_KEYS = new Set([
  "acceptedClientPriceCents",
  "acceptedWorkerPayoutCents",
  "workerPayout",
  "workerId",
  "claimedById",
  "acceptanceId",
  "acceptedResultHash",
]);

function containsFieldLeak(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsFieldLeak);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) => FIELD_FORBIDDEN_KEYS.has(key) || containsFieldLeak(nested),
  );
}

export function parseMobileHumanEscalationCockpit(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { role?: unknown }).role === "FIELD_WORKER" &&
    containsFieldLeak(value)
  ) {
    throw new Error("MOBILE_HUMAN_SUPPORT_FIELD_LEAK_REFUSED");
  }
  return cockpitSchema.parse(value);
}

export type MobileHumanEscalationCockpit = ReturnType<
  typeof parseMobileHumanEscalationCockpit
>;

export const mobileHumanEscalationResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: identifier,
  action: z.enum(["PREPARE", "WITHDRAW"]),
  escalationId: identifier,
  state: stateSchema,
  replayed: z.boolean(),
  fundingRequired: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();
