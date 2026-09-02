import { z } from "zod";

export const FOLLOW_UP_ENGINE_SCHEMA_VERSION = 1 as const;

const instant = z.string().datetime();
const ownerKind = z.enum(["MEMBER", "CONTACT"]);
const ownerSchema = z.object({
  kind: ownerKind,
  ownerId: z.string().min(1).max(160),
}).strict();

export const managedFollowUpPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  retryIntervalMinutes: z.number().int().min(1).max(43_200),
  escalateAfterAttempts: z.number().int().min(1).max(10),
  escalationOwner: ownerSchema.nullable(),
}).strict().superRefine((policy, context) => {
  if (policy.escalateAfterAttempts > policy.maxAttempts) {
    context.addIssue({
      code: "custom",
      path: ["escalateAfterAttempts"],
      message: "Escalation cannot occur after the final attempt.",
    });
  }
});

export type ManagedFollowUpPolicy = z.infer<typeof managedFollowUpPolicySchema>;

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("RECEIVABLE"), receivableId: z.string().min(1).max(160) }).strict(),
  z.object({ kind: z.literal("OPEN_LOOP"), openLoopId: z.string().min(1).max(160) }).strict(),
  z.object({ kind: z.literal("JOB"), jobId: z.string().min(1).max(160) }).strict(),
  z.object({ kind: z.literal("CALENDAR"), calendarItemId: z.string().min(1).max(160) }).strict(),
]);

const commandBase = {
  schemaVersion: z.literal(FOLLOW_UP_ENGINE_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
};

export const followUpEngineCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...commandBase,
    action: z.literal("CREATE_FOLLOW_UP"),
    projectId: z.string().min(1).max(160),
    contactId: z.string().min(1).max(160),
    target: targetSchema,
    dueAt: instant,
    channel: z.enum(["INTERNAL", "SMS", "EMAIL", "HUMAN_CALL"]),
    body: z.string().trim().min(1).max(1_600),
    owner: ownerSchema,
    nextDecision: z.string().trim().min(1).max(500),
    policy: managedFollowUpPolicySchema,
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("REASSIGN_OWNER"),
    followUpId: z.string().min(1).max(160),
    expectedVersion: z.number().int().positive(),
    owner: ownerSchema,
    nextDecision: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("RECORD_OUTCOME"),
    followUpId: z.string().min(1).max(160),
    expectedVersion: z.number().int().positive(),
    attemptId: z.string().min(1).max(160),
    outcome: z.enum(["RESOLVED", "NO_RESPONSE"]),
    occurredAt: instant,
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("COMPLETE_FOLLOW_UP"),
    followUpId: z.string().min(1).max(160),
    expectedVersion: z.number().int().positive(),
    completedAt: instant,
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("CANCEL_FOLLOW_UP"),
    followUpId: z.string().min(1).max(160),
    expectedVersion: z.number().int().positive(),
    cancelledAt: instant,
    reason: z.string().trim().min(1).max(500),
  }).strict(),
]);

export type FollowUpEngineCommand = z.infer<typeof followUpEngineCommandSchema>;

export const followUpStatusSchema = z.enum([
  "SCHEDULED",
  "PREPARED_UNSENT",
  "READY_FOR_REVIEW",
  "AWAITING_RESPONSE",
  "ESCALATED",
  "DECISION_REQUIRED",
  "COMPLETED",
  "CANCELLED",
]);

export const followUpEngineResultSchema = z.object({
  schemaVersion: z.literal(FOLLOW_UP_ENGINE_SCHEMA_VERSION),
  commandId: z.string().min(1),
  workspaceId: z.string().min(1),
  action: z.string().min(1),
  followUpId: z.string().min(1).nullable(),
  attemptId: z.string().min(1).nullable(),
  status: followUpStatusSchema.nullable(),
  version: z.number().int().positive().nullable(),
  owner: ownerSchema.nullable(),
  nextDecision: z.string().min(1).nullable(),
  nextDueAt: instant.nullable(),
  disposition: z.enum([
    "CREATED",
    "UPDATED",
    "PREPARED_UNSENT",
    "READY_FOR_REVIEW",
    "CANCELLED",
    "ESCALATED",
    "DECISION_REQUIRED",
    "COMPLETED",
  ]),
  applied: z.boolean(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export type FollowUpEngineResult = z.infer<typeof followUpEngineResultSchema>;

const targetProjectionSchema = z.object({
  kind: z.enum(["RECEIVABLE", "OPEN_LOOP", "JOB", "CALENDAR"]),
  targetId: z.string().min(1),
  label: z.string().min(1),
}).strict();

const attemptProjectionSchema = z.object({
  id: z.string().min(1),
  attemptNumber: z.number().int().positive(),
  status: z.enum(["PREPARED_UNSENT", "READY_FOR_REVIEW", "RESOLVED", "NO_RESPONSE", "CANCELLED"]),
  dueAt: instant,
  preparedAt: instant,
  resolvedAt: instant.nullable(),
}).strict();

const ownerProjectionSchema = ownerSchema.extend({ displayName: z.string().min(1) }).strict();

const ownerFollowUpSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  projectCode: z.string().min(1),
  projectName: z.string().min(1),
  contactId: z.string().min(1),
  contactName: z.string().min(1),
  target: targetProjectionSchema,
  status: followUpStatusSchema,
  dueAt: instant,
  channel: z.enum(["INTERNAL", "SMS", "EMAIL", "HUMAN_CALL"]),
  body: z.string().min(1),
  owner: ownerProjectionSchema,
  nextDecision: z.string().min(1),
  policy: managedFollowUpPolicySchema,
  attempt: z.number().int().nonnegative(),
  escalationLevel: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  attempts: z.array(attemptProjectionSchema),
}).strict();

const fieldFollowUpSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  projectCode: z.string().min(1),
  projectName: z.string().min(1),
  contactName: z.string().min(1),
  targetKind: z.enum(["OPEN_LOOP", "JOB", "CALENDAR"]),
  status: followUpStatusSchema,
  dueAt: instant,
  nextDecision: z.string().min(1),
  attempt: z.number().int().nonnegative(),
}).strict();

const projectionBase = {
  schemaVersion: z.literal(FOLLOW_UP_ENGINE_SCHEMA_VERSION),
  generatedAt: instant,
  workspaceId: z.string().min(1),
};

export const ownerFollowUpQueueSchema = z.object({
  ...projectionBase,
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  followUps: z.array(ownerFollowUpSchema),
}).strict();

export const fieldFollowUpQueueSchema = z.object({
  ...projectionBase,
  role: z.literal("FIELD_WORKER"),
  followUps: z.array(fieldFollowUpSchema),
}).strict();

export const followUpQueueSchema = z.discriminatedUnion("role", [
  ownerFollowUpQueueSchema,
  fieldFollowUpQueueSchema,
]);

export type FollowUpQueue = z.infer<typeof followUpQueueSchema>;

export const followUpQueueQuerySchema = z.object({
  workspaceId: z.string().min(1).max(160),
  projectId: z.string().min(1).max(160).optional(),
}).strict();
