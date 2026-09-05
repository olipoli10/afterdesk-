import { z } from "zod";

const entryChannelSchema = z.object({
  key: z.enum(["APP_CHAT", "DEDICATED_SMS"]),
  label: z.string().min(1),
  readiness: z.enum(["LOCAL_AVAILABLE", "NOT_PROVISIONED"]),
  deviceSmsPermissionRequired: z.literal(false),
  externalTransportPerformed: z.literal(false),
}).strict();

const protectedResourceSchema = z.object({
  key: z.enum([
    "NOTIFICATIONS",
    "MICROPHONE",
    "SELECTED_CONTACTS",
    "CALENDAR_READ",
    "CALENDAR_WRITE",
    "SELECTED_FILES",
  ]),
  purpose: z.string().min(1),
  requestTiming: z.literal("ON_FIRST_USE"),
  state: z.enum(["NOT_REQUESTED", "CONNECTOR_NOT_CONFIGURED"]),
  revocationRoute: z.string().min(1),
}).strict();

export const textAssistLaneSchema = z.enum([
  "CANONICAL_OPERATIONS",
  "EXTERNAL_RESEARCH",
  "DOCUMENT_ANALYSIS",
  "GENERAL_REASONING",
  "HUMAN_ESCALATION",
]);
export type TextAssistLane = z.infer<typeof textAssistLaneSchema>;

