import { z } from "zod";

export const AUTHORITY_POLICY_SCHEMA_VERSION = 1 as const;
export const AUTHORITY_ACTION_VERSION = 1 as const;

export const authorityOutcomeSchema = z.enum([
  "AUTOMATIC_INTERNAL",
  "APPROVAL_REQUIRED",
  "PROHIBITED",
]);

export const authorityActionKeySchema = z.enum([
  "INTERNAL_REMINDER_CREATE",
  "PROJECT_FACT_CLASSIFY",
  "PROJECT_SCHEDULE_UPDATE",
  "SEND_SMS",
  "SEND_EMAIL",
  "CALENDAR_WRITE",
  "ACCOUNTING_RECONCILE",
  "ACCOUNTING_POST",
  "PAYMENT_INITIATE",
  "CONTRACT_SIGN",
  "CREDENTIAL_ACCESS",
  "DELETE_CANONICAL_RECORD",
]);

export const authorityDataClassificationSchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
]);

export const authorityRoleSchema = z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]);
export const authorityRefSchema = z.string().regex(/^authority_[a-f0-9]{64}$/u);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const commandBase = {
  schemaVersion: z.literal(AUTHORITY_POLICY_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
};

export const createPolicyDraftCommandSchema = z.object({
  ...commandBase,
  action: z.literal("CREATE_POLICY_DRAFT"),
  sourcePolicySetId: z.string().min(1).max(160).nullable(),
  expectedSourceStateVersion: z.number().int().positive().nullable(),
}).strict().superRefine((value, context) => {
  if ((value.sourcePolicySetId === null) !== (value.expectedSourceStateVersion === null)) {
    context.addIssue({ code: "custom", message: "POLICY_DRAFT_SOURCE_VERSION_REQUIRED" });
  }
});

export const setPolicyRuleCommandSchema = z.object({
  ...commandBase,
  action: z.literal("SET_POLICY_RULE"),
  policySetId: z.string().min(1).max(160),
  expectedStateVersion: z.number().int().positive(),
  ruleKey: z.string().regex(/^[A-Z0-9_]{3,80}$/u),
  actionKey: authorityActionKeySchema,
  projectId: z.string().min(1).max(160).nullable(),
  roleScope: authorityRoleSchema.nullable(),
  dataClassification: authorityDataClassificationSchema.nullable(),
  outcome: authorityOutcomeSchema,
  amountCeilingMinor: z.number().int().nonnegative().max(1_000_000_000).nullable(),
  reasonCode: z.string().regex(/^[A-Z0-9_]{3,120}$/u),
}).strict();

export const activatePolicySetCommandSchema = z.object({
  ...commandBase,
  action: z.literal("ACTIVATE_POLICY_SET"),
  policySetId: z.string().min(1).max(160),
  expectedStateVersion: z.number().int().positive(),
  expectedPolicyHash: sha256Schema,
}).strict();

export const revokePolicySetCommandSchema = z.object({
  ...commandBase,
  action: z.literal("REVOKE_POLICY_SET"),
  policySetId: z.string().min(1).max(160),
  expectedStateVersion: z.number().int().positive(),
  expectedPolicyHash: sha256Schema,
}).strict();

export const authorityPolicyCommandSchema = z.discriminatedUnion("action", [
  createPolicyDraftCommandSchema,
  setPolicyRuleCommandSchema,
  activatePolicySetCommandSchema,
  revokePolicySetCommandSchema,
]);

export const evaluateActionAuthorityCommandSchema = z.object({
  ...commandBase,
  action: z.literal("EVALUATE_ACTION_AUTHORITY"),
  actionKey: authorityActionKeySchema,
  actionVersion: z.literal(AUTHORITY_ACTION_VERSION),
  projectId: z.string().min(1).max(160).nullable(),
  targetRef: authorityRefSchema,
  dataClassification: authorityDataClassificationSchema,
  amountMinor: z.number().int().nonnegative().max(1_000_000_000).nullable(),
  sourceFingerprint: sha256Schema,
  payloadHash: sha256Schema,
  expiresAt: z.string().datetime(),
  externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false),
}).strict();

export const decideAuthorityEvaluationCommandSchema = z.object({
  ...commandBase,
  action: z.literal("DECIDE_AUTHORITY_EVALUATION"),
  evaluationId: z.string().min(1).max(160),
  expectedEvaluationVersion: z.number().int().positive(),
  expectedPolicySetVersion: z.number().int().positive(),
  expectedPayloadHash: sha256Schema,
  decision: z.enum(["APPROVE", "REJECT"]),
}).strict();

