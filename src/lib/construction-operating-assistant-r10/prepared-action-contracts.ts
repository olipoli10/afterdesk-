import { z } from "zod";
import {
  boundOutboundActionSchema,
  buildActionFingerprint,
} from "@/lib/construction-assistant-v1/outbound";

const identitySchema = z
  .object({
    id: z.string().min(1),
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
  })
  .strict();

export const preparedActionInspectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("PREPARED_OUTBOUND_MESSAGE"),
    actionId: z.string().min(1),
    workspaceId: z.string().min(1),
    state: z.enum(["PREPARED_UNSENT", "APPROVED_UNSENT"]),
    channel: z.enum(["SMS", "EMAIL"]),
    recipient: z.string().min(3).max(320),
    body: z.string().min(1).max(1600),
    version: z.number().int().positive(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    project: identitySchema.nullable(),
    contact: identitySchema.nullable(),
    provenance: z
      .object({
        sourceMessageId: z.string().min(1),
        channel: z.enum(["portal", "sms", "email", "voice"]),
        direction: z.enum(["inbound", "outbound"]),
        receivedAt: z.string().datetime().nullable(),
        recordedAt: z.string().datetime(),
      })
      .strict(),
    approval: z
      .object({
        required: z.literal(true),
        approvedVersion: z.number().int().positive().nullable(),
        approvedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
        approvedAt: z.string().datetime().nullable(),
      })
      .strict(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type PreparedActionInspection = z.infer<
  typeof preparedActionInspectionSchema
>;

const preparedActionProjectionInputSchema = z
  .object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    type: z.literal("outbound_message"),
    status: z.enum(["proposed", "approved"]),
    dueAt: z.date().nullable(),
    version: z.number().int().positive(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
    payload: z.unknown(),
    approvalRequired: z.literal(true),
    approvedVersion: z.number().int().positive().nullable(),
    approvedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
    approvedAt: z.date().nullable(),
    simulatedDeliveryCount: z.literal(0),
    project: identitySchema.nullable(),
    contact: identitySchema.nullable(),
    sourceMessage: z
      .object({
        id: z.string().min(1),
        channel: z.enum(["portal", "sms", "email", "voice"]),
        direction: z.enum(["inbound", "outbound"]),
        receivedAt: z.date().nullable(),
        createdAt: z.date(),
      })
      .strict(),
  })
  .strict();

export function projectPreparedActionInspection(
  value: unknown,
): PreparedActionInspection {
  const action = preparedActionProjectionInputSchema.parse(value);
  const payload = boundOutboundActionSchema.parse(action.payload);
  const fingerprint = buildActionFingerprint(payload);
  if (
    payload.actionId !== action.id ||
    payload.workspaceId !== action.workspaceId ||
    payload.version !== action.version
  ) {
    throw new Error("PREPARED_ACTION_BINDING_MISMATCH");
  }
  if (fingerprint !== action.payloadHash) {
    throw new Error("PREPARED_ACTION_FINGERPRINT_MISMATCH");
  }
  if (
    action.status === "approved" &&
    (action.approvedVersion !== action.version ||
      action.approvedPayloadHash !== action.payloadHash ||
      !action.approvedAt)
  ) {
    throw new Error("PREPARED_ACTION_APPROVAL_MISMATCH");
  }
  if (
    action.status === "proposed" &&
    (action.approvedVersion !== null ||
      action.approvedPayloadHash !== null ||
      action.approvedAt !== null)
  ) {
    throw new Error("PREPARED_ACTION_UNEXPECTED_APPROVAL");
  }

  return preparedActionInspectionSchema.parse({
    schemaVersion: 1,
    kind: "PREPARED_OUTBOUND_MESSAGE",
    actionId: action.id,
    workspaceId: action.workspaceId,
    state:
      action.status === "approved" ? "APPROVED_UNSENT" : "PREPARED_UNSENT",
    channel: payload.channel,
    recipient: payload.normalizedRecipient,
    body: payload.body,
    version: action.version,
    fingerprint,
    project: action.project,
    contact: action.contact,
    provenance: {
      sourceMessageId: action.sourceMessage.id,
      channel: action.sourceMessage.channel,
      direction: action.sourceMessage.direction,
      receivedAt: action.sourceMessage.receivedAt?.toISOString() ?? null,
      recordedAt: action.sourceMessage.createdAt.toISOString(),
    },
    approval: {
      required: true,
      approvedVersion: action.approvedVersion,
      approvedFingerprint: action.approvedPayloadHash,
      approvedAt: action.approvedAt?.toISOString() ?? null,
    },
    externalTransportPerformed: false,
  });
}
