import { z } from "zod";

export const secretaryCapabilityKeySchema = z.enum([
  "SCHEDULE_QUERY",
  "GOOGLE_CALENDAR_QUERY",
  "CALENDAR_EVENT_CREATE",
  "PROJECT_RECORD_UPDATE",
  "SMS_SINGLE_PREPARE",
  "SMS_BROADCAST_PREPARE",
  "OUTBOUND_CALL_PREPARE",
]);
export type SecretaryCapabilityKey = z.infer<typeof secretaryCapabilityKeySchema>;

const effectClassSchema = z.enum(["READ", "INTERNAL_WRITE", "EXTERNAL_WRITE"]);
const connectorSchema = z.enum(["CANONICAL_SCHEDULE", "GOOGLE_CALENDAR", "SMS", "VOICE"]);

const capabilitySchema = z.object({
  key: secretaryCapabilityKeySchema,
  label: z.string().min(1),
  effectClass: effectClassSchema,
  connector: connectorSchema.nullable(),
  connectorGrantRequired: z.boolean(),
  approvalRequired: z.boolean(),
  verificationRequired: z.boolean(),
}).strict();

export function virtualSecretaryCapabilityCatalog() {
  return z.array(capabilitySchema).length(7).parse([
    { key: "SCHEDULE_QUERY", label: "Répondre sur ton horaire ENDVERA", effectClass: "READ", connector: "CANONICAL_SCHEDULE", connectorGrantRequired: false, approvalRequired: false, verificationRequired: false },
    { key: "GOOGLE_CALENDAR_QUERY", label: "Répondre sur Google Calendar", effectClass: "READ", connector: "GOOGLE_CALENDAR", connectorGrantRequired: true, approvalRequired: false, verificationRequired: false },
    { key: "CALENDAR_EVENT_CREATE", label: "Ajouter un rendez-vous", effectClass: "EXTERNAL_WRITE", connector: "GOOGLE_CALENDAR", connectorGrantRequired: true, approvalRequired: true, verificationRequired: true },
    { key: "PROJECT_RECORD_UPDATE", label: "Modifier un chantier", effectClass: "INTERNAL_WRITE", connector: null, connectorGrantRequired: false, approvalRequired: true, verificationRequired: true },
    { key: "SMS_SINGLE_PREPARE", label: "Texter une personne", effectClass: "EXTERNAL_WRITE", connector: "SMS", connectorGrantRequired: true, approvalRequired: true, verificationRequired: true },
    { key: "SMS_BROADCAST_PREPARE", label: "Texter jusqu’à 10 personnes", effectClass: "EXTERNAL_WRITE", connector: "SMS", connectorGrantRequired: true, approvalRequired: true, verificationRequired: true },
    { key: "OUTBOUND_CALL_PREPARE", label: "Faire un appel", effectClass: "EXTERNAL_WRITE", connector: "VOICE", connectorGrantRequired: true, approvalRequired: true, verificationRequired: true },
  ]);
}

const recipientSchema = z.object({
  contactId: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(160),
  communicationEligible: z.boolean(),
}).strict();

const baseCommand = {
  schemaVersion: z.literal(1),
  requestId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(240),
  workspaceId: z.string().trim().min(1).max(160),
};

export const virtualSecretaryActionCommandSchema = z.discriminatedUnion("capability", [
  z.object({ ...baseCommand, capability: z.literal("SCHEDULE_QUERY"), payload: z.object({ sourceReady: z.boolean() }).strict() }).strict(),
  z.object({ ...baseCommand, capability: z.literal("GOOGLE_CALENDAR_QUERY"), payload: z.object({ connectorReadGranted: z.boolean() }).strict() }).strict(),
  z.object({
    ...baseCommand,
    capability: z.literal("CALENDAR_EVENT_CREATE"),
    payload: z.object({
      connectorWriteGranted: z.boolean(),
      calendarId: z.string().trim().min(1).max(240),
      title: z.string().trim().min(1).max(500),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      timeZone: z.string().trim().min(1).max(100),
    }).strict(),
  }).strict(),
  z.object({
    ...baseCommand,
    capability: z.literal("PROJECT_RECORD_UPDATE"),
    payload: z.object({
      projectId: z.string().trim().min(1).max(160),
      expectedStateVersion: z.number().int().positive(),
      changeSummary: z.string().trim().min(1).max(2_000),
    }).strict(),
  }).strict(),
  z.object({
    ...baseCommand,
    capability: z.literal("SMS_SINGLE_PREPARE"),
    payload: z.object({ recipients: z.array(recipientSchema).max(50), message: z.string().trim().min(1).max(1_600) }).strict(),
  }).strict(),
  z.object({
    ...baseCommand,
    capability: z.literal("SMS_BROADCAST_PREPARE"),
    payload: z.object({ recipients: z.array(recipientSchema).max(50), message: z.string().trim().min(1).max(1_600) }).strict(),
  }).strict(),
  z.object({
    ...baseCommand,
    capability: z.literal("OUTBOUND_CALL_PREPARE"),
    payload: z.object({
      recipient: recipientSchema,
      objective: z.string().trim().min(1).max(1_000),
      assistantDisclosure: z.boolean(),
    }).strict(),
  }).strict(),
]);
export type VirtualSecretaryActionCommand = z.infer<typeof virtualSecretaryActionCommandSchema>;

