import { z } from "zod";

export const OPEN_LOOP_STATUSES = [
  "OPEN",
  "WAITING_FOR_EVIDENCE",
  "WAITING_FOR_VERIFICATION",
  "READY_TO_INVOICE",
  "CLOSED",
  "REVOKED",
] as const;

export const READINESS_REQUIREMENTS = [
  "PROJECT_ASSOCIATION",
  "WORK_DESCRIPTION",
  "AMOUNT",
  "COMPLETION_ASSERTION",
  "APPROVAL_STATE",
  "WRITTEN_APPROVAL",
  "SUPPORTING_EVIDENCE",
] as const;

export const READINESS_REASON_CODES = [
  "PROJECT_ASSOCIATION_MISSING",
  "PROJECT_ASSOCIATION_UNVERIFIED",
  "WORK_DESCRIPTION_MISSING",
  "WORK_DESCRIPTION_DISPUTED",
  "AMOUNT_UNKNOWN",
  "AMOUNT_INVALID",
  "AMOUNT_DISPUTED",
  "COMPLETION_UNCONFIRMED",
  "COMPLETION_DISPUTED",
  "APPROVAL_UNKNOWN",
  "APPROVAL_NOT_ACCEPTED",
  "WRITTEN_APPROVAL_MISSING",
  "WRITTEN_APPROVAL_UNVERIFIED",
  "SUPPORTING_EVIDENCE_MISSING",
  "SUPPORTING_EVIDENCE_UNVERIFIED",
  "MATERIAL_CONTRADICTION_OPEN",
  "READY_REQUIREMENTS_SATISFIED",
] as const;

export const FACT_STATES = [
  "UNKNOWN",
  "CLAIMED",
  "VERIFIED",
  "DISPUTED",
  "REVOKED",
] as const;

export const factStateSchema = z.enum(FACT_STATES);

const booleanFactSchema = z
  .object({
    value: z.boolean().nullable(),
    state: factStateSchema,
  })
  .strict();

const textFactSchema = z
  .object({
    value: z.string().max(4000).nullable(),
    state: factStateSchema,
  })
  .strict();

const amountFactSchema = z
  .object({
    value: z
      .object({
        amountMinor: z.number().int(),
        currency: z.literal("CAD"),
      })
      .strict()
      .nullable(),
    state: factStateSchema,
  })
  .strict();

const approvalFactSchema = z
  .object({
    value: z.enum(["APPROVED", "REJECTED", "UNKNOWN"]).nullable(),
    state: factStateSchema,
  })
  .strict();

export const loopEvidenceSchema = z
  .object({
    id: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    kind: z.enum(["WRITTEN_APPROVAL", "PHOTO", "DOCUMENT"]),
    state: z.enum(["PRESENT_UNVERIFIED", "VERIFIED", "REJECTED", "REVOKED"]),
  })
  .strict();

export const loopContradictionSchema = z
  .object({
    id: z.string().min(1).max(160),
    field: z.string().min(1).max(120),
    status: z.enum(["OPEN", "RESOLVED"]),
  })
  .strict();

export const invoiceReadinessInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    loopId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    stateVersion: z.number().int().positive(),
    billingBasis: z.literal("CHANGE_ORDER"),
    facts: z
      .object({
        projectAssociation: booleanFactSchema,
        workDescription: textFactSchema,
        amount: amountFactSchema,
        completion: booleanFactSchema,
        approval: approvalFactSchema,
      })
      .strict(),
    evidence: z.array(loopEvidenceSchema).max(200),
    contradictions: z.array(loopContradictionSchema).max(100),
  })
  .strict();

export const reportWorkFinishedCommandSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    actorId: z.string().min(1).max(160),
    sourceMessageId: z.string().min(1).max(160),
    commandType: z.literal("REPORT_WORK_FINISHED"),
    claims: z
      .object({
        billingBasis: z.literal("CHANGE_ORDER"),
        workDescription: z.string().min(1).max(4000).nullable(),
        amountMinor: z.number().int().positive().nullable(),
        currency: z.literal("CAD"),
        completion: z.boolean().nullable(),
        approvalState: z.enum(["APPROVED", "REJECTED", "UNKNOWN"]).nullable(),
      })
      .strict(),
  })
  .strict();

