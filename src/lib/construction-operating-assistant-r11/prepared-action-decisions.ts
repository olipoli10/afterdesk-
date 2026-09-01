import { z } from "zod";

const decisionBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  actionId: z.string().min(1).max(160),
  expectedVersion: z.number().int().positive(),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
};

const approvePreparedActionSchema = z
  .object({
    ...decisionBase,
    decision: z.literal("APPROVE"),
  })
  .strict();

const rejectPreparedActionSchema = z
  .object({
    ...decisionBase,
    decision: z.literal("REJECT"),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const revokePreparedActionSchema = z
  .object({
    ...decisionBase,
    decision: z.literal("REVOKE"),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const preparedActionDecisionCommandSchema = z.discriminatedUnion(
  "decision",
  [
    approvePreparedActionSchema,
    rejectPreparedActionSchema,
    revokePreparedActionSchema,
  ],
);

export const preparedActionDecisionResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    actionId: z.string().min(1),
    decision: z.enum(["APPROVE", "REJECT", "REVOKE"]),
    state: z.enum(["APPROVED_UNSENT", "REJECTED", "REVOKED"]),
    version: z.number().int().positive(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    decidedAt: z.string().datetime(),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type PreparedActionDecisionCommand = z.infer<
  typeof preparedActionDecisionCommandSchema
>;
export type PreparedActionDecisionResult = z.infer<
  typeof preparedActionDecisionResultSchema
>;
