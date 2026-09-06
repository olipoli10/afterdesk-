import { z } from "zod";

export const approveSecretaryBroadcastCommandSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.literal("APPROVE_SECRETARY_BROADCAST"),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  draftId: z.string().min(1).max(191),
  expectedVersion: z.number().int().positive(),
  expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
  approvalStatementAccepted: z.literal(true),
}).strict();

export const secretaryBroadcastApprovalResultSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.literal("APPROVE_SECRETARY_BROADCAST"),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  draftId: z.string().min(1),
  status: z.literal("APPROVED_UNSENT"),
  version: z.number().int().positive(),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
  recipientCount: z.number().int().min(2).max(10),
  body: z.string().min(1).max(1600),
  approvedAt: z.string().datetime(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export type ApproveSecretaryBroadcastCommand = z.infer<typeof approveSecretaryBroadcastCommandSchema>;