export const readinessDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    loopId: z.string().min(1),
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    stateVersion: z.number().int().positive(),
    status: z.enum(OPEN_LOOP_STATUSES),
    ready: z.boolean(),
    missing: z.array(z.enum(READINESS_REQUIREMENTS)),
    verificationRequired: z.array(z.enum(READINESS_REQUIREMENTS)),
    contradictions: z.array(z.string().min(1)),
    reasons: z.array(z.enum(READINESS_REASON_CODES)),
    nextResponsible: z
      .object({
        kind: z.literal("USER"),
        role: z.enum([
          "OWNER_OR_OFFICE",
          "ASSIGNED_FIELD_ROLE",
          "AUTHORIZED_VERIFIER",
          "OFFICE_OR_ACCOUNTING",
        ]),
      })
      .strict(),
    nextAction: z.enum([
      "CLARIFY_PROJECT_OR_FINANCIALS",
      "OBTAIN_WRITTEN_APPROVAL",
      "SUPPLY_FIELD_EVIDENCE",
      "VERIFY_OR_RESOLVE",
      "PREPARE_INVOICE",
    ]),
    decisionHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const constructionProjectionRoleSchema = z.enum([
  "OWNER",
  "OFFICE_MANAGER",
  "PROJECT_MANAGER",
  "FIELD_WORKER",
  "ACCOUNTANT",
]);

export const preparedEvidenceRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    disposition: z.literal("PREPARED_UNSENT"),
    transportAuthorized: z.literal(false),
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    loopId: z.string().min(1).max(160),
    loopStateVersion: z.number().int().positive(),
    actionId: z.string().min(1).max(160),
    actionVersion: z.literal(1),
    requestId: z.string().min(1).max(160),
    contactId: z.string().min(1).max(160),
    channel: z.enum(["SMS", "EMAIL"]),
    normalizedRecipient: z.string().min(1).max(320),
    body: z.string().min(1).max(1600),
    expiresAt: z.string().datetime(),
  })
  .strict();

export type InvoiceReadinessInput = z.infer<typeof invoiceReadinessInputSchema>;
export type ReportWorkFinishedCommand = z.infer<typeof reportWorkFinishedCommandSchema>;
export type ReadinessDecision = z.infer<typeof readinessDecisionSchema>;
export type ConstructionProjectionRole = z.infer<typeof constructionProjectionRoleSchema>;
export type PreparedEvidenceRequest = z.infer<typeof preparedEvidenceRequestSchema>;

type OpenLoopProjection = {
  loopId: string;
  projectId: string;
  status: ReadinessDecision["status"];
  ready: boolean;
  missing: ReadinessDecision["missing"];
  verificationRequired: ReadinessDecision["verificationRequired"];
  contradictionCount: number;
  nextResponsible: ReadinessDecision["nextResponsible"];
  nextAction: ReadinessDecision["nextAction"];
  decisionHash: string;
};

type FinancialOpenLoopProjection = OpenLoopProjection & {
  amountMinor: number | null;
  currency: "CAD" | null;
};

export function projectOpenLoopProjection(
  rawInput: InvoiceReadinessInput,
  rawDecision: ReadinessDecision,
  rawRole: "OWNER" | "OFFICE_MANAGER" | "ACCOUNTANT",
): FinancialOpenLoopProjection;
export function projectOpenLoopProjection(
  rawInput: InvoiceReadinessInput,
  rawDecision: ReadinessDecision,
  rawRole: "PROJECT_MANAGER" | "FIELD_WORKER",
): OpenLoopProjection;
export function projectOpenLoopProjection(
  rawInput: InvoiceReadinessInput,
  rawDecision: ReadinessDecision,
  rawRole: ConstructionProjectionRole,
): OpenLoopProjection | FinancialOpenLoopProjection;
export function projectOpenLoopProjection(
  rawInput: InvoiceReadinessInput,
  rawDecision: ReadinessDecision,
  rawRole: ConstructionProjectionRole,
) {
  const input = invoiceReadinessInputSchema.parse(rawInput);
  const decision = readinessDecisionSchema.parse(rawDecision);
  const role = constructionProjectionRoleSchema.parse(rawRole);
  const base = {
    loopId: decision.loopId,
    projectId: decision.projectId,
    status: decision.status,
    ready: decision.ready,
    missing: [...decision.missing],
    verificationRequired: [...decision.verificationRequired],
    contradictionCount: decision.contradictions.length,
    nextResponsible: decision.nextResponsible,
    nextAction: decision.nextAction,
    decisionHash: decision.decisionHash,
  };

  if (role === "OWNER" || role === "OFFICE_MANAGER" || role === "ACCOUNTANT") {
    return {
      ...base,
      amountMinor: input.facts.amount.value?.amountMinor ?? null,
      currency: input.facts.amount.value?.currency ?? null,
    };
  }

  return base;
}
