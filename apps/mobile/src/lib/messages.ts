import { z } from "zod";
import type { MobileWorkspace } from "@/lib/contracts";
import type { MobilePreparedActionInspection } from "@/lib/prepared-actions";

const identifier = z.string().min(1).max(200);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const purposeSchema = z.enum(["service", "commercial"]);

const policySchema = z.object({
  contactId: identifier,
  contactName: z.string().min(1).max(240),
  purpose: purposeSchema,
  consentStatus: z.enum(["unknown", "granted", "withdrawn"]),
  suppressionStatus: z.enum(["allowed", "suppressed", "review_required"]),
  evidencePresent: z.boolean(),
  stateVersion: z.number().int().nonnegative(),
}).strict();

const timelineSchema = z.object({
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

const deliverySchema = z.object({
  operationId: identifier,
  status: z.enum(["PREPARED", "QUEUED", "SENT", "DELIVERED", "FAILED"]),
  proofLevel: z.literal("SYNTHETIC_LOCAL"),
  observedAt: z.string().datetime(),
}).strict();

const cockpitSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1).max(160),
  role: z.enum(["owner", "admin", "member", "field_worker"]),
  policies: z.array(policySchema),
  timeline: z.array(timelineSchema),
  deliveries: z.array(deliverySchema),
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

const FIELD_FORBIDDEN_KEYS = new Set([
  "body",
  "contactId",
  "contactName",
  "recipient",
  "recipientRef",
  "normalizedPhone",
  "phone",
  "evidenceRef",
  "providerEventRef",
]);

function containsFieldLeak(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsFieldLeak);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) => FIELD_FORBIDDEN_KEYS.has(key) || containsFieldLeak(nested),
  );
}

export function parseMobileMessagingCockpit(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { role?: unknown }).role === "field_worker" &&
    containsFieldLeak(value)
  ) {
    throw new Error("MOBILE_MESSAGING_FIELD_LEAK_REFUSED");
  }
  return cockpitSchema.parse(value);
}

const commandBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
};

export const mobileMessagingCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...commandBase,
    action: z.literal("RECORD_CONSENT_ATTESTATION"),
    contactId: identifier,
    purpose: purposeSchema,
    expectedStateVersion: z.number().int().nonnegative(),
    statementAccepted: z.literal(true),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("WITHDRAW_CONSENT"),
    contactId: identifier,
    purpose: purposeSchema,
    expectedStateVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(240),
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("PREPARE_POLICY_BOUND_SMS"),
    actionId: identifier,
    purpose: purposeSchema,
    expectedVersion: z.number().int().positive(),
    expectedPayloadHash: sha256,
  }).strict(),
]);

const policyResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: identifier,
  contactId: identifier,
  purpose: purposeSchema,
  consentStatus: z.enum(["unknown", "granted", "withdrawn"]),
  suppressionStatus: z.enum(["allowed", "suppressed", "review_required"]),
  stateVersion: z.number().int().positive(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

const preparedSmsResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: identifier,
  actionId: identifier,
  operationId: identifier,
  contactId: identifier,
  recipientRef: z.string().regex(/^ref_[a-f0-9]{64}$/u),
  maskedRecipient: z.string().min(3).max(40),
  body: z.string().min(1).max(1600),
  purpose: purposeSchema,
  consentStatus: z.literal("granted"),
  suppressionStatus: z.literal("allowed"),
  status: z.literal("PREPARED_UNSENT"),
  version: z.number().int().positive(),
  payloadHash: sha256,
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export const mobileMessagingCommandResultSchema = z.union([
  policyResultSchema,
  preparedSmsResultSchema,
]);

export type MobileMessagingCockpit = ReturnType<typeof parseMobileMessagingCockpit>;
export type MobileMessagingPolicy = z.infer<typeof policySchema>;
export type MobileMessagingCommand = z.infer<typeof mobileMessagingCommandSchema>;
export type MobileMessagingCommandResult = z.infer<typeof mobileMessagingCommandResultSchema>;

function assertManager(workspace: MobileWorkspace) {
  if (workspace.role !== "OWNER" && workspace.role !== "OFFICE_MANAGER") {
    throw new Error("MOBILE_MESSAGING_PERMISSION_REFUSED");
  }
}

export function createConsentAttestationCommand(input: {
  workspace: MobileWorkspace;
  commandId: string;
  contactId: string;
  purpose: "service" | "commercial";
  expectedStateVersion: number;
}) {
  assertManager(input.workspace);
  return mobileMessagingCommandSchema.parse({
    schemaVersion: 1,
    action: "RECORD_CONSENT_ATTESTATION",
    commandId: input.commandId,
    workspaceId: input.workspace.id,
    contactId: input.contactId,
    purpose: input.purpose,
    expectedStateVersion: input.expectedStateVersion,
    statementAccepted: true,
  });
}

export function createConsentWithdrawalCommand(input: {
  workspace: MobileWorkspace;
  commandId: string;
  contactId: string;
  purpose: "service" | "commercial";
  expectedStateVersion: number;
  reason: string;
}) {
  assertManager(input.workspace);
  return mobileMessagingCommandSchema.parse({
    schemaVersion: 1,
    action: "WITHDRAW_CONSENT",
    commandId: input.commandId,
    workspaceId: input.workspace.id,
    contactId: input.contactId,
    purpose: input.purpose,
    expectedStateVersion: input.expectedStateVersion,
    reason: input.reason,
  });
}

export function createPolicyBoundSmsCommand(input: {
  workspace: MobileWorkspace;
  commandId: string;
  action: MobilePreparedActionInspection;
  purpose: "service" | "commercial";
}) {
  assertManager(input.workspace);
  if (input.action.workspaceId !== input.workspace.id || input.action.channel !== "SMS") {
    throw new Error("MOBILE_MESSAGING_ACTION_REFUSED");
  }
  if (input.action.state !== "APPROVED_UNSENT") {
    throw new Error("MOBILE_MESSAGING_EXACT_APPROVAL_REQUIRED");
  }
  return mobileMessagingCommandSchema.parse({
    schemaVersion: 1,
    action: "PREPARE_POLICY_BOUND_SMS",
    commandId: input.commandId,
    workspaceId: input.workspace.id,
    actionId: input.action.actionId,
    purpose: input.purpose,
    expectedVersion: input.action.version,
    expectedPayloadHash: input.action.fingerprint,
  });
}