const routeLaneSchema = z.object({
  lane: textAssistLaneSchema,
  providerRequired: z.boolean(),
  allowedDataClasses: z.array(z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL"])).min(1),
  outcomes: z.array(z.enum(["ANSWER", "CLARIFICATION", "PREPARED_ACTION", "REFUSAL", "HUMAN_HANDOFF"])).min(1),
}).strict();

export const textAssistFoundationManifestSchema = z.object({
  schemaVersion: z.literal(1),
  productMode: z.literal("ASSISTANT_FIRST"),
  entryChannels: z.array(entryChannelSchema).length(2),
  protectedResources: z.array(protectedResourceSchema).length(6),
  forbiddenDevicePermissions: z.array(z.enum(["READ_SMS", "WRITE_SMS", "READ_CALL_LOG", "WRITE_CALL_LOG"])).length(4),
  modelGateway: z.object({
    architecture: z.literal("PROVIDER_NEUTRAL"),
    candidate: z.literal("OPENROUTER"),
    readiness: z.literal("DISABLED_LOCAL"),
    secretLocation: z.literal("SERVER_ONLY"),
    budgetEnforced: z.literal(true),
    dataPolicyRequired: z.literal(true),
  }).strict(),
  routeLanes: z.array(routeLaneSchema).length(5),
  actionBoundary: z.object({
    identityCheckedAtUse: z.literal(true),
    workspaceCheckedAtUse: z.literal(true),
    externalWritePreviewRequired: z.literal(true),
    externalWriteApprovalRequired: z.literal(true),
    idempotencyRequired: z.literal(true),
    postconditionVerificationRequired: z.literal(true),
    auditRequired: z.literal(true),
  }).strict(),
  externalTransportPerformed: z.literal(false),
}).strict();
export type TextAssistFoundationManifest = z.infer<typeof textAssistFoundationManifestSchema>;

export function textAssistFoundationManifest(): TextAssistFoundationManifest {
  return textAssistFoundationManifestSchema.parse({
    schemaVersion: 1,
    productMode: "ASSISTANT_FIRST",
    entryChannels: [
      {
        key: "APP_CHAT",
        label: "Conversation dans l’application",
        readiness: "LOCAL_AVAILABLE",
        deviceSmsPermissionRequired: false,
        externalTransportPerformed: false,
      },
      {
        key: "DEDICATED_SMS",
        label: "Numéro ENDVERA dédié",
        readiness: "NOT_PROVISIONED",
        deviceSmsPermissionRequired: false,
        externalTransportPerformed: false,
      },
    ],
    protectedResources: [
      { key: "NOTIFICATIONS", purpose: "Recevoir les suivis ENDVERA choisis.", requestTiming: "ON_FIRST_USE", state: "NOT_REQUESTED", revocationRoute: "Réglages du téléphone" },
      { key: "MICROPHONE", purpose: "Enregistrer seulement la note vocale choisie.", requestTiming: "ON_FIRST_USE", state: "NOT_REQUESTED", revocationRoute: "Réglages du téléphone" },
      { key: "SELECTED_CONTACTS", purpose: "Résoudre les personnes que l’utilisateur partage.", requestTiming: "ON_FIRST_USE", state: "NOT_REQUESTED", revocationRoute: "Permissions ENDVERA" },
      { key: "CALENDAR_READ", purpose: "Répondre aux questions d’agenda autorisées.", requestTiming: "ON_FIRST_USE", state: "CONNECTOR_NOT_CONFIGURED", revocationRoute: "Calendriers connectés" },
      { key: "CALENDAR_WRITE", purpose: "Préparer puis appliquer un changement de calendrier approuvé.", requestTiming: "ON_FIRST_USE", state: "CONNECTOR_NOT_CONFIGURED", revocationRoute: "Calendriers connectés" },
      { key: "SELECTED_FILES", purpose: "Analyser seulement les fichiers choisis.", requestTiming: "ON_FIRST_USE", state: "NOT_REQUESTED", revocationRoute: "Sources du chantier" },
    ],
    forbiddenDevicePermissions: ["READ_SMS", "WRITE_SMS", "READ_CALL_LOG", "WRITE_CALL_LOG"],
    modelGateway: {
      architecture: "PROVIDER_NEUTRAL",
      candidate: "OPENROUTER",
      readiness: "DISABLED_LOCAL",
      secretLocation: "SERVER_ONLY",
      budgetEnforced: true,
      dataPolicyRequired: true,
    },
    routeLanes: [
      { lane: "CANONICAL_OPERATIONS", providerRequired: false, allowedDataClasses: ["INTERNAL", "CONFIDENTIAL"], outcomes: ["ANSWER", "CLARIFICATION", "PREPARED_ACTION", "REFUSAL"] },
      { lane: "EXTERNAL_RESEARCH", providerRequired: true, allowedDataClasses: ["PUBLIC"], outcomes: ["ANSWER", "CLARIFICATION", "REFUSAL"] },
      { lane: "DOCUMENT_ANALYSIS", providerRequired: true, allowedDataClasses: ["INTERNAL", "CONFIDENTIAL"], outcomes: ["ANSWER", "CLARIFICATION", "REFUSAL"] },
      { lane: "GENERAL_REASONING", providerRequired: true, allowedDataClasses: ["PUBLIC", "INTERNAL"], outcomes: ["ANSWER", "CLARIFICATION", "REFUSAL"] },
      { lane: "HUMAN_ESCALATION", providerRequired: false, allowedDataClasses: ["INTERNAL", "CONFIDENTIAL"], outcomes: ["HUMAN_HANDOFF", "REFUSAL"] },
    ],
    actionBoundary: {
      identityCheckedAtUse: true,
      workspaceCheckedAtUse: true,
      externalWritePreviewRequired: true,
      externalWriteApprovalRequired: true,
      idempotencyRequired: true,
      postconditionVerificationRequired: true,
      auditRequired: true,
    },
    externalTransportPerformed: false,
  });
}

export const textAssistRouteInputSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  senderVerified: z.boolean(),
  workspaceBound: z.boolean(),
  hasSelectedDocument: z.boolean().default(false),
  requestsExternalWrite: z.boolean().default(false),
}).strict();

export const textAssistRouteDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  lane: textAssistLaneSchema.nullable(),
  outcome: z.enum(["ROUTE_READY", "CLARIFICATION", "PREPARED_ACTION", "REFUSAL"]),
  readiness: z.enum(["LOCAL_READY", "PROVIDER_REQUIRED_NOT_AUTHORIZED", "IDENTITY_REQUIRED", "WORKSPACE_REQUIRED"]),
  reasonCode: z.string().regex(/^R38A_[A-Z0-9_]+$/u),
  exactPreviewRequired: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();
