import { z } from "zod";

export const CONSTRUCTION_RECEIVABLE_CONTRACT_VERSION = 1 as const;

export const recordConstructionReceivableSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().min(1).max(160),
    idempotencyKey: z.string().min(1).max(160),
    actorId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    contactId: z.string().min(1).max(160).nullable(),
    invoiceReference: z.string().trim().min(1).max(120),
    amountMinor: z.number().int().positive().max(1_000_000_000),
    currency: z.literal("CAD"),
    issuedAt: z.string().datetime(),
    dueAt: z.string().datetime(),
    sourceRef: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Date(value.dueAt).getTime() < new Date(value.issuedAt).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueAt"],
        message: "The due date cannot precede the issue date.",
      });
    }
  });

export const recordConstructionReceivablePaymentSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().min(1).max(160),
    actorId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    receivableId: z.string().min(1).max(160),
    expectedVersion: z.number().int().positive(),
    amountMinor: z.number().int().positive().max(1_000_000_000),
    receivedAt: z.string().datetime(),
    sourceRef: z.string().trim().min(1).max(500),
    note: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict();

export const scheduleConstructionFollowUpSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().min(1).max(160),
    idempotencyKey: z.string().min(1).max(160),
    actorId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    contactId: z.string().min(1).max(160),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("RECEIVABLE_PAYMENT"), receivableId: z.string().min(1).max(160) }).strict(),
      z.object({ kind: z.literal("MISSING_EVIDENCE"), openLoopId: z.string().min(1).max(160) }).strict(),
    ]),
    dueAt: z.string().datetime(),
    channel: z.enum(["SMS", "EMAIL", "HUMAN_CALL"]),
    body: z.string().trim().min(1).max(1_600),
  })
  .strict();

export const constructionReceivableProjectionRoleSchema = z.enum([
  "OWNER",
  "OFFICE_MANAGER",
  "PROJECT_MANAGER",
  "FIELD_WORKER",
  "ACCOUNTANT",
]);

export const preparedConstructionFollowUpSchema = z
  .object({
    schemaVersion: z.literal(1),
    disposition: z.literal("PREPARED_UNSENT"),
    transportAuthorized: z.literal(false),
    followUpId: z.string().min(1),
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    contactId: z.string().min(1),
    channel: z.enum(["SMS", "EMAIL", "HUMAN_CALL"]),
    body: z.string().min(1).max(1_600),
    dueAt: z.string().datetime(),
  })
  .strict();

export type RecordConstructionReceivable = z.infer<
  typeof recordConstructionReceivableSchema
>;
export type RecordConstructionReceivablePayment = z.infer<
  typeof recordConstructionReceivablePaymentSchema
>;
export type ScheduleConstructionFollowUp = z.infer<
  typeof scheduleConstructionFollowUpSchema
>;
export type ConstructionReceivableProjectionRole = z.infer<
  typeof constructionReceivableProjectionRoleSchema
>;
