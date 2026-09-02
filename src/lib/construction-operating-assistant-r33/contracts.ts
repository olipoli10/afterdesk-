import { z } from "zod";

export const GOLDEN_WORKFLOW_SCHEMA_VERSION = 1 as const;
export const GOLDEN_WORKFLOW_REGISTRY_VERSION = 1 as const;

const id = z.string().min(1).max(200);
const instant = z.string().datetime();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);

export const goldenWorkflowRoleSchema = z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]);
export const goldenWorkflowLocaleSchema = z.enum(["fr-CA", "en-CA"]);
export const goldenWorkflowStepSchema = z.enum([
  "GET_STARTED",
  "CAPTURE_WORK",
  "PLAN_WORK",
  "COLLECT_PROOF",
  "FOLLOW_UP",
  "READY_TO_INVOICE",
  "APPROVE_ACTION",
  "REVIEW_HISTORY",
]);
export const goldenWorkflowStepStatusSchema = z.enum(["NOT_STARTED", "CURRENT", "BLOCKED", "COMPLETE"]);
export const goldenWorkflowRouteSchema = z.enum([
  "ONBOARDING",
  "ASSISTANT",
  "PROJECTS",
  "JOBS",
  "CALENDAR",
  "EVIDENCE",
  "FOLLOW_UPS",
  "RECEIVABLES",
  "ACTIONS",
  "TIMELINE",
  "PROVENANCE",
  "HUMAN_SUPPORT",
  "COCKPIT",
]);
export const goldenWorkflowBlockerCodeSchema = z.enum([
  "PROJECT_REQUIRED",
  "CONTACT_REQUIRED",
  "ASSIGNMENT_REQUIRED",
  "WORK_INTENT_REQUIRED",
  "SCHEDULE_REQUIRED",
  "EVIDENCE_REQUIRED",
  "FOLLOW_UP_REQUIRED",
  "INVOICE_EVIDENCE_REQUIRED",
  "PREPARED_ACTION_REQUIRED",
  "PROVIDER_DISABLED_LOCAL",
]);
export const goldenWorkflowActionCodeSchema = z.enum([
  "START_ONBOARDING",
  "OPEN_ASSISTANT",
  "OPEN_PROJECTS",
  "PLAN_JOB",
  "OPEN_CALENDAR",
  "ADD_EVIDENCE",
  "PLAN_FOLLOW_UP",
  "REVIEW_INVOICE_READINESS",
  "REVIEW_PREPARED_ACTION",
  "REVIEW_HISTORY",
  "VIEW_ASSIGNMENTS",
  "REQUEST_HUMAN_SUPPORT",
]);
export const externalCapabilityCodeSchema = z.enum(["CALENDAR_SYNC", "SMS_MMS", "VOICE_CALL", "EMAIL", "ACCOUNTING"]);

const actionSchema = z.object({
  code: goldenWorkflowActionCodeSchema,
  route: goldenWorkflowRouteSchema,
  copyKey: z.string().min(1).max(120),
}).strict();

const blockerSchema = z.object({
  code: goldenWorkflowBlockerCodeSchema,
  severity: z.enum(["INFO", "ACTION_REQUIRED"]),
  copyKey: z.string().min(1).max(120),
  resolutionRoute: goldenWorkflowRouteSchema,
}).strict();

const stepProjectionSchema = z.object({
  step: goldenWorkflowStepSchema,
  order: z.number().int().min(1).max(8),
  status: goldenWorkflowStepStatusSchema,
  titleKey: z.string().min(1).max(120),
  bodyKey: z.string().min(1).max(120),
  blockers: z.array(blockerSchema).max(4),
  route: goldenWorkflowRouteSchema,
}).strict();

const workspaceSchema = z.object({
  id,
  name: z.string().min(1).max(160),
  timezone: z.string().min(1).max(120),
  locale: goldenWorkflowLocaleSchema,
  currency: z.literal("CAD"),
}).strict();

const projectSchema = z.object({ id, code: z.string().min(1).max(40), name: z.string().min(1).max(160) }).strict();
const capabilitySchema = z.object({ code: externalCapabilityCodeSchema, status: z.literal("UNAVAILABLE"), reasonCode: z.literal("PROVIDER_DISABLED_LOCAL") }).strict();

const common = {
  schemaVersion: z.literal(GOLDEN_WORKFLOW_SCHEMA_VERSION),
  registryVersion: z.literal(GOLDEN_WORKFLOW_REGISTRY_VERSION),
  generatedAt: instant,
  workspace: workspaceSchema,
  project: projectSchema.nullable(),
  stateFingerprint: hash,
  steps: z.array(stepProjectionSchema).min(1).max(8),
  completedCount: z.number().int().min(0).max(8),
  totalCount: z.number().int().min(1).max(8),
  currentStep: goldenWorkflowStepSchema,
  primaryAction: actionSchema,
  secondaryActions: z.array(actionSchema).max(3),
  externalCapabilities: z.array(capabilitySchema).length(5),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
};

export const ownerGoldenWorkflowProjectionSchema = z.object({
  ...common,
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  activeExceptionCount: z.number().int().nonnegative(),
  pendingApprovalCount: z.number().int().nonnegative(),
}).strict();

export const fieldGoldenWorkflowProjectionSchema = z.object({
  ...common,
  role: z.literal("FIELD_WORKER"),
  assignedProjectCount: z.number().int().nonnegative(),
}).strict();

export const goldenWorkflowProjectionSchema = z.union([
  ownerGoldenWorkflowProjectionSchema,
  fieldGoldenWorkflowProjectionSchema,
]);

const FIELD_FORBIDDEN_KEYS = new Set([
  "activeExceptionCount",
  "pendingApprovalCount",
  "amountMinor",
  "currencyMinor",
  "receivable",
  "invoiceReference",
  "contact",
  "import",
  "policy",
  "secret",
]);

export function rejectFieldGoldenWorkflowLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldGoldenWorkflowLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FIELD_FORBIDDEN_KEYS.has(key)) throw new Error("GOLDEN_WORKFLOW_FIELD_PROJECTION_LEAK_REFUSED");
    rejectFieldGoldenWorkflowLeaks(child);
  }
}

export function parseGoldenWorkflowProjection(value: unknown) {
  const header = z.object({ role: goldenWorkflowRoleSchema }).passthrough().parse(value);
  if (header.role === "FIELD_WORKER") rejectFieldGoldenWorkflowLeaks(value);
  return goldenWorkflowProjectionSchema.parse(value);
}

export type GoldenWorkflowProjection = z.infer<typeof goldenWorkflowProjectionSchema>;
export type GoldenWorkflowStep = z.infer<typeof goldenWorkflowStepSchema>;
export type GoldenWorkflowRoute = z.infer<typeof goldenWorkflowRouteSchema>;
export type GoldenWorkflowLocale = z.infer<typeof goldenWorkflowLocaleSchema>;
export type GoldenWorkflowActionCode = z.infer<typeof goldenWorkflowActionCodeSchema>;
export type GoldenWorkflowBlockerCode = z.infer<typeof goldenWorkflowBlockerCodeSchema>;
