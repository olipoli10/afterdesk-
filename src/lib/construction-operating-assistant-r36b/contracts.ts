import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export const R36B_PROVIDER_KEYS = [
  "PERPLEXITY_SEARCH",
  "OPENROUTER_CONTROLLER",
  "DIRECT_CONTROLLER_CONTROL",
] as const;

export const R36B_ENDPOINT_FAMILIES = [
  "PERPLEXITY_SEARCH_API",
  "OPENROUTER_CHAT_COMPLETIONS",
  "DIRECT_CHAT_COMPLETIONS_CONTROL",
] as const;

export const R36B_DATA_CLASSES = [
  "public",
  "business_confidential",
  "personal_data",
  "restricted_sensitive",
] as const;

export function r36bFingerprint(value: unknown): `sha256:${string}` {
  return `sha256:${sha256Canonical(value)}`;
}

const fingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const officialEvidenceSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith("https://"), "HTTPS evidence required"),
  title: z.string().trim().min(1).max(160),
  reviewedAt: z.string().date(),
  expiresAt: z.string().date(),
}).strict();

export const providerCandidatePacketUnsignedSchema = z.object({
  schemaVersion: z.literal(1),
  packetVersion: z.string().regex(/^r36b-v\d+$/u),
  providerKey: z.enum(R36B_PROVIDER_KEYS),
  capabilityKey: z.enum(["PUBLIC_WEB_RESEARCH", "CONTROLLER_REASONING"]),
  endpointFamily: z.enum(R36B_ENDPOINT_FAMILIES),
  allowedDataClasses: z.array(z.enum(R36B_DATA_CLASSES)).min(1).max(3),
  forbiddenDataClasses: z.array(z.enum(R36B_DATA_CLASSES)).min(1).max(3),
  requiredPrivacyRules: z.array(z.enum([
    "PUBLIC_SOURCES_ONLY",
    "PROFESSIONAL_CONTEXT_ONLY",
    "NO_TRAINING",
    "ZERO_DATA_RETENTION",
    "DATA_COLLECTION_DENIED",
    "SUPPORTED_PARAMETERS_REQUIRED",
    "PROVIDER_FALLBACK_DISABLED",
  ])).min(1).max(8),
  perAttemptCostCeilingMicros: z.number().int().positive().max(5_000_000),
  outputContractKey: z.string().min(1).max(100),
  verificationContractKey: z.string().min(1).max(100),
  officialEvidence: z.array(officialEvidenceSchema).min(1).max(8),
  evidenceLabel: z.literal("INFERRED"),
  candidateOnly: z.literal(true),
  providerExecutionAuthorized: z.literal(false),
  externalDispatchPerformed: z.literal(false),
}).strict();

export const providerCandidatePacketSchema = providerCandidatePacketUnsignedSchema.extend({
  packetFingerprint: fingerprintSchema,
}).strict();

export const sandboxCeilingsSchema = z.object({
  maxLatencyMs: z.number().int().positive().max(120_000),
  maxCostMicros: z.number().int().positive().max(5_000_000),
  maxOutputTokens: z.number().int().positive().max(16_000),
  maxSources: z.number().int().positive().max(20),
}).strict();

export const sandboxCaseUnsignedSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: z.string().regex(/^R36B-[A-Z0-9-]+$/u),
  caseVersion: z.literal(1),
  intent: z.enum(["PUBLIC_BUSINESS_RESEARCH", "PUBLIC_PROFESSIONAL_RESEARCH", "CONTROLLER_REASONING"]),
  locale: z.literal("fr-CA"),
  region: z.literal("CA"),
  orderedFacts: z.array(z.object({ key: z.string().min(1).max(80), value: z.string().min(1).max(400) }).strict()).min(1).max(20),
  dataClass: z.enum(R36B_DATA_CLASSES),
  outputContractKey: z.string().min(1).max(100),
  ceilings: sandboxCeilingsSchema,
  syntheticOnly: z.literal(true),
}).strict();

export const sandboxCaseSchema = sandboxCaseUnsignedSchema.extend({
  caseFingerprint: fingerprintSchema,
  ceilingFingerprint: fingerprintSchema,
}).strict();

