import { z } from "zod";

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const outcome = z.enum(["AUTOMATIC_INTERNAL", "APPROVAL_REQUIRED", "PROHIBITED"]);
const actionKey = z.enum([
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
const authorityRole = z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]);
const dataClassification = z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
const commandBase = { schemaVersion: z.literal(1), commandId: z.string().uuid(), workspaceId: id };

export const mobileAuthorityPolicyCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...commandBase,
    action: z.literal("CREATE_POLICY_DRAFT"),
    sourcePolicySetId: id.nullable(),
    expectedSourceStateVersion: z.number().int().positive().nullable(),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("SET_POLICY_RULE"),
    policySetId: id,
    expectedStateVersion: z.number().int().positive(),
    ruleKey: z.string().regex(/^[A-Z0-9_]{3,80}$/u),
    actionKey,
    projectId: id.nullable(),
    roleScope: authorityRole.nullable(),
    dataClassification: dataClassification.nullable(),
    outcome,
    amountCeilingMinor: z.number().int().nonnegative().max(1_000_000_000).nullable(),
    reasonCode: z.string().regex(/^[A-Z0-9_]{3,120}$/u),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("ACTIVATE_POLICY_SET"),
    policySetId: id,
    expectedStateVersion: z.number().int().positive(),
    expectedPolicyHash: hash,
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("REVOKE_POLICY_SET"),
    policySetId: id,
    expectedStateVersion: z.number().int().positive(),
    expectedPolicyHash: hash,
  }).strict(),
]);

export const mobileAuthorityEvaluateCommandSchema = z.object({
  ...commandBase,
  action: z.literal("EVALUATE_ACTION_AUTHORITY"),
  actionKey,
  actionVersion: z.literal(1),
  projectId: id.nullable(),
  targetRef: z.string().regex(/^authority_[a-f0-9]{64}$/u),
  dataClassification,
  amountMinor: z.number().int().nonnegative().max(1_000_000_000).nullable(),
  sourceFingerprint: hash,
  payloadHash: hash,
  expiresAt: z.string().datetime(),
  externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false),
}).strict();

export const mobileAuthorityDecisionCommandSchema = z.object({
  ...commandBase,
  action: z.literal("DECIDE_AUTHORITY_EVALUATION"),
  evaluationId: id,
  expectedEvaluationVersion: z.number().int().positive(),
  expectedPolicySetVersion: z.number().int().positive(),
  expectedPayloadHash: hash,
  decision: z.enum(["APPROVE", "REJECT"]),
}).strict();

const policyResult = z.object({
  schemaVersion: z.literal(1), commandId: z.string().uuid(), workspaceId: id,
  policySetId: id, policySetVersion: z.number().int().positive(), stateVersion: z.number().int().positive(),
  policyHash: hash, status: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "REVOKED"]),
  ruleCount: z.number().int().nonnegative(), replayed: z.boolean(),
  externalTransportPerformed: z.literal(false), externalWritePerformed: z.literal(false), providerEffectCount: z.literal(0),
}).strict();
const evaluationResult = z.object({
  schemaVersion: z.literal(1), commandId: z.string().uuid(), workspaceId: id,
  evaluationId: id, evaluationVersion: z.number().int().positive(), policySetId: id,
  policySetVersion: z.number().int().positive(), actionKey, actionVersion: z.literal(1), outcome,
  reasonCode: z.string(), payloadHash: hash, status: z.enum(["AUTHORIZED_INTERNAL", "PENDING_APPROVAL", "PROHIBITED"]),
  expiresAt: z.string().datetime(), replayed: z.boolean(), externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false), providerEffectCount: z.literal(0),
}).strict();
const decisionResult = z.object({
  schemaVersion: z.literal(1), commandId: z.string().uuid(), workspaceId: id,
  evaluationId: id, evaluationVersion: z.number().int().positive(), policySetVersion: z.number().int().positive(),
  payloadHash: hash, decision: z.enum(["APPROVE", "REJECT"]), status: z.enum(["APPROVED_LOCAL", "REJECTED"]),
  localAuthorizationEffectCount: z.literal(1), replayed: z.boolean(), externalTransportPerformed: z.literal(false),
  externalWritePerformed: z.literal(false), providerEffectCount: z.literal(0),
}).strict();
export const mobileAuthorityResultSchema = z.union([policyResult, evaluationResult, decisionResult]);

const policyRule = z.object({
  id, ruleKey: z.string(), actionKey, roleScope: authorityRole.nullable(), projectId: id.nullable(),
  dataClassification: dataClassification.nullable(), outcome, amountCeilingMinor: z.number().int().nullable(), reasonCode: z.string(),
}).strict();
const policySet = z.object({
  id, version: z.number().int().positive(), stateVersion: z.number().int().positive(),
  status: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "REVOKED"]), policyHash: hash,
  rules: z.array(policyRule), createdAt: z.string().datetime(),
}).strict();
const evaluation = z.object({
  id, evaluationVersion: z.number().int().positive().nullable(), actorUserId: id.nullable(), actionKey: actionKey.nullable(), projectId: id.nullable(), outcome,
  reasonCode: z.string(), status: z.string(), payloadHash: hash.nullable(), policySetVersion: z.number().int().nullable(),
  expiresAt: z.string().datetime().nullable(), createdAt: z.string().datetime(),
}).strict();
export const mobileAuthorityCockpitSchema = z.object({
  schemaVersion: z.literal(1), workspaceId: id, role: z.enum(["owner", "admin", "field_worker"]),
  canManagePolicy: z.boolean(), policySets: z.array(policySet), evaluations: z.array(evaluation),
  counts: z.object({ policySets: z.number().int(), pendingApprovals: z.number().int(), prohibited: z.number().int() }).strict(),
  externalTransportPerformed: z.literal(false), externalWritePerformed: z.literal(false), providerEffectCount: z.literal(0),
}).strict().superRefine((value, context) => {
  if (value.role !== "field_worker") return;
  if (value.policySets.length > 0 || value.canManagePolicy || value.evaluations.some((entry) =>
    entry.evaluationVersion !== null || entry.actorUserId !== null || entry.actionKey !== null || entry.payloadHash !== null || entry.policySetVersion !== null || entry.expiresAt !== null
  )) context.addIssue({ code: "custom", message: "MOBILE_AUTHORITY_FIELD_LEAK_REFUSED" });
});

export function parseMobileAuthorityCockpit(value: unknown) {
  return mobileAuthorityCockpitSchema.parse(value);
}

export type MobileAuthorityCockpit = ReturnType<typeof parseMobileAuthorityCockpit>;
export type MobileAuthorityPolicyCommand = z.infer<typeof mobileAuthorityPolicyCommandSchema>;
export type MobileAuthorityEvaluateCommand = z.infer<typeof mobileAuthorityEvaluateCommandSchema>;
export type MobileAuthorityDecisionCommand = z.infer<typeof mobileAuthorityDecisionCommandSchema>;
export type MobileAuthorityCommand = MobileAuthorityPolicyCommand | MobileAuthorityEvaluateCommand | MobileAuthorityDecisionCommand;
