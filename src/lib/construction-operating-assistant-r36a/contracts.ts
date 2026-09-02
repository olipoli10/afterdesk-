import { z } from "zod";

export const ASSISTANT_CHANNELS = [
  "PORTAL",
  "MOBILE_APP",
  "SMS",
  "VOICE_TRANSCRIPT",
  "EMAIL",
] as const;

export const ASSISTANT_INTENT_CLASSES = [
  "CANONICAL_STATE_QUERY",
  "CALENDAR_OPERATION",
  "COMMUNICATION_DRAFT",
  "PUBLIC_WEB_RESEARCH",
  "DOCUMENT_UNDERSTANDING",
  "COMPLEX_REASONING",
  "MIXED_CONSEQUENTIAL",
  "RESTRICTED_PERSONAL_RESEARCH",
  "UNSUPPORTED",
] as const;

export const ASSISTANT_CAPABILITY_KEYS = [
  "CANONICAL_STATE",
  "CALENDAR",
  "COMMUNICATION_PREPARATION",
  "WEB_RESEARCH",
  "DOCUMENT_UNDERSTANDING",
  "CONTROLLER_REASONING",
  "HUMAN_ESCALATION",
] as const;

export const ASSISTANT_DATA_CLASSES = [
  "public",
  "business_confidential",
  "personal_data",
  "restricted_sensitive",
] as const;

export const ASSISTANT_PRIVACY_REQUIREMENTS = [
  "standard",
  "no_training",
  "zero_retention",
  "regional_zero_retention",
] as const;

export const ASSISTANT_RISK_CLASSES = ["low", "medium", "high", "prohibited"] as const;

export const ASSISTANT_ROUTING_DISPOSITIONS = [
  "INTERNAL_TOOL",
  "CANDIDATE_PREPARED",
  "HUMAN_HANDOFF",
  "CLARIFICATION_REQUIRED",
  "REFUSED",
] as const;

export const ASSISTANT_ROUTING_REASON_CODES = [
  "CANONICAL_TRUTH_FIRST",
  "DETERMINISTIC_TOOL_FIRST",
  "SPECIALIST_RESEARCH_PREFERRED",
  "STRONGEST_ELIGIBLE_CONTROLLER",
  "EXTERNAL_AUTHORITY_REQUIRED",
  "BOUNDED_HUMAN_FALLBACK",
  "MIXED_INTENT_REQUIRES_SPLIT",
  "RESTRICTED_PERSONAL_DATA",
  "UNSUPPORTED_INTENT",
  "NO_ELIGIBLE_ROUTE",
  "BUDGET_CEILING",
] as const;

export const assistantRoutingRequestSchema = z.object({
  schemaVersion: z.literal(1),
  requestId: z.string().uuid(),
  workspaceId: z.string().min(1).max(191),
  actorId: z.string().min(1).max(191),
  channel: z.enum(ASSISTANT_CHANNELS),
  message: z.string().trim().min(1).max(8_000),
  declaredDataClass: z.enum(ASSISTANT_DATA_CLASSES),
  privacyRequirement: z.enum(ASSISTANT_PRIVACY_REQUIREMENTS),
  riskClass: z.enum(ASSISTANT_RISK_CLASSES),
  maxTotalCostMicros: z.number().int().nonnegative().max(1_000_000_000),
  policyKey: z.literal("assistant-routing-r36a-v1"),
  acceptedAt: z.string().datetime({ offset: true }),
}).strict();

export const assistantRouteSelectionSchema = z.object({
  routeKey: z.string().min(1),
  adapterKey: z.string().min(1),
  modelKey: z.string().min(1),
  routeVersion: z.number().int().positive(),
  external: z.boolean(),
  candidateOnly: z.boolean(),
  estimatedCostMicros: z.number().int().nonnegative(),
}).strict();

export const humanHandoffPlanSchema = z.object({
  capabilityKey: z.literal("HUMAN_ESCALATION"),
  expectedOutputContract: z.string().min(1),
  verificationChecks: z.array(z.string().min(1)).min(1).max(8),
  resumePoint: z.string().min(1),
  contextFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
}).strict();

export const assistantRoutingDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  requestId: z.string().uuid(),
  workspaceId: z.string().min(1),
  requestFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  intentClass: z.enum(ASSISTANT_INTENT_CLASSES),
  capabilityKey: z.enum(ASSISTANT_CAPABILITY_KEYS).nullable(),
  effectiveDataClass: z.enum(ASSISTANT_DATA_CLASSES),
  effectivePrivacyRequirement: z.enum(ASSISTANT_PRIVACY_REQUIREMENTS),
  riskClass: z.enum(ASSISTANT_RISK_CLASSES),
  disposition: z.enum(ASSISTANT_ROUTING_DISPOSITIONS),
  reasonCode: z.enum(ASSISTANT_ROUTING_REASON_CODES),
  selectedRoute: assistantRouteSelectionSchema.nullable(),
  fallbackRouteKeys: z.array(z.string().min(1)).max(8),
  citationsRequired: z.boolean(),
  approvalRequired: z.boolean(),
  maxTotalCostMicros: z.number().int().nonnegative(),
  policyKey: z.literal("assistant-routing-r36a-v1"),
  policyHash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  routeHash: z.string().regex(/^sha256:[0-9a-f]{64}$/u).nullable(),
  decisionFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  humanHandoff: humanHandoffPlanSchema.nullable(),
  providerExecutionAuthorized: z.literal(false),
  externalDispatchPerformed: z.literal(false),
}).strict();

export type AssistantRoutingRequest = z.infer<typeof assistantRoutingRequestSchema>;
export type AssistantRoutingDecision = z.infer<typeof assistantRoutingDecisionSchema>;
export type AssistantIntentClass = (typeof ASSISTANT_INTENT_CLASSES)[number];
export type AssistantCapabilityKey = (typeof ASSISTANT_CAPABILITY_KEYS)[number];
export type AssistantDataClass = (typeof ASSISTANT_DATA_CLASSES)[number];
export type AssistantPrivacyRequirement = (typeof ASSISTANT_PRIVACY_REQUIREMENTS)[number];
export type AssistantRiskClass = (typeof ASSISTANT_RISK_CLASSES)[number];

