import { z } from "zod";

export const CONSTRUCTION_SHARED_API_VERSION = 1 as const;

const commandHeader = {
  schemaVersion: z.literal(CONSTRUCTION_SHARED_API_VERSION),
  requestId: z.string().min(1).max(160),
};

const receivablePayloadSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(160),
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

const paymentPayloadSchema = z
  .object({
    eventId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    receivableId: z.string().min(1).max(160),
    expectedVersion: z.number().int().positive(),
    amountMinor: z.number().int().positive().max(1_000_000_000),
    receivedAt: z.string().datetime(),
    sourceRef: z.string().trim().min(1).max(500),
    note: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict();

const followUpPayloadSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    contactId: z.string().min(1).max(160),
    target: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("RECEIVABLE_PAYMENT"),
          receivableId: z.string().min(1).max(160),
        })
        .strict(),
      z
        .object({
          kind: z.literal("MISSING_EVIDENCE"),
          openLoopId: z.string().min(1).max(160),
        })
        .strict(),
    ]),
    dueAt: z.string().datetime(),
    channel: z.enum(["SMS", "EMAIL", "HUMAN_CALL"]),
    body: z.string().trim().min(1).max(1_600),
  })
  .strict();

export const constructionSharedApiCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...commandHeader,
      type: z.literal("RECORD_RECEIVABLE"),
      payload: receivablePayloadSchema,
    })
    .strict(),
  z
    .object({
      ...commandHeader,
      type: z.literal("RECORD_PAYMENT"),
      payload: paymentPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...commandHeader,
      type: z.literal("SCHEDULE_FOLLOW_UP"),
      payload: followUpPayloadSchema,
    })
    .strict(),
]);

export const constructionCockpitQuerySchema = z
  .object({ workspaceId: z.string().min(1).max(160) })
  .strict();

export type ConstructionSharedApiCommand = z.infer<
  typeof constructionSharedApiCommandSchema
>;

