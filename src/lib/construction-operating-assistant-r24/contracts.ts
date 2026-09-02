import { z } from "zod";
import { opaqueCommunicationIdentityRefSchema } from "@/lib/construction-operating-assistant-r4/communication-contracts";

const identifier = z.string().min(1).max(200);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const consentEvidenceRef = z.string().regex(/^consent_[a-f0-9]{64}$/u);

export const messagingPurposeSchema = z.enum(["service", "commercial"]);
export type MessagingPurpose = z.infer<typeof messagingPurposeSchema>;

export const messagingConsentStatusSchema = z.enum(["unknown", "granted", "withdrawn"]);
export const messagingSuppressionStatusSchema = z.enum([
  "allowed",
  "suppressed",
  "review_required",
]);

export const selectedMediaReferenceSchema = z.object({
  evidenceId: identifier,
  contentHash: sha256,
  kind: z.enum(["PHOTO", "DOCUMENT", "WRITTEN_APPROVAL"]),
}).strict();
export type SelectedMediaReference = z.infer<typeof selectedMediaReferenceSchema>;

const inboundBase = {
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  senderIdentityRef: opaqueCommunicationIdentityRefSchema,
  occurredAt: z.string().datetime(),
};

export const messagingInboundEventSchema = z.discriminatedUnion("kind", [
  z.object({
    ...inboundBase,
    kind: z.literal("SMS_TEXT"),
    body: z.string().trim().min(1).max(10_000),
    mediaReferences: z.array(selectedMediaReferenceSchema).length(0),
  }).strict(),
  z.object({
    ...inboundBase,
    kind: z.literal("MMS"),
    body: z.string().trim().max(10_000),
    mediaReferences: z.array(selectedMediaReferenceSchema).min(1).max(10),
  }).strict(),
]);
export type MessagingInboundEvent = z.infer<typeof messagingInboundEventSchema>;

const policyBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  contactId: identifier,
  purpose: messagingPurposeSchema,
  expectedStateVersion: z.number().int().nonnegative(),
};

export const messagingPolicyCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...policyBase,
    action: z.literal("RECORD_CONSENT"),
    evidenceRef: consentEvidenceRef,
  }).strict(),
  z.object({
    ...policyBase,
    action: z.literal("WITHDRAW_CONSENT"),
    reason: z.string().trim().min(1).max(240),
  }).strict(),
]);
export type MessagingPolicyCommand = z.infer<typeof messagingPolicyCommandSchema>;

export const preparePolicyBoundSmsSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.literal("PREPARE_POLICY_BOUND_SMS"),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  actionId: identifier,
  purpose: messagingPurposeSchema,
  expectedVersion: z.number().int().positive(),
  expectedPayloadHash: sha256,
}).strict();
export type PreparePolicyBoundSms = z.infer<typeof preparePolicyBoundSmsSchema>;

export const messagingDeliveryStatusSchema = z.enum([
  "PREPARED",
  "QUEUED",
  "SENT",
  "DELIVERED",
  "FAILED",
]);
export type MessagingDeliveryStatus = z.infer<typeof messagingDeliveryStatusSchema>;

export const messagingDeliveryObservationSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  operationId: identifier,
  providerEventRef: z.string().regex(/^event_[a-f0-9]{64}$/u),
  status: messagingDeliveryStatusSchema,
  proofLevel: z.literal("SYNTHETIC_LOCAL"),
  observedAt: z.string().datetime(),
  externalTransportPerformed: z.literal(false),
}).strict();
export type MessagingDeliveryObservation = z.infer<typeof messagingDeliveryObservationSchema>;

