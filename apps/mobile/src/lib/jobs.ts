import { z } from "zod";

const instant = z.string().datetime();
const assigneeKind = z.enum(["MEMBER", "CONTACT"]);

const conflictSchema = z.object({
  code: z.enum([
    "ASSIGNEE_REQUIRED",
    "ASSIGNMENT_OVERLAP",
    "RESOURCE_UNAVAILABLE",
    "OUTSIDE_AVAILABLE_WINDOW",
    "DEPENDENCY_NOT_COMPLETED",
    "DEPENDENCY_TIME_CONFLICT",
  ]),
  jobId: z.string().nullable(),
  relatedJobId: z.string().nullable(),
  assigneeKind: assigneeKind.nullable(),
  assigneeId: z.string().nullable(),
  detail: z.string().min(1),
}).strict();

const impactSchema = z.object({
  jobId: z.string().min(1),
  reason: z.literal("PREDECESSOR_ENDS_AFTER_SUCCESSOR_START"),
  delayMinutes: z.number().int().positive(),
}).strict();

const assignmentSchema = z.object({
  kind: assigneeKind,
  assigneeId: z.string().min(1),
  displayName: z.string().min(1),
  roleLabel: z.string().nullable(),
}).strict();

const dependencySchema = z.object({
  predecessorJobId: z.string().min(1),
  successorJobId: z.string().min(1),
}).strict();

const jobSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  projectCode: z.string().min(1),
  projectName: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  startsAt: instant,
  endsAt: instant,
  timezone: z.string().min(1),
  status: z.enum(["PROPOSED", "SCHEDULED", "BLOCKED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  priority: z.number().int(),
  version: z.number().int().positive(),
  assignments: z.array(assignmentSchema),
  dependencies: z.array(dependencySchema),
}).strict();

const base = {
  schemaVersion: z.literal(1),
  generatedAt: instant,
  workspaceId: z.string().min(1),
};

const ownerScheduleSchema = z.object({
  ...base,
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  jobs: z.array(jobSchema.extend({ conflicts: z.array(conflictSchema), impactedJobs: z.array(impactSchema) }).strict()),
}).strict();

const fieldScheduleSchema = z.object({
  ...base,
  role: z.literal("FIELD_WORKER"),
  jobs: z.array(jobSchema),
}).strict();

const FORBIDDEN_FIELD_KEYS = new Set([
  "financial",
  "amountMinor",
  "outstandingAmountMinor",
  "invoiceReference",
  "receivable",
  "payment",
  "sourceRef",
  "beforeState",
  "afterState",
  "result",
  "conflicts",
  "impactedJobs",
]);

function rejectFieldLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_KEYS.has(key)) throw new Error("MOBILE_JOB_FIELD_LEAK_REFUSED");
    rejectFieldLeaks(child);
  }
}

export function parseMobileJobSchedule(value: unknown) {
  const role = z.object({ role: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]) }).passthrough().parse(value).role;
  if (role === "FIELD_WORKER") {
    rejectFieldLeaks(value);
    return fieldScheduleSchema.parse(value);
  }
  return ownerScheduleSchema.parse(value);
}

export type MobileJobSchedule = ReturnType<typeof parseMobileJobSchedule>;

const commandBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
};

export const mobileJobCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("COMMIT_SCHEDULE"), jobId: z.string().min(1), expectedVersion: z.number().int().positive() }).strict(),
  z.object({ ...commandBase, action: z.literal("CHANGE_STATUS"), jobId: z.string().min(1), expectedVersion: z.number().int().positive(), status: z.enum(["PROPOSED", "BLOCKED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) }).strict(),
  z.object({ ...commandBase, action: z.literal("RESCHEDULE_JOB"), jobId: z.string().min(1), expectedVersion: z.number().int().positive(), startsAt: instant, endsAt: instant }).strict(),
]);

export const mobileJobCommandResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  action: z.string().min(1),
  jobId: z.string().nullable(),
  status: z.enum(["PROPOSED", "SCHEDULED", "BLOCKED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).nullable(),
  version: z.number().int().positive().nullable(),
  applied: z.boolean(),
  replayed: z.boolean(),
  conflicts: z.array(conflictSchema),
  impactedJobs: z.array(impactSchema),
  externalTransportPerformed: z.literal(false),
}).strict();

export type MobileJobCommand = z.infer<typeof mobileJobCommandSchema>;
