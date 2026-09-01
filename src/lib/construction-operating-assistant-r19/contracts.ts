import { z } from "zod";

export const JOB_SCHEDULING_SCHEMA_VERSION = 1 as const;

const commandBase = {
  schemaVersion: z.literal(JOB_SCHEDULING_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
};

const expectedVersion = z.number().int().positive();
const instant = z.string().datetime();
const assigneeKind = z.enum(["MEMBER", "CONTACT"]);

export const jobSchedulingCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...commandBase,
    action: z.literal("CREATE_JOB"),
    projectId: z.string().min(1).max(160),
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(4_000).nullable().default(null),
    startsAt: instant,
    endsAt: instant,
    priority: z.number().int().min(-100).max(100).default(0),
    sourceRef: z.string().trim().min(1).max(500).nullable().default(null),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("ASSIGN_RESOURCE"),
    jobId: z.string().min(1).max(160),
    expectedVersion,
    assigneeKind,
    assigneeId: z.string().min(1).max(160),
    roleLabel: z.string().trim().min(1).max(160).nullable().default(null),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("ADD_DEPENDENCY"),
    jobId: z.string().min(1).max(160),
    expectedVersion,
    predecessorJobId: z.string().min(1).max(160),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("SET_AVAILABILITY"),
    assigneeKind,
    assigneeId: z.string().min(1).max(160),
    availabilityKind: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    startsAt: instant,
    endsAt: instant,
    sourceRef: z.string().trim().min(1).max(500).nullable().default(null),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("COMMIT_SCHEDULE"),
    jobId: z.string().min(1).max(160),
    expectedVersion,
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("RESCHEDULE_JOB"),
    jobId: z.string().min(1).max(160),
    expectedVersion,
    startsAt: instant,
    endsAt: instant,
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("CHANGE_STATUS"),
    jobId: z.string().min(1).max(160),
    expectedVersion,
    status: z.enum(["PROPOSED", "BLOCKED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  }).strict(),
]);

export type JobSchedulingCommand = z.infer<typeof jobSchedulingCommandSchema>;

export const jobConflictSchema = z.object({
  code: z.enum([
    "ASSIGNEE_REQUIRED",
    "ASSIGNMENT_OVERLAP",
    "RESOURCE_UNAVAILABLE",
    "OUTSIDE_AVAILABLE_WINDOW",
    "DEPENDENCY_NOT_COMPLETED",
    "DEPENDENCY_TIME_CONFLICT",
  ]),
  jobId: z.string().min(1).nullable(),
  relatedJobId: z.string().min(1).nullable(),
  assigneeKind: assigneeKind.nullable(),
  assigneeId: z.string().min(1).nullable(),
  detail: z.string().min(1),
}).strict();

export type JobConflict = z.infer<typeof jobConflictSchema>;

export const scheduleImpactSchema = z.object({
  jobId: z.string().min(1),
  reason: z.literal("PREDECESSOR_ENDS_AFTER_SUCCESSOR_START"),
  delayMinutes: z.number().int().positive(),
}).strict();

export type ScheduleImpact = z.infer<typeof scheduleImpactSchema>;

export const jobSchedulingResultSchema = z.object({
  schemaVersion: z.literal(JOB_SCHEDULING_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  action: z.string().min(1),
  jobId: z.string().min(1).nullable(),
  status: z.enum(["PROPOSED", "SCHEDULED", "BLOCKED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).nullable(),
  version: z.number().int().positive().nullable(),
  applied: z.boolean(),
  replayed: z.boolean(),
  conflicts: z.array(jobConflictSchema),
  impactedJobs: z.array(scheduleImpactSchema),
  externalTransportPerformed: z.literal(false),
}).strict();

export type JobSchedulingResult = z.infer<typeof jobSchedulingResultSchema>;

const assignmentProjectionSchema = z.object({
  kind: assigneeKind,
  assigneeId: z.string().min(1),
  displayName: z.string().min(1),
  roleLabel: z.string().nullable(),
}).strict();

const dependencyProjectionSchema = z.object({
  predecessorJobId: z.string().min(1),
  successorJobId: z.string().min(1),
}).strict();

const jobProjectionSchema = z.object({
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
  assignments: z.array(assignmentProjectionSchema),
  dependencies: z.array(dependencyProjectionSchema),
  conflicts: z.array(jobConflictSchema),
  impactedJobs: z.array(scheduleImpactSchema),
}).strict();

const projectionBase = {
  schemaVersion: z.literal(JOB_SCHEDULING_SCHEMA_VERSION),
  generatedAt: instant,
  workspaceId: z.string().min(1),
};

export const ownerJobScheduleProjectionSchema = z.object({
  ...projectionBase,
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  jobs: z.array(jobProjectionSchema),
}).strict();

export const fieldJobScheduleProjectionSchema = z.object({
  ...projectionBase,
  role: z.literal("FIELD_WORKER"),
  jobs: z.array(jobProjectionSchema.omit({ conflicts: true, impactedJobs: true })),
}).strict();

export const jobScheduleProjectionSchema = z.discriminatedUnion("role", [
  ownerJobScheduleProjectionSchema,
  fieldJobScheduleProjectionSchema,
]);

export type JobScheduleProjection = z.infer<typeof jobScheduleProjectionSchema>;

export const jobScheduleQuerySchema = z.object({
  workspaceId: z.string().min(1).max(160),
  projectId: z.string().min(1).max(160).optional(),
}).strict();
