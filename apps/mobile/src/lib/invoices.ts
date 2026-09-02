import { z } from "zod";

const instant = z.string().datetime();
const promiseStatus = z.enum(["ACTIVE", "KEPT", "BROKEN", "REVOKED"]);
const receivableStatus = z.enum(["OPEN", "PARTIAL", "PAID", "DISPUTED", "VOID"]);

const promiseSchema = z.object({
  id: z.string().min(1),
  status: promiseStatus,
  version: z.number().int().positive(),
  promisedAmountMinor: z.number().int().positive(),
  currency: z.literal("CAD"),
  promisedFor: instant,
  sourceRef: z.string().min(1),
  resolutionReason: z.string().nullable(),
}).strict();

const ownerCockpitSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: instant,
  workspaceId: z.string().min(1),
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  invoiceReadiness: z.array(z.object({
    loopId: z.string().min(1),
    projectId: z.string().min(1),
    projectCode: z.string().min(1),
    projectName: z.string().min(1),
    stateVersion: z.number().int().positive(),
    status: z.enum(["WAITING_FOR_EVIDENCE", "WAITING_FOR_VERIFICATION", "READY_TO_INVOICE"]),
    amountMinor: z.number().int().positive().nullable(),
    currency: z.literal("CAD").nullable(),
    missing: z.array(z.string()),
    verificationRequired: z.array(z.string()),
    contradictionCount: z.number().int().nonnegative(),
    nextResponsibleRole: z.string().min(1),
    nextAction: z.string().min(1),
    decisionHash: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict()),
  receivables: z.array(z.object({
    id: z.string().min(1),
    openLoopId: z.string().min(1).nullable(),
    projectId: z.string().min(1),
    projectCode: z.string().min(1),
    projectName: z.string().min(1),
    contactId: z.string().min(1).nullable(),
    contactName: z.string().min(1).nullable(),
    invoiceReference: z.string().min(1),
    originalAmountMinor: z.number().int().positive(),
    outstandingAmountMinor: z.number().int().nonnegative(),
    currency: z.literal("CAD"),
    issuedAt: instant,
    dueAt: instant,
    status: receivableStatus,
    version: z.number().int().positive(),
    nextResponsibleId: z.string().min(1),
    nextDecision: z.enum([
      "WAIT_UNTIL_DUE",
      "WAIT_FOR_PROMISE",
      "REVIEW_PAYMENT_PROMISE",
      "COLLECT_OVERDUE_INVOICE",
      "COLLECT_BROKEN_PROMISE",
      "NO_ACTION",
    ]),
    activePromise: promiseSchema.nullable(),
    promises: z.array(promiseSchema),
  }).strict()),
  externalTransportPerformed: z.literal(false),
}).strict();

const fieldCockpitSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: instant,
  workspaceId: z.string().min(1),
  role: z.literal("FIELD_WORKER"),
  invoiceReadiness: z.tuple([]),
  receivables: z.tuple([]),
  financialDataVisible: z.literal(false),
  externalTransportPerformed: z.literal(false),
}).strict();

const FORBIDDEN_FIELD_KEYS = new Set([
  "amountMinor",
  "originalAmountMinor",
  "outstandingAmountMinor",
  "invoiceReference",
  "promisedAmountMinor",
  "sourceRef",
  "decisionHash",
  "receivableId",
  "openLoopId",
]);

function rejectFieldLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_KEYS.has(key)) throw new Error("MOBILE_INVOICE_FIELD_LEAK_REFUSED");
    rejectFieldLeaks(child);
  }
}

export function parseMobileEconomicCockpit(value: unknown) {
  const role = z.object({ role: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]) }).passthrough().parse(value).role;
  if (role === "FIELD_WORKER") {
    rejectFieldLeaks(value);
    return fieldCockpitSchema.parse(value);
  }
  return ownerCockpitSchema.parse(value);
}

const commandBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
};

export const mobileEconomicCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...commandBase,
    action: z.literal("ISSUE_READY_INVOICE"),
    openLoopId: z.string().min(1).max(160),
    expectedLoopVersion: z.number().int().positive(),
    contactId: z.string().min(1).max(160),
    invoiceReference: z.string().trim().min(1).max(120),
    issuedAt: instant,
    dueAt: instant,
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("RECORD_PAYMENT_PROMISE"),
    receivableId: z.string().min(1).max(160),
    expectedReceivableVersion: z.number().int().positive(),
    promisedAmountMinor: z.number().int().positive().max(1_000_000_000),
    currency: z.literal("CAD"),
    promisedFor: instant,
    sourceRef: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("RESOLVE_PAYMENT_PROMISE"),
    receivableId: z.string().min(1).max(160),
    promiseId: z.string().min(1).max(160),
    expectedReceivableVersion: z.number().int().positive(),
    expectedPromiseVersion: z.number().int().positive(),
    outcome: z.enum(["KEPT", "BROKEN", "REVOKED"]),
    occurredAt: instant,
    reason: z.string().trim().min(1).max(500),
  }).strict(),
]);

export const mobileEconomicResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  action: z.enum(["ISSUE_READY_INVOICE", "RECORD_PAYMENT_PROMISE", "RESOLVE_PAYMENT_PROMISE"]),
  openLoopId: z.string().min(1).nullable(),
  receivableId: z.string().min(1),
  receivableVersion: z.number().int().positive(),
  promiseId: z.string().min(1).nullable(),
  promiseVersion: z.number().int().positive().nullable(),
  promiseStatus: promiseStatus.nullable(),
  outstandingAmountMinor: z.number().int().nonnegative(),
  disposition: z.enum(["INVOICE_RECORDED", "PROMISE_RECORDED", "PROMISE_RESOLVED"]),
  applied: z.boolean(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export type MobileEconomicCockpit = ReturnType<typeof parseMobileEconomicCockpit>;
export type MobileEconomicCommand = z.infer<typeof mobileEconomicCommandSchema>;
export type MobileEconomicResult = z.infer<typeof mobileEconomicResultSchema>;
