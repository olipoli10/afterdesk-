import { z } from "zod";

export const privacyDataClassSchema = z.enum([
  "IDENTITY",
  "COMMUNICATION",
  "PROJECT_STATE",
  "EVIDENCE",
  "FINANCIAL",
  "CONNECTOR_METADATA",
  "AUDIT",
  "HUMAN_WORK",
]);

export const privacyDeletionModeSchema = z.enum([
  "RETAIN",
  "TOMBSTONE_WHEN_ELIGIBLE",
  "EXTERNAL_DELETE_WHEN_AUTHORIZED",
]);

export const privacyPolicyStatusSchema = z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "REVOKED"]);
export const privacyDeletionTargetSchema = z.enum([
  "OPEN_LOOP_EVIDENCE",
  "VOICE_NOTE_REFERENCE",
  "MESSAGE_MEDIA_REFERENCE",
  "EMAIL_EVIDENCE_LINK",
]);
export const privacyDeletionStatusSchema = z.enum([
  "REQUESTED",
  "BLOCKED",
  "ELIGIBLE",
  "APPROVED",
  "TOMBSTONED",
  "EXTERNAL_DELETION_PENDING",
  "REFUSED",
  "REVOKED",
]);

const commandBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
};

export const privacyCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...commandBase,
    action: z.literal("CREATE_POLICY_DRAFT"),
    sourcePolicySetId: z.string().min(1).max(160).nullable(),
    expectedSourceStateVersion: z.number().int().positive().nullable(),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("SET_RETENTION_RULE"),
    policySetId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    dataClass: privacyDataClassSchema,
    retentionDays: z.number().int().positive().max(36_500),
    deletionMode: privacyDeletionModeSchema,
    holdBehavior: z.literal("BLOCK_WHILE_HELD"),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("ACTIVATE_POLICY_SET"),
    policySetId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    expectedPolicyHash: z.string().regex(/^[a-f0-9]{64}$/u),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("REVOKE_POLICY_SET"),
    policySetId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    expectedPolicyHash: z.string().regex(/^[a-f0-9]{64}$/u),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("PREPARE_EXPORT_MANIFEST"),
    expectedPolicySetId: z.string().min(1).max(160),
    expectedPolicySetVersion: z.number().int().positive(),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("REQUEST_DELETION"),
    expectedPolicySetId: z.string().min(1).max(160),
    expectedPolicySetVersion: z.number().int().positive(),
    targetType: privacyDeletionTargetSchema,
    targetId: z.string().min(1).max(200),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("APPROVE_DELETION"),
    deletionRequestId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    expectedEligibilityFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("REVOKE_DELETION"),
    deletionRequestId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
  }).strict(),
]);

const resultBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  replayed: z.boolean(),
  externalEffectCount: z.literal(0),
};

export const privacyPolicyResultSchema = z.object({
  ...resultBase,
  resultType: z.literal("POLICY_SET"),
  policySetId: z.string().min(1),
  policySetVersion: z.number().int().positive(),
  stateVersion: z.number().int().positive(),
  status: privacyPolicyStatusSchema,
  policyHash: z.string().regex(/^[a-f0-9]{64}$/u),
  ruleCount: z.number().int().nonnegative(),
}).strict();

const inventoryItemSchema = z.object({
  dataClass: privacyDataClassSchema,
  recordCount: z.number().int().nonnegative(),
  retentionDays: z.number().int().positive(),
  deletionMode: privacyDeletionModeSchema,
}).strict();

export const privacyExportResultSchema = z.object({
  ...resultBase,
  resultType: z.literal("EXPORT_MANIFEST"),
  policySetId: z.string().min(1),
  policySetVersion: z.number().int().positive(),
  manifestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  generatedAt: z.string().datetime(),
  inventory: z.array(inventoryItemSchema).length(8),
  totalRecordCount: z.number().int().nonnegative(),
  earliestRecordedAt: z.string().datetime().nullable(),
  latestRecordedAt: z.string().datetime().nullable(),
  excludedClasses: z.array(z.enum(["AUTHENTICATION_SECRET", "PROVIDER_TOKEN", "STORAGE_KEY", "HIDDEN_WORKER_ECONOMICS"])).length(4),
}).strict();

export const privacyDeletionResultSchema = z.object({
  ...resultBase,
  resultType: z.literal("DELETION_REQUEST"),
  deletionRequestId: z.string().min(1),
  targetType: privacyDeletionTargetSchema,
  targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  eligibilityFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  status: privacyDeletionStatusSchema,
  stateVersion: z.number().int().positive(),
  reasonCodes: z.array(z.string().regex(/^[A-Z0-9_]{2,160}$/u)).max(20),
  localTombstoneCreated: z.boolean(),
  externalDeletionState: z.enum(["NOT_REQUESTED", "EXTERNAL_DELETION_PENDING"]).nullable(),
}).strict();

