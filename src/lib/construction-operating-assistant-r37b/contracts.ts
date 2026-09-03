import { z } from "zod";

const fingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const commandIdSchema = z.string().uuid();
const moneySchema = z.bigint().positive();

export const providerCandidateSchema = z.enum([
  "PERPLEXITY_SEARCH",
  "OPENROUTER_CONTROLLER",
]);

export const prepareProviderActivationGrantSchema = z.object({
  commandId: commandIdSchema,
  actorId: z.string().min(1),
  workspaceId: z.string().min(1),
  candidateKey: providerCandidateSchema,
  exactModelId: z.string().trim().min(1).max(160),
  sealedExecutorFingerprint: fingerprintSchema,
  allowedCaseFingerprints: z.array(fingerprintSchema).min(1).max(100),
  expiresAt: z.coerce.date(),
  maxCallCount: z.number().int().positive().max(10_000),
  maxTotalSpendMicros: moneySchema,
  now: z.coerce.date().optional(),
}).strict();

export const activateProviderActivationGrantSchema = z.object({
  commandId: commandIdSchema,
  actorId: z.string().min(1),
  workspaceId: z.string().min(1),
  grantId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  sealedExecutorFingerprint: fingerprintSchema,
  now: z.coerce.date().optional(),
}).strict();

export const reserveProviderSpendSchema = z.object({
  actorId: z.string().min(1),
  workspaceId: z.string().min(1),
  grantId: z.string().min(1),
  idempotencyKey: z.string().trim().min(1).max(200),
  caseFingerprint: fingerprintSchema,
  exactModelId: z.string().trim().min(1).max(160),
  sealedExecutorFingerprint: fingerprintSchema,
  requestedMicros: moneySchema,
  now: z.coerce.date().optional(),
}).strict();

const terminalAttemptBase = z.object({
  commandId: commandIdSchema,
  actorId: z.string().min(1),
  workspaceId: z.string().min(1),
  grantId: z.string().min(1),
  attemptId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
}).strict();

export const settleProviderSpendSchema = terminalAttemptBase.extend({
  settledMicros: z.bigint().nonnegative(),
});

export const releaseProviderSpendSchema = terminalAttemptBase;

export const revokeProviderActivationGrantSchema = z.object({
  commandId: commandIdSchema,
  actorId: z.string().min(1),
  workspaceId: z.string().min(1),
  grantId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  now: z.coerce.date().optional(),
}).strict();

export const setProviderLaneControlSchema = z.object({
  commandId: commandIdSchema,
  actorId: z.string().min(1),
  state: z.enum(["ENABLED", "DISABLED"]),
  reason: z.string().trim().min(1).max(500),
  expectedVersion: z.number().int().nonnegative(),
  now: z.coerce.date().optional(),
}).strict();

export type PrepareProviderActivationGrantInput = z.infer<typeof prepareProviderActivationGrantSchema>;
export type ReserveProviderSpendInput = z.infer<typeof reserveProviderSpendSchema>;
