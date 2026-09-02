import { z } from "zod";

const instant = z.string().datetime();
const owner = z.object({
  kind: z.enum(["MEMBER", "CONTACT"]),
  ownerId: z.string().min(1),
}).strict();
const status = z.enum([
  "SCHEDULED",
  "PREPARED_UNSENT",
  "READY_FOR_REVIEW",
  "AWAITING_RESPONSE",
  "ESCALATED",
  "DECISION_REQUIRED",
  "COMPLETED",
  "CANCELLED",
]);
const attempt = z.object({
  id: z.string().min(1),
  attemptNumber: z.number().int().positive(),
  status: z.enum(["PREPARED_UNSENT", "READY_FOR_REVIEW", "RESOLVED", "NO_RESPONSE", "CANCELLED"]),
  dueAt: instant,
  preparedAt: instant,
  resolvedAt: instant.nullable(),
}).strict();
const policy = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  retryIntervalMinutes: z.number().int().positive(),
  escalateAfterAttempts: z.number().int().min(1).max(10),
  escalationOwner: owner.nullable(),
}).strict();
const base = {
  schemaVersion: z.literal(1),
  generatedAt: instant,
  workspaceId: z.string().min(1),
};
const ownerQueue = z.object({
  ...base,
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  followUps: z.array(z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    projectCode: z.string().min(1),
    projectName: z.string().min(1),
    contactId: z.string().min(1),
    contactName: z.string().min(1),
    target: z.object({
      kind: z.enum(["RECEIVABLE", "OPEN_LOOP", "JOB", "CALENDAR"]),
      targetId: z.string().min(1),
      label: z.string().min(1),
    }).strict(),
    status,
    dueAt: instant,
    channel: z.enum(["INTERNAL", "SMS", "EMAIL", "HUMAN_CALL"]),
    body: z.string().min(1),
    owner: owner.extend({ displayName: z.string().min(1) }).strict(),
    nextDecision: z.string().min(1),
    policy,
    attempt: z.number().int().nonnegative(),
    escalationLevel: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    attempts: z.array(attempt),
  }).strict()),
}).strict();
const fieldQueue = z.object({
  ...base,
  role: z.literal("FIELD_WORKER"),
  followUps: z.array(z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    projectCode: z.string().min(1),
    projectName: z.string().min(1),
    contactName: z.string().min(1),
    targetKind: z.enum(["OPEN_LOOP", "JOB", "CALENDAR"]),
    status,
    dueAt: instant,
    nextDecision: z.string().min(1),
    attempt: z.number().int().nonnegative(),
  }).strict()),
}).strict();

const FORBIDDEN_FIELD_KEYS = new Set([
  "body",
  "policy",
  "receivableId",
  "invoiceReference",
  "amountMinor",
  "outstandingAmountMinor",
  "sourceRef",
  "beforeState",
  "afterState",
  "result",
]);

function rejectFieldLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_KEYS.has(key)) throw new Error("MOBILE_FOLLOW_UP_FIELD_LEAK_REFUSED");
    rejectFieldLeaks(child);
  }
}

export function parseMobileFollowUpQueue(value: unknown) {
  const role = z.object({ role: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]) }).passthrough().parse(value).role;
  if (role === "FIELD_WORKER") {
    rejectFieldLeaks(value);
    return fieldQueue.parse(value);
  }
  return ownerQueue.parse(value);
}

export type MobileFollowUpQueue = ReturnType<typeof parseMobileFollowUpQueue>;

const commandBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  followUpId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
};

export const mobileFollowUpCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...commandBase,
    action: z.literal("RECORD_OUTCOME"),
    attemptId: z.string().min(1),
    outcome: z.enum(["RESOLVED", "NO_RESPONSE"]),
    occurredAt: instant,
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("COMPLETE_FOLLOW_UP"),
    completedAt: instant,
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("CANCEL_FOLLOW_UP"),
    cancelledAt: instant,
    reason: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("REASSIGN_OWNER"),
    owner,
    nextDecision: z.string().trim().min(1).max(500),
  }).strict(),
]);

export const mobileFollowUpResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().min(1),
  workspaceId: z.string().min(1),
  action: z.string().min(1),
  followUpId: z.string().min(1).nullable(),
  attemptId: z.string().min(1).nullable(),
  status: status.nullable(),
  version: z.number().int().positive().nullable(),
  owner: owner.nullable(),
  nextDecision: z.string().min(1).nullable(),
  nextDueAt: instant.nullable(),
  disposition: z.enum(["CREATED", "UPDATED", "PREPARED_UNSENT", "READY_FOR_REVIEW", "CANCELLED", "ESCALATED", "DECISION_REQUIRED", "COMPLETED"]),
  applied: z.boolean(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export type MobileFollowUpCommand = z.infer<typeof mobileFollowUpCommandSchema>;
