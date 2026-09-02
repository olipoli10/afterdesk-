import { z } from "zod";
import type { MobileWorkspace } from "@/lib/contracts";

export const ACCOUNTING_POLICY_VERSION = "r27-local-disabled-v1" as const;
const id = z.string().min(1).max(200);
const accountingRef = z.string().regex(/^accounting_[a-f0-9]{64}$/u);
const provider = z.enum(["QUICKBOOKS_ONLINE","XERO"]);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);

export const mobileAccountingAccountCommandSchema = z.discriminatedUnion("action",[
  z.object({schemaVersion:z.literal(1),action:z.literal("PREPARE_ACCOUNTING_ACCOUNT"),commandId:z.string().uuid(),workspaceId:id,
    provider,accountRef:accountingRef,tenantRef:accountingRef,capabilities:z.array(z.enum([
      "READ_RECEIVABLES","READ_PAYMENTS","PREPARE_INVOICE","PREPARE_RECONCILIATION",
    ])).min(1)}).strict(),
  z.object({schemaVersion:z.literal(1),action:z.literal("REVOKE_ACCOUNTING_ACCOUNT"),commandId:z.string().uuid(),workspaceId:id,
    accountId:id,expectedVersion:z.number().int().positive()}).strict(),
]);

const invoiceLine = z.object({description:z.string().min(1).max(500),quantity:z.number().int().positive(),
  unitAmountMinor:z.number().int().nonnegative(),taxCode:z.string().min(1).max(80),taxAmountMinor:z.number().int().nonnegative()}).strict();
export const mobileAccountingDraftCommandSchema = z.discriminatedUnion("action",[
  z.object({schemaVersion:z.literal(1),action:z.literal("PREPARE_ACCOUNTING_INVOICE"),commandId:z.string().uuid(),workspaceId:id,
    accountId:id,receivableId:id,expectedReceivableVersion:z.number().int().positive(),lines:z.array(invoiceLine).min(1).max(100),
    selectedEvidenceIds:z.array(id).max(50),expectedPolicyVersion:z.literal(ACCOUNTING_POLICY_VERSION)}).strict(),
  z.object({schemaVersion:z.literal(1),action:z.literal("PREPARE_ACCOUNTING_RECONCILIATION"),commandId:z.string().uuid(),workspaceId:id,
    accountId:id,observationId:id,receivableId:id,expectedReceivableVersion:z.number().int().positive(),
    expectedPolicyVersion:z.literal(ACCOUNTING_POLICY_VERSION)}).strict(),
  z.object({schemaVersion:z.literal(1),action:z.literal("APPROVE_ACCOUNTING_DRAFT"),commandId:z.string().uuid(),workspaceId:id,
    draftId:id,expectedVersion:z.number().int().positive(),expectedPayloadHash:hash}).strict(),
]);

const cockpitSchema = z.object({
  schemaVersion:z.literal(1),workspaceId:id,role:z.enum(["owner","admin","field_worker"]),
  accounts:z.array(z.object({id,provider,status:z.string(),version:z.number().int(),capabilities:z.array(z.string()),
    credentialStored:z.literal(false),externalWriteEnabled:z.literal(false)}).strict()),
  observations:z.array(z.object({id,kind:z.string(),projectId:id.nullable(),receivableId:id.nullable(),amountMinor:z.number().int().nullable(),
    currency:z.string().nullable(),observedStatus:z.string().nullable(),matchStatus:z.string(),matchReason:z.string().nullable(),suppliedAt:z.string().datetime()}).strict()),
  drafts:z.array(z.object({id,kind:z.string(),provider,projectId:id.nullable(),receivableId:id,version:z.number().int(),
    payload:z.record(z.string(),z.unknown()).nullable(),payloadHash:hash.nullable(),status:z.string(),canonicalEffectApplied:z.boolean(),createdAt:z.string().datetime()}).strict()),
  receivables:z.array(z.object({id,projectId:id,invoiceReference:z.string(),originalAmountMinor:z.number().int(),outstandingAmountMinor:z.number().int(),
    currency:z.string(),status:z.string(),version:z.number().int()}).strict()),
  counts:z.object({accounts:z.number().int(),observations:z.number().int(),drafts:z.number().int(),unresolved:z.number().int()}).strict(),
  financialDataVisible:z.boolean(),providerObserved:z.literal(false),externalWriteEnabled:z.literal(false),
}).strict();

const forbiddenFieldKeys = new Set(["amountMinor","originalAmountMinor","outstandingAmountMinor","currency","provider","payload","payloadHash","invoiceReference","observedStatus","matchReason"]);
function containsFieldLeak(value:unknown):boolean {
  if (Array.isArray(value)) return value.some(containsFieldLeak);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key,nested])=>forbiddenFieldKeys.has(key)||containsFieldLeak(nested));
}

export function parseMobileAccountingCockpit(value:unknown) {
  if (value && typeof value === "object" && (value as {role?:unknown}).role === "field_worker" && containsFieldLeak(value)) {
    throw new Error("MOBILE_ACCOUNTING_FIELD_LEAK_REFUSED");
  }
  return cockpitSchema.parse(value);
}

export type MobileAccountingCockpit = ReturnType<typeof parseMobileAccountingCockpit>;
export type MobileAccountingCommand = z.infer<typeof mobileAccountingAccountCommandSchema>|z.infer<typeof mobileAccountingDraftCommandSchema>;

export function formatAccountingDraftInspection(draft: MobileAccountingCockpit["drafts"][number]) {
  return JSON.stringify({
    provider: draft.provider,
    kind: draft.kind,
    receivableId: draft.receivableId,
    version: draft.version,
    payloadHash: draft.payloadHash,
    payload: draft.payload,
  }, null, 2);
}

function requireManager(workspace:MobileWorkspace) {
  if (workspace.role !== "OWNER" && workspace.role !== "OFFICE_MANAGER") throw new Error("MOBILE_ACCOUNTING_MANAGEMENT_REFUSED");
}

export function createPrepareAccountingAccountCommand(input:{workspace:MobileWorkspace;commandId:string;provider:"QUICKBOOKS_ONLINE"|"XERO";accountRef:string;tenantRef:string}) {
  requireManager(input.workspace);
  return mobileAccountingAccountCommandSchema.parse({schemaVersion:1,action:"PREPARE_ACCOUNTING_ACCOUNT",commandId:input.commandId,
    workspaceId:input.workspace.id,provider:input.provider,accountRef:input.accountRef,tenantRef:input.tenantRef,
    capabilities:["READ_RECEIVABLES","READ_PAYMENTS","PREPARE_INVOICE","PREPARE_RECONCILIATION"]});
}

export function createPrepareAccountingInvoiceCommand(input:{workspace:MobileWorkspace;commandId:string;accountId:string;receivableId:string;
  expectedReceivableVersion:number;description:string;baseAmountMinor:number;taxCode:string;taxAmountMinor:number}) {
  requireManager(input.workspace);
  return mobileAccountingDraftCommandSchema.parse({schemaVersion:1,action:"PREPARE_ACCOUNTING_INVOICE",commandId:input.commandId,
    workspaceId:input.workspace.id,accountId:input.accountId,receivableId:input.receivableId,
    expectedReceivableVersion:input.expectedReceivableVersion,lines:[{description:input.description,quantity:1,
      unitAmountMinor:input.baseAmountMinor,taxCode:input.taxCode,taxAmountMinor:input.taxAmountMinor}],selectedEvidenceIds:[],
    expectedPolicyVersion:ACCOUNTING_POLICY_VERSION});
}