export type TextAssistRouteDecision = z.infer<typeof textAssistRouteDecisionSchema>;

const RESEARCH = /\b(recherche|cherche|trouve|internet|web|actualité|latest|current|find|search)\b/iu;
const CANONICAL = /\b(calendrier|agenda|rendez-vous|chantier|projet|contact|marc|demain|rappel|calendar|appointment|project|contact|tomorrow|reminder)\b/iu;
const HUMAN = /\b(humain|personne|opérateur|support humain|human|operator)\b/iu;

export function classifyTextAssistRequest(value: unknown): TextAssistRouteDecision {
  const input = textAssistRouteInputSchema.parse(value);
  if (!input.senderVerified) {
    return textAssistRouteDecisionSchema.parse({ schemaVersion: 1, lane: null, outcome: "REFUSAL", readiness: "IDENTITY_REQUIRED", reasonCode: "R38A_SENDER_NOT_VERIFIED", exactPreviewRequired: false, externalTransportPerformed: false });
  }
  if (!input.workspaceBound) {
    return textAssistRouteDecisionSchema.parse({ schemaVersion: 1, lane: null, outcome: "REFUSAL", readiness: "WORKSPACE_REQUIRED", reasonCode: "R38A_WORKSPACE_NOT_BOUND", exactPreviewRequired: false, externalTransportPerformed: false });
  }
  if (input.requestsExternalWrite) {
    return textAssistRouteDecisionSchema.parse({ schemaVersion: 1, lane: "CANONICAL_OPERATIONS", outcome: "PREPARED_ACTION", readiness: "LOCAL_READY", reasonCode: "R38A_EXTERNAL_WRITE_PREPARED_ONLY", exactPreviewRequired: true, externalTransportPerformed: false });
  }
  if (input.hasSelectedDocument) {
    return textAssistRouteDecisionSchema.parse({ schemaVersion: 1, lane: "DOCUMENT_ANALYSIS", outcome: "REFUSAL", readiness: "PROVIDER_REQUIRED_NOT_AUTHORIZED", reasonCode: "R38A_DOCUMENT_PROVIDER_DISABLED", exactPreviewRequired: false, externalTransportPerformed: false });
  }
  if (HUMAN.test(input.body)) {
    return textAssistRouteDecisionSchema.parse({ schemaVersion: 1, lane: "HUMAN_ESCALATION", outcome: "ROUTE_READY", readiness: "LOCAL_READY", reasonCode: "R38A_HUMAN_HANDOFF_READY", exactPreviewRequired: false, externalTransportPerformed: false });
  }
  if (RESEARCH.test(input.body)) {
    return textAssistRouteDecisionSchema.parse({ schemaVersion: 1, lane: "EXTERNAL_RESEARCH", outcome: "REFUSAL", readiness: "PROVIDER_REQUIRED_NOT_AUTHORIZED", reasonCode: "R38A_RESEARCH_PROVIDER_DISABLED", exactPreviewRequired: false, externalTransportPerformed: false });
  }
  if (CANONICAL.test(input.body)) {
    return textAssistRouteDecisionSchema.parse({ schemaVersion: 1, lane: "CANONICAL_OPERATIONS", outcome: "ROUTE_READY", readiness: "LOCAL_READY", reasonCode: "R38A_CANONICAL_ROUTE_READY", exactPreviewRequired: false, externalTransportPerformed: false });
  }
  return textAssistRouteDecisionSchema.parse({ schemaVersion: 1, lane: "GENERAL_REASONING", outcome: "REFUSAL", readiness: "PROVIDER_REQUIRED_NOT_AUTHORIZED", reasonCode: "R38A_GENERAL_PROVIDER_DISABLED", exactPreviewRequired: false, externalTransportPerformed: false });
}
