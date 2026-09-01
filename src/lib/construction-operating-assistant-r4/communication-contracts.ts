import { z } from "zod";

export const COMMUNICATION_CHANNELS = ["SMS", "VOICE"] as const;
export const communicationChannelSchema = z.enum(COMMUNICATION_CHANNELS);
export type CommunicationChannel = z.infer<typeof communicationChannelSchema>;

export const SMS_CONNECTOR_PROVIDER = "endvera_sms" as const;
export const VOICE_CONNECTOR_PROVIDER = "endvera_voice" as const;
export const SMS_INBOUND_CAPABILITY = "sms_inbound" as const;
export const SMS_OUTBOUND_PREPARE_CAPABILITY = "sms_outbound_prepare" as const;
export const VOICE_TRANSCRIPT_INBOUND_CAPABILITY = "voice_transcript_inbound" as const;

export const opaqueCommunicationIdentityRefSchema = z
  .string()
  .regex(/^ref_[a-f0-9]{64}$/u, "opaque communication identity reference required");

const inboundBase = {
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  senderIdentityRef: opaqueCommunicationIdentityRefSchema,
  occurredAt: z.string().datetime(),
};

export const smsInboundEventSchema = z
  .object({
    ...inboundBase,
    channel: z.literal("SMS"),
    kind: z.literal("TEXT"),
    body: z.string().trim().min(1).max(10_000),
  })
  .strict();

export const voiceTranscriptInboundEventSchema = z
  .object({
    ...inboundBase,
    channel: z.literal("VOICE"),
    kind: z.literal("TRANSCRIPT"),
    body: z.string().trim().min(1).max(10_000),
    consentEvidenceRef: z.string().regex(/^consent_[a-f0-9]{64}$/u),
    sourceAudioPersisted: z.literal(false),
  })
  .strict();

export const communicationInboundEventSchema = z.discriminatedUnion("channel", [
  smsInboundEventSchema,
  voiceTranscriptInboundEventSchema,
]);
export type CommunicationInboundEvent = z.infer<typeof communicationInboundEventSchema>;

export const trustedCommunicationAdapterAssertionSchema = z
  .object({
    adapterId: z.enum(["ENDVERA_LOCAL_AUTHENTICATED_R4", "FUTURE_VERIFIED_PROVIDER_ADAPTER"]),
    authenticityVerified: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();
export type TrustedCommunicationAdapterAssertion = z.infer<
  typeof trustedCommunicationAdapterAssertionSchema
>;

export const communicationInboundResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    channel: communicationChannelSchema,
    eventId: z.string().uuid(),
    status: z.enum(["APPLIED", "PREPARED_UNSENT", "CLARIFICATION_REQUIRED", "ANSWERED", "REFUSED"]),
    commandId: z.string().uuid(),
    messageId: z.string().min(1),
    canonicalEffectId: z.string().min(1).nullable(),
    reply: z.string().min(1),
    replayed: z.boolean(),
    sourceAudioPersisted: z.literal(false),
    externalTransportPerformed: z.literal(false),
  })
  .strict();
export type CommunicationInboundResult = z.infer<typeof communicationInboundResultSchema>;

export const prepareCommunicationChannelSchema = z
  .object({
    schemaVersion: z.literal(1),
    action: z.literal("PREPARE_CHANNEL"),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    channel: communicationChannelSchema,
  })
  .strict();

export const revokeCommunicationChannelSchema = z
  .object({
    schemaVersion: z.literal(1),
    action: z.literal("REVOKE_LOCAL"),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    channel: communicationChannelSchema,
  })
  .strict();

export const approveOutboundMessageSchema = z
  .object({
    schemaVersion: z.literal(1),
    action: z.literal("APPROVE_OUTBOUND"),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    actionId: z.string().min(1).max(160),
    expectedVersion: z.number().int().positive(),
    expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export const prepareSmsDispatchSchema = z
  .object({
    schemaVersion: z.literal(1),
    action: z.literal("PREPARE_SMS_DISPATCH"),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    actionId: z.string().min(1).max(160),
    expectedVersion: z.number().int().positive(),
    expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export const manageCommunicationConnectorSchema = z.discriminatedUnion("action", [
  prepareCommunicationChannelSchema,
  revokeCommunicationChannelSchema,
  approveOutboundMessageSchema,
  prepareSmsDispatchSchema,
]);

export const communicationChannelStatusSchema = z
  .object({
    schemaVersion: z.literal(1),
    workspaceId: z.string().min(1),
    channel: communicationChannelSchema,
    status: z.enum(["NOT_CONFIGURED", "PREPARED", "REVOKED", "ERROR"]),
    capabilities: z.array(z.string().min(1)),
    senderIdentityRef: opaqueCommunicationIdentityRefSchema.nullable(),
    localAdapterReady: z.boolean(),
    credentialStored: z.literal(false),
    externalTransportEnabled: z.literal(false),
    externalActivationReady: z.literal(false),
    nextStep: z.string().min(1),
  })
  .strict();
export type CommunicationChannelStatus = z.infer<typeof communicationChannelStatusSchema>;

export const prepareCommunicationChannelResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1),
    channel: communicationChannelSchema,
    accountId: z.string().min(1),
    operationId: z.string().min(1),
    senderIdentityRef: opaqueCommunicationIdentityRefSchema,
    status: z.literal("PREPARED"),
    capabilities: z.array(z.string().min(1)).min(1),
    missingConfiguration: z.array(z.string().min(1)).min(1),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export const revokeCommunicationChannelResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    channel: communicationChannelSchema,
    accountId: z.string().min(1),
    operationId: z.string().min(1),
    status: z.literal("REVOKED"),
    localAccessDisabled: z.literal(true),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export const outboundApprovalResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    actionId: z.string().min(1),
    status: z.literal("APPROVED_UNSENT"),
    approvedVersion: z.number().int().positive(),
    approvedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export const preparedSmsDispatchResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    actionId: z.string().min(1),
    operationId: z.string().min(1),
    status: z.literal("PREPARED_UNSENT"),
    channel: z.literal("SMS"),
    maskedRecipient: z.string().min(3).max(40),
    body: z.string().min(1).max(1600),
    version: z.number().int().positive(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();
