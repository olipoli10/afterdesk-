import { z } from "zod";

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const dataClass = z.enum(["IDENTITY", "COMMUNICATION", "PROJECT_STATE", "EVIDENCE", "FINANCIAL", "CONNECTOR_METADATA", "AUDIT", "HUMAN_WORK"]);
const deletionMode = z.enum(["RETAIN", "TOMBSTONE_WHEN_ELIGIBLE", "EXTERNAL_DELETE_WHEN_AUTHORIZED"]);
const policyStatus = z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "REVOKED"]);
const targetType = z.enum(["OPEN_LOOP_EVIDENCE", "VOICE_NOTE_REFERENCE", "MESSAGE_MEDIA_REFERENCE", "EMAIL_EVIDENCE_LINK"]);
const deletionStatus = z.enum(["REQUESTED", "BLOCKED", "ELIGIBLE", "APPROVED", "TOMBSTONED", "EXTERNAL_DELETION_PENDING", "REFUSED", "REVOKED"]);
const commandBase = { schemaVersion: z.literal(1), commandId: z.string().uuid(), workspaceId: id };

export const mobilePrivacyCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("CREATE_POLICY_DRAFT"), sourcePolicySetId: id.nullable(), expectedSourceStateVersion: z.number().int().positive().nullable() }).strict(),
  z.object({ ...commandBase, action: z.literal("SET_RETENTION_RULE"), policySetId: id, expectedStateVersion: z.number().int().positive(), dataClass, retentionDays: z.number().int().positive().max(36_500), deletionMode, holdBehavior: z.literal("BLOCK_WHILE_HELD") }).strict(),
  z.object({ ...commandBase, action: z.literal("ACTIVATE_POLICY_SET"), policySetId: id, expectedStateVersion: z.number().int().positive(), expectedPolicyHash: hash }).strict(),
  z.object({ ...commandBase, action: z.literal("REVOKE_POLICY_SET"), policySetId: id, expectedStateVersion: z.number().int().positive(), expectedPolicyHash: hash }).strict(),
  z.object({ ...commandBase, action: z.literal("PREPARE_EXPORT_MANIFEST"), expectedPolicySetId: id, expectedPolicySetVersion: z.number().int().positive() }).strict(),
  z.object({ ...commandBase, action: z.literal("REQUEST_DELETION"), expectedPolicySetId: id, expectedPolicySetVersion: z.number().int().positive(), targetType, targetId: id }).strict(),
  z.object({ ...commandBase, action: z.literal("APPROVE_DELETION"), deletionRequestId: id, expectedStateVersion: z.number().int().positive(), expectedEligibilityFingerprint: hash }).strict(),
  z.object({ ...commandBase, action: z.literal("REVOKE_DELETION"), deletionRequestId: id, expectedStateVersion: z.number().int().positive() }).strict(),
]);

const resultBase = { schemaVersion: z.literal(1), commandId: z.string().uuid(), workspaceId: id, replayed: z.boolean(), externalEffectCount: z.literal(0) };
const policyResult = z.object({ ...resultBase, resultType: z.literal("POLICY_SET"), policySetId: id, policySetVersion: z.number().int().positive(), stateVersion: z.number().int().positive(), status: policyStatus, policyHash: hash, ruleCount: z.number().int().nonnegative() }).strict();
const exportResult = z.object({ ...resultBase, resultType: z.literal("EXPORT_MANIFEST"), policySetId: id, policySetVersion: z.number().int().positive(), manifestFingerprint: hash, generatedAt: z.string().datetime(), inventory: z.array(z.object({ dataClass, recordCount: z.number().int().nonnegative(), retentionDays: z.number().int().positive(), deletionMode }).strict()).length(8), totalRecordCount: z.number().int().nonnegative(), earliestRecordedAt: z.string().datetime().nullable(), latestRecordedAt: z.string().datetime().nullable(), excludedClasses: z.array(z.enum(["AUTHENTICATION_SECRET", "PROVIDER_TOKEN", "STORAGE_KEY", "HIDDEN_WORKER_ECONOMICS"])).length(4) }).strict();
const deletionResult = z.object({ ...resultBase, resultType: z.literal("DELETION_REQUEST"), deletionRequestId: id, targetType, targetFingerprint: hash, eligibilityFingerprint: hash, status: deletionStatus, stateVersion: z.number().int().positive(), reasonCodes: z.array(z.string()), localTombstoneCreated: z.boolean(), externalDeletionState: z.enum(["NOT_REQUESTED", "EXTERNAL_DELETION_PENDING"]).nullable() }).strict();
export const mobilePrivacyResultSchema = z.discriminatedUnion("resultType", [policyResult, exportResult, deletionResult]);