export const virtualSecretaryPlanningContextSchema = z.object({
  actorVerified: z.boolean(),
  actorAuthorized: z.boolean(),
  workspaceBound: z.boolean(),
}).strict();

const previewSchema = z.object({
  channel: z.enum(["ENDVERA", "GOOGLE_CALENDAR", "SMS", "VOICE"]).nullable(),
  recipients: z.array(recipientSchema),
  target: z.string().nullable(),
  content: z.string().nullable(),
}).strict();

export const virtualSecretaryActionPlanSchema = z.object({
  schemaVersion: z.literal(1),
  requestId: z.string().uuid(),
  idempotencyKey: z.string().min(1),
  capability: secretaryCapabilityKeySchema,
  effectClass: effectClassSchema,
  outcome: z.enum(["ANSWER_READY", "CONNECTION_REQUIRED", "CLARIFICATION_REQUIRED", "PREPARED_ACTION", "REFUSAL", "HUMAN_HANDOFF"]),
  reasonCode: z.string().regex(/^R38B_[A-Z0-9_]+$/u),
  preview: previewSchema,
  approvalRequired: z.boolean(),
  verificationRequired: z.boolean(),
  evidenceLabel: z.literal("CODE"),
  externalTransportPerformed: z.literal(false),
}).strict();
export type VirtualSecretaryActionPlan = z.infer<typeof virtualSecretaryActionPlanSchema>;

const emptyPreview: z.infer<typeof previewSchema> = {
  channel: null,
  recipients: [],
  target: null,
  content: null,
};

function plan(
  command: VirtualSecretaryActionCommand,
  values: Omit<VirtualSecretaryActionPlan, "schemaVersion" | "requestId" | "idempotencyKey" | "capability" | "evidenceLabel" | "externalTransportPerformed">,
) {
  return virtualSecretaryActionPlanSchema.parse({
    schemaVersion: 1,
    requestId: command.requestId,
    idempotencyKey: command.idempotencyKey,
    capability: command.capability,
    evidenceLabel: "CODE",
    externalTransportPerformed: false,
    ...values,
  });
}

function refusal(command: VirtualSecretaryActionCommand, reasonCode: string) {
  const capability = virtualSecretaryCapabilityCatalog().find((item) => item.key === command.capability)!;
  return plan(command, {
    effectClass: capability.effectClass,
    outcome: "REFUSAL",
    reasonCode,
    preview: emptyPreview,
    approvalRequired: false,
    verificationRequired: false,
  });
}

function validateRecipients(command: VirtualSecretaryActionCommand, recipients: z.infer<typeof recipientSchema>[], mode: "SINGLE" | "BROADCAST") {
  if (recipients.length === 0) return refusal(command, "R38B_RECIPIENT_REQUIRED");
  if (mode === "SINGLE" && recipients.length !== 1) return refusal(command, "R38B_SINGLE_RECIPIENT_REQUIRED");
  if (mode === "BROADCAST" && recipients.length > 10) return refusal(command, "R38B_BROADCAST_LIMIT_REFUSED");
  if (new Set(recipients.map((item) => item.contactId)).size !== recipients.length) {
    return refusal(command, "R38B_DUPLICATE_RECIPIENT_REFUSED");
  }
  if (recipients.some((item) => !item.communicationEligible)) {
    return refusal(command, "R38B_RECIPIENT_NOT_ELIGIBLE");
  }
  return null;
}

