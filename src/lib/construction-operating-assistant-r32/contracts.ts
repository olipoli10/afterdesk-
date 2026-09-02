import { z } from "zod";

export const ONBOARDING_SCHEMA_VERSION = 1 as const;
export const ONBOARDING_IMPORT_REGISTRY_VERSION = 1 as const;
export const ONBOARDING_IMPORT_PARSER_VERSION = "r32-csv-v1" as const;
export const ONBOARDING_IMPORT_MAX_BYTES = 1_048_576 as const;
export const ONBOARDING_IMPORT_MAX_ROWS = 500 as const;

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.string().datetime();

export const onboardingStageSchema = z.enum([
  "COMPANY",
  "FIRST_PROJECT",
  "FIRST_CONTACT",
  "OPTIONAL_IMPORT",
  "READY",
  "COMPLETE",
]);
export const onboardingStatusSchema = z.enum(["ACTIVE", "COMPLETED"]);
export const onboardingImportKindSchema = z.enum(["CONTACTS_CSV", "PROJECTS_CSV"]);
export const onboardingImportStatusSchema = z.enum(["PREVIEW", "DECISIONS_REQUIRED", "READY_TO_COMMIT", "COMMITTED", "DISCARDED", "REFUSED"]);
export const onboardingImportRowStateSchema = z.enum(["READY", "DUPLICATE", "CONFLICT", "INVALID"]);
export const onboardingImportDecisionActionSchema = z.enum(["SKIP", "CREATE_NEW", "USE_EXISTING"]);
export const onboardingImportReasonCodeSchema = z.enum([
  "MISSING_REQUIRED_VALUE",
  "FIELD_TOO_LONG",
  "INVALID_PHONE",
  "INVALID_EMAIL",
  "PROJECT_NOT_FOUND",
  "PROJECT_LINK_AMBIGUOUS",
  "PROJECT_CODE_DUPLICATE",
  "CONTACT_IDENTITY_DUPLICATE",
  "CONTACT_IDENTITY_AMBIGUOUS",
]);

const commandBase = {
  schemaVersion: z.literal(ONBOARDING_SCHEMA_VERSION),
  commandId: z.string().uuid(),
};
const workspaceCommandBase = { ...commandBase, workspaceId: id };

const initializeWorkspaceCommand = z.object({
  ...commandBase,
  action: z.literal("INITIALIZE_WORKSPACE"),
  name: z.string().trim().min(1).max(160),
  timezone: z.string().trim().min(1).max(120),
  locale: z.enum(["fr-CA", "en-CA"]),
}).strict();

const createFirstProjectCommand = z.object({
  ...workspaceCommandBase,
  action: z.literal("CREATE_FIRST_PROJECT"),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(300).optional(),
}).strict();

const createFirstContactCommand = z.object({
  ...workspaceCommandBase,
  action: z.literal("CREATE_FIRST_CONTACT"),
  projectId: id.optional(),
  displayName: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(254).optional(),
}).strict();

const previewImportCommand = z.object({
  ...workspaceCommandBase,
  action: z.literal("PREVIEW_IMPORT"),
  kind: onboardingImportKindSchema,
  csvText: z.string().min(1).max(ONBOARDING_IMPORT_MAX_BYTES),
}).strict();

const decideImportRowCommand = z.object({
  ...workspaceCommandBase,
  action: z.literal("DECIDE_IMPORT_ROW"),
  batchId: id,
  rowId: id,
  expectedBatchVersion: z.number().int().positive(),
  decision: onboardingImportDecisionActionSchema,
  matchedCanonicalId: id.optional(),
}).strict().superRefine((value, context) => {
  if ((value.decision === "USE_EXISTING") !== Boolean(value.matchedCanonicalId)) {
    context.addIssue({ code: "custom", path: ["matchedCanonicalId"], message: "USE_EXISTING requires exactly one server-issued candidate." });
  }
});

const batchCommandBase = {
  ...workspaceCommandBase,
  batchId: id,
  expectedBatchVersion: z.number().int().positive(),
  sourceHash: hash,
  previewFingerprint: hash,
};

export const onboardingCommandSchema = z.discriminatedUnion("action", [
  initializeWorkspaceCommand,
  createFirstProjectCommand,
  createFirstContactCommand,
  previewImportCommand,
  decideImportRowCommand,
  z.object({ ...batchCommandBase, action: z.literal("COMMIT_IMPORT") }).strict(),
  z.object({ ...batchCommandBase, action: z.literal("DISCARD_IMPORT") }).strict(),
  z.object({ ...workspaceCommandBase, action: z.literal("COMPLETE_ONBOARDING"), expectedSessionVersion: z.number().int().positive() }).strict(),
]);
export type OnboardingCommand = z.infer<typeof onboardingCommandSchema>;

