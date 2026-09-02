import { z } from "zod";

export const ACCOUNTING_SCHEMA_VERSION = 1 as const;
export const ACCOUNTING_POLICY_VERSION = "r27-local-disabled-v1" as const;

export const accountingProviderSchema = z.enum(["QUICKBOOKS_ONLINE", "XERO"]);
export const accountingRefSchema = z.string().regex(/^accounting_[a-f0-9]{64}$/u);
export const accountingCapabilitiesSchema = z.array(z.enum([
  "READ_RECEIVABLES",
  "READ_PAYMENTS",
  "PREPARE_INVOICE",
  "PREPARE_RECONCILIATION",
])).min(1).refine((value) => new Set(value).size === value.length, "duplicate capability");

const commandBase = {
  schemaVersion: z.literal(ACCOUNTING_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
};

export const prepareAccountingAccountCommandSchema = z.object({
  ...commandBase,
  action: z.literal("PREPARE_ACCOUNTING_ACCOUNT"),
  provider: accountingProviderSchema,
  accountRef: accountingRefSchema,
  tenantRef: accountingRefSchema,
  capabilities: accountingCapabilitiesSchema,
}).strict();

export const revokeAccountingAccountCommandSchema = z.object({
  ...commandBase,
  action: z.literal("REVOKE_ACCOUNTING_ACCOUNT"),
  accountId: z.string().min(1).max(160),
  expectedVersion: z.number().int().positive(),
}).strict();

export const accountingAccountCommandSchema = z.discriminatedUnion("action", [
  prepareAccountingAccountCommandSchema,
  revokeAccountingAccountCommandSchema,
]);

export const trustedAccountingAdapterAssertionSchema = z.object({
  adapterId: z.enum(["ENDVERA_LOCAL_AUTHENTICATED_R27", "FUTURE_VERIFIED_ACCOUNTING_ADAPTER"]),
  authenticityVerified: z.literal(true),
  externalTransportPerformed: z.literal(false),
}).strict();

export const normalizedAccountingObservationSchema = z.object({
  schemaVersion: z.literal(ACCOUNTING_SCHEMA_VERSION),
  observationId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  accountId: z.string().min(1).max(160),
  provider: accountingProviderSchema,
  entityRef: accountingRefSchema,
  cursorRef: accountingRefSchema,
  kind: z.enum(["INVOICE", "PAYMENT"]),
  projectId: z.string().min(1).max(160).nullable(),
  contactId: z.string().min(1).max(160).nullable(),
  receivableId: z.string().min(1).max(160).nullable(),
  documentNumberHash: z.string().regex(/^[a-f0-9]{64}$/u),
  amountMinor: z.number().int().positive().max(1_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  observedStatus: z.string().trim().min(1).max(80),
  suppliedAt: z.string().datetime(),
  adapter: trustedAccountingAdapterAssertionSchema,
  externalWritePerformed: z.literal(false),
}).strict();

const invoiceLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().positive().max(1_000_000),
  unitAmountMinor: z.number().int().nonnegative().max(1_000_000_000),
  taxCode: z.string().trim().min(1).max(80),
  taxAmountMinor: z.number().int().nonnegative().max(1_000_000_000),
}).strict();

export const prepareAccountingInvoiceDraftCommandSchema = z.object({
  ...commandBase,
  action: z.literal("PREPARE_ACCOUNTING_INVOICE"),
  accountId: z.string().min(1).max(160),
  receivableId: z.string().min(1).max(160),
  expectedReceivableVersion: z.number().int().positive(),
  lines: z.array(invoiceLineSchema).min(1).max(100),
  selectedEvidenceIds: z.array(z.string().min(1).max(160)).max(50).default([]),
  expectedPolicyVersion: z.literal(ACCOUNTING_POLICY_VERSION),
}).strict();

export const prepareAccountingReconciliationDraftCommandSchema = z.object({
  ...commandBase,
  action: z.literal("PREPARE_ACCOUNTING_RECONCILIATION"),
  accountId: z.string().min(1).max(160),
  observationId: z.string().min(1).max(160),
  receivableId: z.string().min(1).max(160),
  expectedReceivableVersion: z.number().int().positive(),
  expectedPolicyVersion: z.literal(ACCOUNTING_POLICY_VERSION),
}).strict();

export const prepareAccountingDraftCommandSchema = z.discriminatedUnion("action", [
  prepareAccountingInvoiceDraftCommandSchema,
  prepareAccountingReconciliationDraftCommandSchema,
]);