export function planVirtualSecretaryAction(commandValue: unknown, contextValue: unknown): VirtualSecretaryActionPlan {
  const command = virtualSecretaryActionCommandSchema.parse(commandValue);
  const context = virtualSecretaryPlanningContextSchema.parse(contextValue);
  if (!context.actorVerified) return refusal(command, "R38B_ACTOR_NOT_VERIFIED");
  if (!context.workspaceBound) return refusal(command, "R38B_WORKSPACE_NOT_BOUND");
  if (!context.actorAuthorized) return refusal(command, "R38B_ACTOR_NOT_AUTHORIZED");

  if (command.capability === "SCHEDULE_QUERY") {
    return plan(command, {
      effectClass: "READ",
      outcome: command.payload.sourceReady ? "ANSWER_READY" : "CONNECTION_REQUIRED",
      reasonCode: command.payload.sourceReady ? "R38B_CANONICAL_SCHEDULE_READY" : "R38B_CANONICAL_SCHEDULE_SOURCE_REQUIRED",
      preview: { ...emptyPreview, channel: "ENDVERA", target: "Horaire canonique ENDVERA" },
      approvalRequired: false,
      verificationRequired: false,
    });
  }

  if (command.capability === "GOOGLE_CALENDAR_QUERY") {
    return plan(command, {
      effectClass: "READ",
      outcome: command.payload.connectorReadGranted ? "ANSWER_READY" : "CONNECTION_REQUIRED",
      reasonCode: command.payload.connectorReadGranted ? "R38B_GOOGLE_CALENDAR_READ_READY" : "R38B_GOOGLE_CALENDAR_READ_GRANT_REQUIRED",
      preview: { ...emptyPreview, channel: "GOOGLE_CALENDAR", target: "Google Calendar autorisé" },
      approvalRequired: false,
      verificationRequired: false,
    });
  }

  if (command.capability === "CALENDAR_EVENT_CREATE") {
    if (!command.payload.connectorWriteGranted) {
      return plan(command, { effectClass: "EXTERNAL_WRITE", outcome: "CONNECTION_REQUIRED", reasonCode: "R38B_GOOGLE_CALENDAR_WRITE_GRANT_REQUIRED", preview: emptyPreview, approvalRequired: false, verificationRequired: false });
    }
    if (Date.parse(command.payload.endAt) <= Date.parse(command.payload.startAt)) {
      return plan(command, { effectClass: "EXTERNAL_WRITE", outcome: "CLARIFICATION_REQUIRED", reasonCode: "R38B_CALENDAR_TIME_RANGE_INVALID", preview: emptyPreview, approvalRequired: false, verificationRequired: false });
    }
    return plan(command, {
      effectClass: "EXTERNAL_WRITE",
      outcome: "PREPARED_ACTION",
      reasonCode: "R38B_CALENDAR_EVENT_PREPARED",
      preview: { channel: "GOOGLE_CALENDAR", recipients: [], target: command.payload.calendarId, content: `${command.payload.title} · ${command.payload.startAt} → ${command.payload.endAt} · ${command.payload.timeZone}` },
      approvalRequired: true,
      verificationRequired: true,
    });
  }

  if (command.capability === "PROJECT_RECORD_UPDATE") {
    return plan(command, {
      effectClass: "INTERNAL_WRITE",
      outcome: "PREPARED_ACTION",
      reasonCode: "R38B_PROJECT_UPDATE_PREPARED",
      preview: { channel: "ENDVERA", recipients: [], target: `${command.payload.projectId}@${command.payload.expectedStateVersion}`, content: command.payload.changeSummary },
      approvalRequired: true,
      verificationRequired: true,
    });
  }

  if (command.capability === "SMS_SINGLE_PREPARE" || command.capability === "SMS_BROADCAST_PREPARE") {
    const mode = command.capability === "SMS_SINGLE_PREPARE" ? "SINGLE" : "BROADCAST";
    const refused = validateRecipients(command, command.payload.recipients, mode);
    if (refused) return refused;
    return plan(command, {
      effectClass: "EXTERNAL_WRITE",
      outcome: "PREPARED_ACTION",
      reasonCode: mode === "SINGLE" ? "R38B_SMS_SINGLE_PREPARED" : "R38B_SMS_BROADCAST_PREPARED",
      preview: { channel: "SMS", recipients: command.payload.recipients, target: mode === "SINGLE" ? "1 personne" : `${command.payload.recipients.length} personnes`, content: command.payload.message },
      approvalRequired: true,
      verificationRequired: true,
    });
  }

  const refused = validateRecipients(command, [command.payload.recipient], "SINGLE");
  if (refused) return refused;
  if (!command.payload.assistantDisclosure) return refusal(command, "R38B_ASSISTANT_DISCLOSURE_REQUIRED");
  return plan(command, {
    effectClass: "EXTERNAL_WRITE",
    outcome: "PREPARED_ACTION",
    reasonCode: "R38B_OUTBOUND_CALL_PREPARED",
    preview: { channel: "VOICE", recipients: [command.payload.recipient], target: command.payload.recipient.displayName, content: `Appel de l’assistant ENDVERA · ${command.payload.objective}` },
    approvalRequired: true,
    verificationRequired: true,
  });
}