const resultBase = {
  schemaVersion: z.literal(ONBOARDING_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  replayed: z.boolean(),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
};

export const onboardingCommandResultSchema = z.discriminatedUnion("resultType", [
  z.object({ ...resultBase, resultType: z.literal("WORKSPACE"), workspaceId: id, created: z.boolean(), sessionId: id, sessionVersion: z.number().int().positive(), nextAction: z.string().min(1).max(80) }).strict(),
  z.object({ ...resultBase, resultType: z.literal("PROJECT"), workspaceId: id, projectId: id, created: z.boolean(), sessionVersion: z.number().int().positive(), nextAction: z.string().min(1).max(80) }).strict(),
  z.object({ ...resultBase, resultType: z.literal("CONTACT"), workspaceId: id, contactId: id, created: z.boolean(), sessionVersion: z.number().int().positive(), firstValueReady: z.boolean(), nextAction: z.string().min(1).max(80) }).strict(),
  z.object({ ...resultBase, resultType: z.literal("IMPORT_PREVIEW"), workspaceId: id, batchId: id, batchVersion: z.number().int().positive(), sourceHash: hash, previewFingerprint: hash, rowCount: z.number().int().min(0).max(ONBOARDING_IMPORT_MAX_ROWS), counts: z.object({ ready: z.number().int().nonnegative(), duplicate: z.number().int().nonnegative(), conflict: z.number().int().nonnegative(), invalid: z.number().int().nonnegative() }).strict(), nextAction: z.string().min(1).max(80) }).strict(),
  z.object({ ...resultBase, resultType: z.literal("IMPORT_DECISION"), workspaceId: id, batchId: id, rowId: id, batchVersion: z.number().int().positive(), decision: onboardingImportDecisionActionSchema, nextAction: z.string().min(1).max(80) }).strict(),
  z.object({ ...resultBase, resultType: z.literal("IMPORT_COMMIT"), workspaceId: id, batchId: id, batchVersion: z.number().int().positive(), status: z.enum(["COMMITTED", "DISCARDED"]), createdProjectIds: z.array(id).max(ONBOARDING_IMPORT_MAX_ROWS), createdContactIds: z.array(id).max(ONBOARDING_IMPORT_MAX_ROWS), reusedCanonicalIds: z.array(id).max(ONBOARDING_IMPORT_MAX_ROWS), skippedCount: z.number().int().nonnegative(), nextAction: z.string().min(1).max(80) }).strict(),
  z.object({ ...resultBase, resultType: z.literal("ONBOARDING"), workspaceId: id, sessionId: id, sessionVersion: z.number().int().positive(), status: onboardingStatusSchema, firstValueReady: z.boolean(), nextAction: z.string().min(1).max(80) }).strict(),
]);
export type OnboardingCommandResult = z.infer<typeof onboardingCommandResultSchema>;

const projectSummary = z.object({ id, code: z.string().min(1), name: z.string().min(1) }).strict();
const contactSummary = z.object({ id, displayName: z.string().min(1), roleLabel: z.string().nullable(), projectId: id.nullable() }).strict();
const batchSummary = z.object({
  id, kind: onboardingImportKindSchema, status: onboardingImportStatusSchema,
  stateVersion: z.number().int().positive(), sourceHash: hash, previewFingerprint: hash,
  rowCount: z.number().int().min(0).max(ONBOARDING_IMPORT_MAX_ROWS),
  counts: z.object({ ready: z.number().int().nonnegative(), duplicate: z.number().int().nonnegative(), conflict: z.number().int().nonnegative(), invalid: z.number().int().nonnegative() }).strict(),
  rows: z.array(z.object({
    id, rowNumber: z.number().int().positive(), state: onboardingImportRowStateSchema,
    reasonCodes: z.array(onboardingImportReasonCodeSchema),
    normalizedProposal: z.record(z.string(), z.string().nullable()),
    candidateCanonicalIds: z.array(id),
    decision: z.object({ action: onboardingImportDecisionActionSchema, matchedCanonicalId: id.nullable() }).strict().nullable(),
  }).strict()).max(ONBOARDING_IMPORT_MAX_ROWS),
}).strict();

const managerCockpitSchema = z.object({
  schemaVersion: z.literal(ONBOARDING_SCHEMA_VERSION), generatedAt: instant,
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  session: z.object({ id, workspaceId: id.nullable(), stage: onboardingStageSchema, status: onboardingStatusSchema, stateVersion: z.number().int().positive(), firstValueReady: z.boolean(), nextAction: z.string().min(1).max(80) }).strict().nullable(),
  workspace: z.object({ id, name: z.string().min(1), timezone: z.string().min(1), locale: z.enum(["fr-CA", "en-CA"]) }).strict().nullable(),
  projects: z.array(projectSummary), contacts: z.array(contactSummary), activeBatch: batchSummary.nullable(),
  providerObserved: z.literal(false), externalEffectCount: z.literal(0),
}).strict();

const fieldCockpitSchema = z.object({
  schemaVersion: z.literal(ONBOARDING_SCHEMA_VERSION), generatedAt: instant,
  role: z.literal("FIELD_WORKER"), workspace: z.object({ id, name: z.string().min(1) }).strict(),
  assignedProjects: z.array(projectSummary), nextAction: z.string().min(1).max(80),
  providerObserved: z.literal(false), externalEffectCount: z.literal(0),
}).strict();

export const onboardingCockpitSchema = z.discriminatedUnion("role", [managerCockpitSchema, fieldCockpitSchema]);
export type OnboardingCockpit = z.infer<typeof onboardingCockpitSchema>;

const FIELD_FORBIDDEN = new Set(["activeBatch", "contacts", "sourceHash", "previewFingerprint", "counts", "phone", "email", "normalizedPhone", "normalizedEmail", "duplicateCandidates", "rowCount"]);
export function rejectFieldOnboardingLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldOnboardingLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FIELD_FORBIDDEN.has(key)) throw new Error("ONBOARDING_FIELD_PROJECTION_LEAK_REFUSED");
    rejectFieldOnboardingLeaks(child);
  }
}