const requestPlanCommon = {
  schemaVersion: z.literal(1),
  planId: z.string().uuid(),
  packetFingerprint: fingerprintSchema,
  caseFingerprint: fingerprintSchema,
  ceilingFingerprint: fingerprintSchema,
  secretReferenceName: z.string().regex(/^R37_[A-Z0-9_]+_API_KEY$/u),
  dispatchable: z.literal(false),
  credentialResolved: z.literal(false),
  providerExecutionAuthorized: z.literal(false),
  externalDispatchPerformed: z.literal(false),
};

export const perplexityRequestPlanUnsignedSchema = z.object({
  ...requestPlanCommon,
  providerKey: z.literal("PERPLEXITY_SEARCH"),
  endpointFamily: z.literal("PERPLEXITY_SEARCH_API"),
  method: z.literal("POST"),
  path: z.literal("/search"),
  payload: z.object({
    query: z.string().trim().min(1).max(500),
    country: z.literal("CA"),
    searchLanguageFilter: z.tuple([z.literal("fr"), z.literal("en")]),
    maxResults: z.number().int().min(1).max(20),
    maxTokens: z.number().int().min(64).max(16_000),
    maxTokensPerPage: z.number().int().min(64).max(4_000),
    searchType: z.enum(["web", "people"]),
  }).strict(),
}).strict();

export const openRouterRequestPlanUnsignedSchema = z.object({
  ...requestPlanCommon,
  providerKey: z.literal("OPENROUTER_CONTROLLER"),
  endpointFamily: z.literal("OPENROUTER_CHAT_COMPLETIONS"),
  method: z.literal("POST"),
  path: z.literal("/api/v1/chat/completions"),
  payload: z.object({
    modelProfileKey: z.literal("FRONTIER_CONTROLLER_PRIMARY_CANDIDATE"),
    providerModelId: z.null(),
    modelBindingState: z.literal("R37_SELECTION_REQUIRED"),
    orderedFacts: z.array(z.object({ key: z.string().min(1), value: z.string().min(1) }).strict()).min(1).max(20),
    responseContractKey: z.string().min(1).max(100),
    provider: z.object({
      allowFallbacks: z.literal(false),
      requireParameters: z.literal(true),
      dataCollection: z.literal("deny"),
      zdr: z.literal(true),
    }).strict(),
  }).strict(),
}).strict();

export const providerRequestPlanSchema = z.discriminatedUnion("providerKey", [
  perplexityRequestPlanUnsignedSchema.extend({ planFingerprint: fingerprintSchema }).strict(),
  openRouterRequestPlanUnsignedSchema.extend({ planFingerprint: fingerprintSchema }).strict(),
]);

export const normalizedSourceEvidenceUnsignedSchema = z.object({
  title: z.string().trim().min(1).max(240),
  url: z.string().url().refine((value) => /^https?:\/\//u.test(value), "HTTP(S) source required"),
  snippet: z.string().trim().min(1).max(1_200),
  sourceDate: z.string().date().nullable(),
}).strict();

export const normalizedSourceEvidenceSchema = normalizedSourceEvidenceUnsignedSchema.extend({
  sourceFingerprint: fingerprintSchema,
}).strict();

export const candidateObservationUnsignedSchema = z.object({
  schemaVersion: z.literal(1),
  providerKey: z.enum(R36B_PROVIDER_KEYS),
  packetFingerprint: fingerprintSchema,
  caseFingerprint: fingerprintSchema,
  ceilingFingerprint: fingerprintSchema,
  responseFixtureFingerprint: fingerprintSchema,
  evidenceLabel: z.literal("SYNTHETIC"),
  latencyMs: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  contractValid: z.boolean(),
  citationCoverageBps: z.number().int().min(0).max(10_000),
  unsupportedClaimCount: z.number().int().nonnegative(),
  failureClass: z.enum(["NONE", "CONTRACT_INVALID", "UNSUPPORTED_CLAIM", "BUDGET_EXCEEDED", "LATENCY_EXCEEDED"]),
  normalizedOutputFingerprint: fingerprintSchema,
}).strict();

export const candidateObservationSchema = candidateObservationUnsignedSchema.extend({
  observationFingerprint: fingerprintSchema,
}).strict();

export type ProviderCandidatePacket = z.infer<typeof providerCandidatePacketSchema>;
export type SandboxCase = z.infer<typeof sandboxCaseSchema>;
export type ProviderRequestPlan = z.infer<typeof providerRequestPlanSchema>;
export type CandidateObservation = z.infer<typeof candidateObservationSchema>;
