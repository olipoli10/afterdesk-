import { z } from "zod";

const broadcastBaseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["PREPARED_UNSENT", "APPROVED_UNSENT"]),
  version: z.literal(1),
  recipientCount: z.number().int().min(2).max(10),
  preparedAt: z.string().datetime(),
  externalTransportPerformed: z.literal(false),
});

export const mobileSecretaryBroadcastFullSchema = broadcastBaseSchema.extend({
  visibility: z.literal("FULL"),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
  body: z.string().min(1).max(1600),
  recipients: z.array(z.object({
    displayName: z.string().min(1),
    maskedDestination: z.string().min(1),
  }).strict()).min(2).max(10),
}).strict();

const mobileSecretaryBroadcastRedactedSchema = broadcastBaseSchema.extend({
  visibility: z.literal("REDACTED"),
}).strict();

export const mobileSecretaryBroadcastCockpitSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  role: z.enum(["owner", "admin", "field_worker"]),
  drafts: z.array(z.discriminatedUnion("visibility", [
    mobileSecretaryBroadcastFullSchema,
    mobileSecretaryBroadcastRedactedSchema,
  ])),
  externalTransportEnabled: z.literal(false),
}).strict();

export const mobileApproveSecretaryBroadcastCommandSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.literal("APPROVE_SECRETARY_BROADCAST"),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  draftId: z.string().min(1).max(191),
  expectedVersion: z.number().int().positive(),
  expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
  approvalStatementAccepted: z.literal(true),
}).strict();

export const mobileSecretaryBroadcastApprovalResultSchema = z.object({
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

export type MobileSecretaryBroadcastCockpit = z.infer<typeof mobileSecretaryBroadcastCockpitSchema>;
export type MobileSecretaryBroadcastFull = z.infer<typeof mobileSecretaryBroadcastFullSchema>;
export type MobileApproveSecretaryBroadcastCommand = z.infer<typeof mobileApproveSecretaryBroadcastCommandSchema>;

export function createApproveSecretaryBroadcastCommand(input: {
  workspaceId: string;
  draft: MobileSecretaryBroadcastFull;
}): MobileApproveSecretaryBroadcastCommand {
  return mobileApproveSecretaryBroadcastCommandSchema.parse({
    schemaVersion: 1,
    action: "APPROVE_SECRETARY_BROADCAST",
    commandId: globalThis.crypto.randomUUID(),
    workspaceId: input.workspaceId,
    draftId: input.draft.id,
    expectedVersion: input.draft.version,
    expectedPayloadHash: input.draft.payloadHash,
    approvalStatementAccepted: true,
  });
}