const rule = z.object({ dataClass, retentionDays: z.number().int().positive(), deletionMode, holdBehavior: z.literal("BLOCK_WHILE_HELD") }).strict();
const inventoryItem = z.object({ dataClass, recordCount: z.number().int().nonnegative(), retentionDays: z.number().int().positive(), deletionMode }).strict();
const ownerCockpit = z.object({
  schemaVersion: z.literal(1), generatedAt: z.string().datetime(), workspace: z.object({ id, name: z.string().min(1) }).strict(), role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  activePolicy: z.object({ id, version: z.number().int().positive(), stateVersion: z.number().int().positive(), status: z.literal("ACTIVE"), policyHash: hash, rules: z.array(rule).length(8) }).strict().nullable(),
  policyHistory: z.array(z.object({ id, version: z.number().int().positive(), stateVersion: z.number().int().positive(), status: policyStatus, policyHash: hash, ruleCount: z.number().int().nonnegative() }).strict()),
  inventory: z.array(inventoryItem).length(8),
  secretLifecycle: z.object({ absent: z.number().int().nonnegative(), opaqueReference: z.number().int().nonnegative(), revoked: z.number().int().nonnegative(), externallyRevokedVerified: z.literal(0) }).strict(),
  evidenceLifecycle: z.object({ active: z.number().int().nonnegative(), held: z.number().int().nonnegative(), retentionDue: z.number().int().nonnegative(), tombstoned: z.number().int().nonnegative(), externalDeletionPending: z.number().int().nonnegative() }).strict(),
  exportManifests: z.array(z.object({ commandId: z.string().uuid(), fingerprint: hash, generatedAt: z.string().datetime(), totalRecordCount: z.number().int().nonnegative() }).strict()).max(20),
  deletionCandidates: z.array(z.object({ targetType, targetId: id, targetFingerprint: hash, createdAt: z.string().datetime(), held: z.boolean(), retentionEligible: z.boolean(), activeRequestStatus: deletionStatus.nullable() }).strict()).max(100),
  deletionRequests: z.array(z.object({ id, targetType, targetFingerprint: hash, eligibilityFingerprint: hash, status: deletionStatus, stateVersion: z.number().int().positive(), reasonCodes: z.array(z.string()), requestedAt: z.string().datetime(), approvedAt: z.string().datetime().nullable(), externalDeletionState: z.enum(["NOT_REQUESTED", "EXTERNAL_DELETION_PENDING"]).nullable() }).strict()).max(100),
  refusalCount: z.number().int().nonnegative(), externalEffectCount: z.literal(0),
}).strict();
const fieldCockpit = z.object({ schemaVersion: z.literal(1), generatedAt: z.string().datetime(), workspace: z.object({ id, name: z.string().min(1) }).strict(), role: z.literal("FIELD_WORKER"), ownAccess: z.object({ membershipStatus: z.literal("ACTIVE"), accessClass: z.literal("PROJECT_ASSIGNED_ONLY"), canManagePrivacy: z.literal(false) }).strict(), externalEffectCount: z.literal(0) }).strict();
export const mobilePrivacyCockpitSchema = z.union([ownerCockpit, fieldCockpit]);

const FORBIDDEN_FIELD_KEYS = new Set(["inventory", "activePolicy", "policyHistory", "deletionCandidates", "deletionRequests", "targetId", "targetFingerprint", "eligibilityFingerprint", "retentionDays", "deletionMode", "credentialRef", "storageKey", "sourceRef", "amountMinor"]);
function rejectFieldLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_KEYS.has(key)) throw new Error("MOBILE_PRIVACY_FIELD_LEAK_REFUSED");
    rejectFieldLeaks(child);
  }
}

export function parseMobilePrivacyCockpit(value: unknown) {
  const parsed = mobilePrivacyCockpitSchema.parse(value);
  if (parsed.role === "FIELD_WORKER") rejectFieldLeaks(parsed);
  return parsed;
}

export type MobilePrivacyCockpit = ReturnType<typeof parseMobilePrivacyCockpit>;
export type MobilePrivacyCommand = z.infer<typeof mobilePrivacyCommandSchema>;
