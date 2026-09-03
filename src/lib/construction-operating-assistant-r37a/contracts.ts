import { z } from "zod";
import { r36bFingerprint } from "@/lib/construction-operating-assistant-r36b/contracts";

export const r37aAuthorizationSchema = z.object({
  schemaVersion: z.literal(1),
  executionMode: z.literal("SYNTHETIC_TRANSPORT"),
  authorizationId: z.string().uuid(),
  authorizedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  candidateKey: z.enum(["PERPLEXITY_SEARCH", "OPENROUTER_CONTROLLER", "DIRECT_CONTROLLER_CONTROL"]),
  exactModelId: z.string().trim().min(1).max(160).nullable(),
}).strict();

export const r37aPreparedRequestSchema = z.object({
  schemaVersion: z.literal(1),
  preparedRequestFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  candidateKey: z.enum(["PERPLEXITY_SEARCH", "OPENROUTER_CONTROLLER"]),
  endpointFamily: z.enum(["PERPLEXITY_SEARCH_API", "OPENROUTER_CHAT_COMPLETIONS"]),
  method: z.literal("POST"),
  path: z.string().startsWith("/").max(200),
  dispatchable: z.literal(false),
  credentialResolved: z.literal(false),
  payload: z.unknown(),
}).strict();

export const r37aSyntheticAdapterResultSchema = z.object({
  body: z.unknown(),
  latencyMs: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  externalTransportPerformed: z.literal(false),
}).strict();

export const r37aSyntheticEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  evidenceLabel: z.literal("SYNTHETIC"),
  externalDispatchPerformed: z.literal(false),
  certified: z.literal(false),
  sealedAttemptFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  responseFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  latencyMs: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  evidenceFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
}).strict();

export function r37aFingerprint(value: unknown): `sha256:${string}` {
  return r36bFingerprint(value);
}

export type R37AAuthorization = z.infer<typeof r37aAuthorizationSchema>;
export type R37APreparedRequest = z.infer<typeof r37aPreparedRequestSchema>;
export type R37ASyntheticEvidence = z.infer<typeof r37aSyntheticEvidenceSchema>;