export const privacyCommandResultSchema = z.discriminatedUnion("resultType", [
  privacyPolicyResultSchema,
  privacyExportResultSchema,
  privacyDeletionResultSchema,
]);

const privacyRuleProjectionSchema = z.object({
  dataClass: privacyDataClassSchema,
  retentionDays: z.number().int().positive(),
  deletionMode: privacyDeletionModeSchema,
  holdBehavior: z.literal("BLOCK_WHILE_HELD"),
}).strict();

const deletionProjectionSchema = z.object({
  id: z.string().min(1),
  targetType: privacyDeletionTargetSchema,
  targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  eligibilityFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  status: privacyDeletionStatusSchema,
  stateVersion: z.number().int().positive(),
  reasonCodes: z.array(z.string().min(1)),
  requestedAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  externalDeletionState: z.enum(["NOT_REQUESTED", "EXTERNAL_DELETION_PENDING"]).nullable(),
}).strict();

const deletionCandidateSchema = z.object({
  targetType: privacyDeletionTargetSchema,
  targetId: z.string().min(1),
  targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.string().datetime(),
  held: z.boolean(),
  retentionEligible: z.boolean(),
  activeRequestStatus: privacyDeletionStatusSchema.nullable(),
}).strict();

const ownerPrivacyCockpitSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  workspace: z.object({ id: z.string().min(1), name: z.string().min(1) }).strict(),
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  activePolicy: z.object({ id: z.string().min(1), version: z.number().int().positive(), stateVersion: z.number().int().positive(), status: z.literal("ACTIVE"), policyHash: z.string().regex(/^[a-f0-9]{64}$/u), rules: z.array(privacyRuleProjectionSchema).length(8) }).strict().nullable(),
  policyHistory: z.array(z.object({ id: z.string().min(1), version: z.number().int().positive(), stateVersion: z.number().int().positive(), status: privacyPolicyStatusSchema, policyHash: z.string().regex(/^[a-f0-9]{64}$/u), ruleCount: z.number().int().nonnegative() }).strict()),
  inventory: z.array(inventoryItemSchema).length(8),
  secretLifecycle: z.object({ absent: z.number().int().nonnegative(), opaqueReference: z.number().int().nonnegative(), revoked: z.number().int().nonnegative(), externallyRevokedVerified: z.literal(0) }).strict(),
  evidenceLifecycle: z.object({ active: z.number().int().nonnegative(), held: z.number().int().nonnegative(), retentionDue: z.number().int().nonnegative(), tombstoned: z.number().int().nonnegative(), externalDeletionPending: z.number().int().nonnegative() }).strict(),
  exportManifests: z.array(z.object({ commandId: z.string().uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/u), generatedAt: z.string().datetime(), totalRecordCount: z.number().int().nonnegative() }).strict()).max(20),
  deletionCandidates: z.array(deletionCandidateSchema).max(100),
  deletionRequests: z.array(deletionProjectionSchema).max(100),
  refusalCount: z.number().int().nonnegative(),
  externalEffectCount: z.literal(0),
}).strict();

const fieldPrivacyCockpitSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  workspace: z.object({ id: z.string().min(1), name: z.string().min(1) }).strict(),
  role: z.literal("FIELD_WORKER"),
  ownAccess: z.object({ membershipStatus: z.literal("ACTIVE"), accessClass: z.literal("PROJECT_ASSIGNED_ONLY"), canManagePrivacy: z.literal(false) }).strict(),
  externalEffectCount: z.literal(0),
}).strict();

export const privacyCockpitSchema = z.union([ownerPrivacyCockpitSchema, fieldPrivacyCockpitSchema]);

const FIELD_FORBIDDEN_KEYS = new Set([
  "inventory", "policyHistory", "activePolicy", "exportManifests", "deletionRequests",
  "secretLifecycle", "evidenceLifecycle", "retentionDays", "deletionMode", "policyHash",
  "credentialRef", "storageKey", "sourceRef", "targetId", "amountMinor", "workerPayout",
  "refusalCount", "reasonCodes", "eligibilityFingerprint", "targetFingerprint",
]);

export function rejectFieldPrivacyLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldPrivacyLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FIELD_FORBIDDEN_KEYS.has(key)) throw new Error("FIELD_PRIVACY_LEAK_REFUSED");
    rejectFieldPrivacyLeaks(child);
  }
}

export type PrivacyDataClass = z.infer<typeof privacyDataClassSchema>;
export type PrivacyDeletionMode = z.infer<typeof privacyDeletionModeSchema>;
export type PrivacyCommand = z.infer<typeof privacyCommandSchema>;
export type PrivacyCommandResult = z.infer<typeof privacyCommandResultSchema>;
export type PrivacyCockpit = z.infer<typeof privacyCockpitSchema>;
