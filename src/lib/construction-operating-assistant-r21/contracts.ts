import { z } from "zod";

export const ECONOMIC_ENGINE_SCHEMA_VERSION = 1 as const;

const instant = z.string().datetime();
const commandBase = {
  schemaVersion: z.literal(ECONOMIC_ENGINE_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
};

export const economicCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...commandBase,
    action: z.literal("ISSUE_READY_INVOICE"),
    openLoopId: z.string().min(1).max(160),
    expectedLoopVersion: z.number().int().positive(),
    contactId: z.string().min(1).max(160),
    invoiceReference: z.string().trim().min(1).max(120),
    issuedAt: instant,
    dueAt: instant,
  }).strict().superRefine((value, context) => {
    if (new Date(value.dueAt).getTime() < new Date(value.issuedAt).getTime()) {
      context.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "The due date cannot precede the issue date.",
      });
    }
  }),
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

export type EconomicCommand = z.infer<typeof economicCommandSchema>;

export const economicCommandResultSchema = z.object({
  schemaVersion: z.literal(ECONOMIC_ENGINE_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  action: z.enum(["ISSUE_READY_INVOICE", "RECORD_PAYMENT_PROMISE", "RESOLVE_PAYMENT_PROMISE"]),
  openLoopId: z.string().min(1).nullable(),
  receivableId: z.string().min(1),
  receivableVersion: z.number().int().positive(),
  promiseId: z.string().min(1).nullable(),
  promiseVersion: z.number().int().positive().nullable(),
  promiseStatus: z.enum(["ACTIVE", "KEPT", "BROKEN", "REVOKED"]).nullable(),
  outstandingAmountMinor: z.number().int().nonnegative(),
  disposition: z.enum(["INVOICE_RECORDED", "PROMISE_RECORDED", "PROMISE_RESOLVED"]),
  applied: z.boolean(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export type EconomicCommandResult = z.infer<typeof economicCommandResultSchema>;

export const economicCockpitQuerySchema = z.object({
  workspaceId: z.string().min(1).max(160),
}).strict();

const readinessSchema = z.object({
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
}).strict();

const promiseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["ACTIVE", "KEPT", "BROKEN", "REVOKED"]),
  version: z.number().int().positive(),
  promisedAmountMinor: z.number().int().positive(),
  currency: z.literal("CAD"),
  promisedFor: instant,
  sourceRef: z.string().min(1),
  resolutionReason: z.string().nullable(),
}).strict();

const receivableSchema = z.object({
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
  status: z.enum(["OPEN", "PARTIAL", "PAID", "DISPUTED", "VOID"]),
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
}).strict();

export const ownerEconomicCockpitSchema = z.object({
  schemaVersion: z.literal(ECONOMIC_ENGINE_SCHEMA_VERSION),
  generatedAt: instant,
  workspaceId: z.string().min(1),
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  invoiceReadiness: z.array(readinessSchema),
  receivables: z.array(receivableSchema),
  externalTransportPerformed: z.literal(false),
}).strict();

export const fieldEconomicCockpitSchema = z.object({
  schemaVersion: z.literal(ECONOMIC_ENGINE_SCHEMA_VERSION),
  generatedAt: instant,
  workspaceId: z.string().min(1),
  role: z.literal("FIELD_WORKER"),
  invoiceReadiness: z.array(z.never()).max(0),
  receivables: z.array(z.never()).max(0),
  financialDataVisible: z.literal(false),
  externalTransportPerformed: z.literal(false),
}).strict();

export const economicCockpitSchema = z.discriminatedUnion("role", [
  ownerEconomicCockpitSchema,
  fieldEconomicCockpitSchema,
]);

export type EconomicCockpit = z.infer<typeof economicCockpitSchema>;
