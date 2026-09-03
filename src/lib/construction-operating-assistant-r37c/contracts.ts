import { z } from "zod";
import { sandboxCaseSchema } from "@/lib/construction-operating-assistant-r36b/contracts";
import {
  r37aAuthorizationSchema,
  r37aFingerprint,
  r37aPreparedRequestSchema,
  r37aSyntheticEvidenceSchema,
} from "@/lib/construction-operating-assistant-r37a/contracts";

const fingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const sealedSyntheticAttemptSchema = z.object({
  schemaVersion: z.literal(1),
  sealedAttemptFingerprint: fingerprintSchema,
  campaignFingerprint: fingerprintSchema,
  authorization: r37aAuthorizationSchema,
  sandboxCase: sandboxCaseSchema,
  preparedRequest: r37aPreparedRequestSchema,
}).strict();

export const executeControlledSyntheticAttemptSchema = z.object({
  actorId: z.string().min(1),
  workspaceId: z.string().min(1),
  grantId: z.string().min(1),
  idempotencyKey: z.string().trim().min(1).max(120),
  sealedExecutorFingerprint: fingerprintSchema,
  reservedMicros: z.bigint().positive(),
  leaseDurationMs: z.number().int().min(1_000).max(300_000).default(30_000),
  now: z.coerce.date().optional(),
  sealed: sealedSyntheticAttemptSchema,
}).strict();

export const controlledProviderRunStateSchema = z.enum([
  "PREPARED",
  "RUNNING",
  "EVIDENCE_RECORDED",
  "RELEASE_PENDING",
  "SUCCEEDED",
  "FAILED",
]);

export const controlledProviderRunResultSchema = z.object({
  disposition: z.enum([
    "SUCCEEDED",
    "SUCCEEDED_REPLAY",
    "FAILED",
    "FAILED_REPLAY",
    "IN_PROGRESS",
  ]),
  runId: z.string().min(1),
  runVersion: z.number().int().positive(),
  spendAttemptId: z.string().min(1).nullable(),
  evidence: r37aSyntheticEvidenceSchema.nullable(),
  failureCode: z.string().min(1).nullable(),
  adapterInvoked: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export type SealedSyntheticAttemptInput = z.infer<typeof sealedSyntheticAttemptSchema>;
export type ExecuteControlledSyntheticAttemptInput = z.infer<typeof executeControlledSyntheticAttemptSchema>;
export type ControlledProviderRunResult = z.infer<typeof controlledProviderRunResultSchema>;

export function controlledRunCommandFingerprint(input: Readonly<{
  actorId: string;
  workspaceId: string;
  grantId: string;
  idempotencyKey: string;
  sealedExecutorFingerprint: string;
  reservedMicros: bigint;
  leaseDurationMs: number;
  sealed: SealedSyntheticAttemptInput;
}>): `sha256:${string}` {
  return r37aFingerprint({
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    grantId: input.grantId,
    idempotencyKey: input.idempotencyKey,
    sealedExecutorFingerprint: input.sealedExecutorFingerprint,
    reservedMicros: input.reservedMicros.toString(),
    leaseDurationMs: input.leaseDurationMs,
    sealedAttemptFingerprint: input.sealed.sealedAttemptFingerprint,
  });
}

export function assertSealedSyntheticAttempt(value: SealedSyntheticAttemptInput) {
  const {
    caseFingerprint,
    ceilingFingerprint,
    ...sandboxUnsigned
  } = value.sandboxCase;
  if (r37aFingerprint(sandboxUnsigned) !== caseFingerprint) {
    throw new Error("R37C_CASE_FINGERPRINT_DRIFT");
  }
  if (r37aFingerprint(value.sandboxCase.ceilings) !== ceilingFingerprint) {
    throw new Error("R37C_CEILING_FINGERPRINT_DRIFT");
  }
  const {
    preparedRequestFingerprint,
    ...preparedUnsigned
  } = value.preparedRequest;
  if (r37aFingerprint(preparedUnsigned) !== preparedRequestFingerprint) {
    throw new Error("R37C_PREPARED_REQUEST_DRIFT");
  }
  const unsigned = {
    schemaVersion: value.schemaVersion,
    campaignFingerprint: value.campaignFingerprint,
    authorization: value.authorization,
    sandboxCase: value.sandboxCase,
    preparedRequest: value.preparedRequest,
  };
  if (r37aFingerprint(unsigned) !== value.sealedAttemptFingerprint) {
    throw new Error("R37C_SEALED_ATTEMPT_DRIFT");
  }
  if (value.preparedRequest.candidateKey !== value.authorization.candidateKey) {
    throw new Error("R37C_CANDIDATE_BINDING_MISMATCH");
  }
  if (
    value.authorization.candidateKey === "OPENROUTER_CONTROLLER" &&
    (value.preparedRequest.payload as { model?: unknown }).model !== value.authorization.exactModelId
  ) {
    throw new Error("R37C_EXACT_MODEL_BINDING_MISMATCH");
  }
  return value;
}