export const messagingInboundResultSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  messageId: identifier,
  projectId: identifier.nullable(),
  status: z.enum(["APPLIED", "CLARIFICATION_REQUIRED", "SUPPRESSED", "HELP_PREPARED_UNSENT"]),
  keyword: z.enum(["STOP", "START_REVIEW_REQUIRED", "HELP", "NONE"]),
  mediaReferenceCount: z.number().int().nonnegative(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export const messagingPolicyResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: identifier,
  contactId: identifier,
  purpose: messagingPurposeSchema,
  consentStatus: messagingConsentStatusSchema,
  suppressionStatus: messagingSuppressionStatusSchema,
  stateVersion: z.number().int().positive(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export const policyBoundSmsResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: identifier,
  actionId: identifier,
  operationId: identifier,
  contactId: identifier,
  recipientRef: opaqueCommunicationIdentityRefSchema,
  maskedRecipient: z.string().min(3).max(40),
  body: z.string().min(1).max(1600),
  purpose: messagingPurposeSchema,
  consentStatus: z.literal("granted"),
  suppressionStatus: z.literal("allowed"),
  status: z.literal("PREPARED_UNSENT"),
  version: z.number().int().positive(),
  payloadHash: sha256,
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export const messagingDeliveryResultSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  operationId: identifier,
  status: messagingDeliveryStatusSchema,
  proofLevel: z.literal("SYNTHETIC_LOCAL"),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

const messagingPolicyProjectionSchema = z.object({
  contactId: identifier,
  contactName: z.string().min(1).max(240),
  purpose: messagingPurposeSchema,
  consentStatus: messagingConsentStatusSchema,
  suppressionStatus: messagingSuppressionStatusSchema,
  evidencePresent: z.boolean(),
  stateVersion: z.number().int().nonnegative(),
}).strict();

const messagingTimelineItemSchema = z.object({
  id: identifier,
  projectId: identifier.nullable(),
  contactId: identifier.nullable(),
  direction: z.enum(["inbound", "outbound"]),
  kind: z.enum(["SMS", "MMS"]),
  body: z.string().max(10_000),
  status: z.string().min(1).max(80),
  mediaReferenceCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
}).strict();

const messagingDeliveryProjectionSchema = z.object({
  operationId: identifier,
  status: messagingDeliveryStatusSchema,
  proofLevel: z.literal("SYNTHETIC_LOCAL"),
  observedAt: z.string().datetime(),
}).strict();

export const messagingCockpitSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: identifier,
  role: z.enum(["owner", "admin", "member", "field_worker"]),
  policies: z.array(messagingPolicyProjectionSchema),
  timeline: z.array(messagingTimelineItemSchema),
  deliveries: z.array(messagingDeliveryProjectionSchema),
  counts: z.object({
    messages: z.number().int().nonnegative(),
    suppressedContacts: z.number().int().nonnegative(),
    preparedUnsent: z.number().int().nonnegative(),
  }).strict(),
  externalTransportEnabled: z.literal(false),
  providerDeliveryObserved: z.literal(false),
  rawPhoneVisible: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.role === "field_worker" && (
    value.policies.length !== 0 || value.timeline.length !== 0 || value.deliveries.length !== 0
  )) {
    context.addIssue({ code: "custom", path: ["role"], message: "FIELD_MESSAGING_DETAILS_MUST_BE_EMPTY" });
  }
});
export type MessagingCockpit = z.infer<typeof messagingCockpitSchema>;

export const messagingApiCommandSchema = z.discriminatedUnion("action", [
  ...messagingPolicyCommandSchema.options,
  preparePolicyBoundSmsSchema,
]);

const messagingMobileBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
};

export const messagingMobileApiCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...messagingMobileBase,
    action: z.literal("RECORD_CONSENT_ATTESTATION"),
    contactId: identifier,
    purpose: messagingPurposeSchema,
    expectedStateVersion: z.number().int().nonnegative(),
    statementAccepted: z.literal(true),
  }).strict(),
  z.object({
    ...messagingMobileBase,
    action: z.literal("WITHDRAW_CONSENT"),
    contactId: identifier,
    purpose: messagingPurposeSchema,
    expectedStateVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(240),
  }).strict(),
  preparePolicyBoundSmsSchema,
]);
export type MessagingMobileApiCommand = z.infer<typeof messagingMobileApiCommandSchema>;

export const messagingMobileApiResultSchema = z.union([
  messagingPolicyResultSchema,
  policyBoundSmsResultSchema,
]);
