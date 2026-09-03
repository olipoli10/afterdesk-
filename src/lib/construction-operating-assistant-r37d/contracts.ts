import { z } from "zod";
import { normalizedSourceEvidenceSchema } from "@/lib/construction-operating-assistant-r36b/contracts";
import { sealedSyntheticAttemptSchema } from "@/lib/construction-operating-assistant-r37c/contracts";

const fingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const normalizeProviderFixtureInputSchema = z.object({
  candidateKey: z.enum(["OPENROUTER_CONTROLLER", "PERPLEXITY_SEARCH"]),
  sealed: sealedSyntheticAttemptSchema,
  fixture: z.unknown(),
  latencyMs: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
}).strict();

export const openRouterSyntheticFixtureSchema = z.object({
  responseId: z.string().trim().min(1).max(160),
  model: z.string().trim().min(1).max(160),
  providerRoute: z.literal("OPENROUTER_CONTROLLER"),
  choices: z.tuple([
    z.object({
      index: z.literal(0),
      finishReason: z.enum(["stop", "length"]),
      message: z.object({
        role: z.literal("assistant"),
        content: z.string().trim().min(1),
      }).strict(),
    }).strict(),
  ]),
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().positive(),
  }).strict(),
  externalTransportPerformed: z.literal(false),
}).strict();

export const perplexitySyntheticFixtureSchema = z.object({
  responseId: z.string().trim().min(1).max(160),
  providerRoute: z.literal("PERPLEXITY_SEARCH"),
  answer: z.string().trim().min(1),
  citations: z.array(z.string().url()).min(1),
  results: z.array(z.object({
    title: z.string().trim().min(1).max(240),
    url: z.string().url(),
    snippet: z.string().trim().min(1).max(1_200),
    sourceDate: z.string().date().nullable(),
  }).strict()).min(1).max(20),
  externalTransportPerformed: z.literal(false),
}).strict();

export const canonicalProviderEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  evidenceLabel: z.literal("SYNTHETIC"),
  certified: z.literal(false),
  candidateKey: z.enum(["OPENROUTER_CONTROLLER", "PERPLEXITY_SEARCH"]),
  exactModelId: z.string().trim().min(1).max(160),
  sealedAttemptFingerprint: fingerprintSchema,
  preparedRequestFingerprint: fingerprintSchema,
  providerResponseFingerprint: fingerprintSchema,
  answer: z.string().trim().min(1),
  sources: z.array(normalizedSourceEvidenceSchema).max(20),
  citationUrls: z.array(z.string().url()).max(20),
  usage: z.object({
    promptTokens: z.number().int().nonnegative().nullable(),
    completionTokens: z.number().int().nonnegative().nullable(),
    totalTokens: z.number().int().positive().nullable(),
  }).strict(),
  latencyMs: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  externalTransportPerformed: z.literal(false),
  evidenceFingerprint: fingerprintSchema,
}).strict();

export type NormalizeProviderFixtureInput = z.infer<typeof normalizeProviderFixtureInputSchema>;
export type CanonicalProviderEvidence = z.infer<typeof canonicalProviderEvidenceSchema>;