export const approveAccountingDraftCommandSchema = z.object({
  ...commandBase,
  action: z.literal("APPROVE_ACCOUNTING_DRAFT"),
  draftId: z.string().min(1).max(160),
  expectedVersion: z.number().int().positive(),
  expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

export const accountingAccountResultSchema = z.object({
  schemaVersion: z.literal(ACCOUNTING_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  accountId: z.string().min(1),
  provider: accountingProviderSchema,
  status: z.enum(["PREPARED_DISABLED", "REVOKED"]),
  version: z.number().int().positive(),
  capabilities: accountingCapabilitiesSchema,
  replayed: z.boolean(),
  credentialStored: z.literal(false),
  externalWriteEnabled: z.literal(false),
}).strict();

export const accountingObservationResultSchema = z.object({
  schemaVersion: z.literal(ACCOUNTING_SCHEMA_VERSION),
  observationId: z.string().uuid(),
  accountingObservationId: z.string().min(1),
  workspaceId: z.string().min(1),
  receivableId: z.string().nullable(),
  projectId: z.string().nullable(),
  matchStatus: z.enum(["EXACT", "PARTIAL", "UNMATCHED", "AMBIGUOUS", "OVERPAYMENT", "CONFLICT_REQUIRES_REVIEW", "REFUSED"]),
  matchReason: z.string().min(1),
  replayed: z.boolean(),
  canonicalEffectApplied: z.literal(false),
  externalWritePerformed: z.literal(false),
}).strict();

export const accountingDraftResultSchema = z.object({
  schemaVersion: z.literal(ACCOUNTING_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  draftId: z.string().min(1),
  workspaceId: z.string().min(1),
  kind: z.enum(["INVOICE", "RECONCILIATION"]),
  provider: accountingProviderSchema,
  receivableId: z.string().min(1),
  observationId: z.string().nullable(),
  version: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
  status: z.enum(["PREPARED_UNPOSTED", "APPROVED_UNPOSTED"]),
  canonicalEffectApplied: z.boolean(),
  externalEffectCount: z.literal(0),
  replayed: z.boolean(),
  externalWritePerformed: z.literal(false),
}).strict();

const accountProjectionSchema = z.object({
  id: z.string(), provider: accountingProviderSchema, status: z.string(), version: z.number().int(),
  capabilities: z.array(z.string()), credentialStored: z.literal(false), externalWriteEnabled: z.literal(false),
}).strict();
const observationProjectionSchema = z.object({
  id: z.string(), kind: z.string(), projectId: z.string().nullable(), receivableId: z.string().nullable(),
  amountMinor: z.number().int().nullable(), currency: z.string().nullable(), observedStatus: z.string().nullable(),
  matchStatus: z.string(), matchReason: z.string().nullable(), suppliedAt: z.string().datetime(),
}).strict();
const draftProjectionSchema = z.object({
  id: z.string(), kind: z.string(), provider: accountingProviderSchema, projectId: z.string().nullable(),
  receivableId: z.string(), version: z.number().int(), payload: z.record(z.string(), z.unknown()).nullable(),
  payloadHash: z.string().nullable(), status: z.string(), canonicalEffectApplied: z.boolean(), createdAt: z.string().datetime(),
}).strict();
const receivableProjectionSchema = z.object({
  id: z.string(), projectId: z.string(), invoiceReference: z.string(), originalAmountMinor: z.number().int(),
  outstandingAmountMinor: z.number().int(), currency: z.string(), status: z.string(), version: z.number().int(),
}).strict();

export const accountingCockpitSchema = z.object({
  schemaVersion: z.literal(ACCOUNTING_SCHEMA_VERSION),
  workspaceId: z.string(),
  role: z.enum(["owner", "admin", "field_worker"]),
  accounts: z.array(accountProjectionSchema),
  observations: z.array(observationProjectionSchema),
  drafts: z.array(draftProjectionSchema),
  receivables: z.array(receivableProjectionSchema),
  counts: z.object({accounts:z.number().int(),observations:z.number().int(),drafts:z.number().int(),unresolved:z.number().int()}).strict(),
  financialDataVisible: z.boolean(),
  providerObserved: z.literal(false),
  externalWriteEnabled: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.role === "field_worker" && (value.accounts.length || value.observations.length || value.drafts.length || value.receivables.length || value.financialDataVisible)) {
    context.addIssue({code:"custom",path:["role"],message:"FIELD_ACCOUNTING_DETAILS_MUST_BE_EMPTY"});
  }
});

export type NormalizedAccountingObservation = z.infer<typeof normalizedAccountingObservationSchema>;
export type PrepareAccountingDraftCommand = z.infer<typeof prepareAccountingDraftCommandSchema>;
export type ApproveAccountingDraftCommand = z.infer<typeof approveAccountingDraftCommandSchema>;
export type AccountingDraftResult = z.infer<typeof accountingDraftResultSchema>;