export const policySetResultSchema = z.object({
  schemaVersion: z.literal(AUTHORITY_POLICY_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  policySetId: z.string().min(1),
  policySetVersion: z.number().int().positive(),
  stateVersion: z.number().int().positive(),
  policyHash: sha256Schema,
  status: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "REVOKED"]),
  ruleCount: z.number().int().nonnegative(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false),
  providerEffectCount: z.literal(0),
}).strict();

export const authorityEvaluationResultSchema = z.object({
  schemaVersion: z.literal(AUTHORITY_POLICY_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  evaluationId: z.string().min(1),
  evaluationVersion: z.number().int().positive(),
  policySetId: z.string().min(1),
  policySetVersion: z.number().int().positive(),
  actionKey: authorityActionKeySchema,
  actionVersion: z.literal(AUTHORITY_ACTION_VERSION),
  outcome: authorityOutcomeSchema,
  reasonCode: z.string().min(1).max(160),
  payloadHash: sha256Schema,
  status: z.enum(["AUTHORIZED_INTERNAL", "PENDING_APPROVAL", "PROHIBITED"]),
  expiresAt: z.string().datetime(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false),
  providerEffectCount: z.literal(0),
}).strict();

export const authorityDecisionResultSchema = z.object({
  schemaVersion: z.literal(AUTHORITY_POLICY_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  evaluationId: z.string().min(1),
  evaluationVersion: z.number().int().positive(),
  policySetVersion: z.number().int().positive(),
  payloadHash: sha256Schema,
  decision: z.enum(["APPROVE", "REJECT"]),
  status: z.enum(["APPROVED_LOCAL", "REJECTED"]),
  localAuthorizationEffectCount: z.literal(1),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false),
  providerEffectCount: z.literal(0),
}).strict();

const policyRuleProjectionSchema = z.object({
  id: z.string(),
  ruleKey: z.string(),
  actionKey: authorityActionKeySchema,
  roleScope: authorityRoleSchema.nullable(),
  projectId: z.string().nullable(),
  dataClassification: authorityDataClassificationSchema.nullable(),
  outcome: authorityOutcomeSchema,
  amountCeilingMinor: z.number().int().nullable(),
  reasonCode: z.string(),
}).strict();

const policySetProjectionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  stateVersion: z.number().int().positive(),
  status: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "REVOKED"]),
  policyHash: sha256Schema,
  rules: z.array(policyRuleProjectionSchema),
  createdAt: z.string().datetime(),
}).strict();

const evaluationProjectionSchema = z.object({
  id: z.string(),
  evaluationVersion: z.number().int().positive().nullable(),
  actorUserId: z.string().nullable(),
  actionKey: authorityActionKeySchema.nullable(),
  projectId: z.string().nullable(),
  outcome: authorityOutcomeSchema,
  reasonCode: z.string(),
  status: z.string(),
  payloadHash: sha256Schema.nullable(),
  policySetVersion: z.number().int().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
}).strict();

export const authorityPolicyCockpitSchema = z.object({
  schemaVersion: z.literal(AUTHORITY_POLICY_SCHEMA_VERSION),
  workspaceId: z.string(),
  role: z.enum(["owner", "admin", "field_worker"]),
  canManagePolicy: z.boolean(),
  policySets: z.array(policySetProjectionSchema),
  evaluations: z.array(evaluationProjectionSchema),
  counts: z.object({ policySets: z.number().int(), pendingApprovals: z.number().int(), prohibited: z.number().int() }).strict(),
  externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false),
  providerEffectCount: z.literal(0),
}).strict().superRefine((value, context) => {
  if (value.role === "field_worker") {
    if (value.policySets.length > 0 || value.canManagePolicy) {
      context.addIssue({ code: "custom", message: "FIELD_AUTHORITY_POLICY_DETAILS_MUST_BE_EMPTY" });
    }
    if (value.evaluations.some((entry) => entry.evaluationVersion !== null || entry.actorUserId !== null || entry.actionKey !== null || entry.payloadHash !== null || entry.policySetVersion !== null || entry.expiresAt !== null)) {
      context.addIssue({ code: "custom", message: "FIELD_AUTHORITY_EVALUATION_DETAILS_MUST_BE_MINIMIZED" });
    }
  }
});

export type AuthorityOutcome = z.infer<typeof authorityOutcomeSchema>;
export type AuthorityActionKey = z.infer<typeof authorityActionKeySchema>;
export type AuthorityRole = z.infer<typeof authorityRoleSchema>;
export type AuthorityDataClassification = z.infer<typeof authorityDataClassificationSchema>;
export type AuthorityPolicyCommand = z.infer<typeof authorityPolicyCommandSchema>;
export type EvaluateActionAuthorityCommand = z.infer<typeof evaluateActionAuthorityCommandSchema>;
export type DecideAuthorityEvaluationCommand = z.infer<typeof decideAuthorityEvaluationCommandSchema>;
