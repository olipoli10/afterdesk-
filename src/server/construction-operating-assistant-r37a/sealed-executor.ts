import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { R36B_CANDIDATE_PACKETS } from "@/lib/construction-operating-assistant-r36b/candidates";
import type { ProviderRequestPlan, SandboxCase } from "@/lib/construction-operating-assistant-r36b/contracts";
import {
  r37aAuthorizationSchema,
  r37aFingerprint,
  r37aPreparedRequestSchema,
  r37aSealedSyntheticAttemptSchema,
  r37aSyntheticAdapterResultSchema,
  r37aSyntheticEvidenceSchema,
  type R37AAuthorization,
  type R37APreparedRequest,
  type R37ASealedSyntheticAttempt,
  type R37ASyntheticEvidence,
} from "@/lib/construction-operating-assistant-r37a/contracts";

type R37CampaignManifest = ReturnType<typeof createR37CampaignManifest>;

export type SealedSyntheticAttempt = Readonly<R37ASealedSyntheticAttempt>;

export type SyntheticProviderInvocationContext = Readonly<{
  runId: string;
  leaseToken: string;
}>;

/** Trusted local fixture seam, NOT a sandbox for untrusted executable code.
 * The result's synthetic/no-transport fields are contractual declarations, not
 * an observation of I/O. Callers must separately enforce network/credential
 * isolation before using this seam as evidence of no external transport.
 */
export type SyntheticProviderTransport = (
  request: R37APreparedRequest,
  context?: SyntheticProviderInvocationContext,
  control?: Readonly<{ abortSignal: AbortSignal }>,
) => Promise<unknown>;

export type SyntheticExecutionOptions = Readonly<{
  // Internal service/test capability, never deserialized from runtime input.
  clock?: Readonly<{ now: () => Date }>;
}>;

function assertRuntimeAuthorizationTime(sealed: SealedSyntheticAttempt, options: SyntheticExecutionOptions): number {
  let current: unknown;
  try { current = options.clock?.now() ?? new Date(); }
  catch { throw new Error("R37A_AUTHORIZATION_TIME_INVALID"); }
  if (!(current instanceof Date) || !Number.isFinite(current.getTime())) throw new Error("R37A_AUTHORIZATION_TIME_INVALID");
  const now = current.getTime();
  if (Date.parse(sealed.authorization.authorizedAt) > now) throw new Error("R37A_AUTHORIZATION_TIME_INVALID");
  if (Date.parse(sealed.authorization.expiresAt) <= now) throw new Error("R37A_AUTHORIZATION_EXPIRED");
  return now;
}

function assertR37ASealedSyntheticAttempt(value: unknown): SealedSyntheticAttempt {
  const parsed = r37aSealedSyntheticAttemptSchema.safeParse(value);
  if (!parsed.success) throw new Error("R37A_SEALED_ATTEMPT_SCHEMA_INVALID");
  const sealed = parsed.data;
  const { caseFingerprint, ceilingFingerprint, ...sandboxUnsigned } = sealed.sandboxCase;
  if (r37aFingerprint(sandboxUnsigned) !== caseFingerprint) throw new Error("R37A_CASE_FINGERPRINT_DRIFT");
  if (r37aFingerprint(sealed.sandboxCase.ceilings) !== ceilingFingerprint) throw new Error("R37A_CEILING_FINGERPRINT_DRIFT");
  const { preparedRequestFingerprint, ...preparedUnsigned } = sealed.preparedRequest;
  if (r37aFingerprint(preparedUnsigned) !== preparedRequestFingerprint) throw new Error("R37A_PREPARED_REQUEST_DRIFT");
  const { sealedAttemptFingerprint, ...sealedUnsigned } = sealed;
  if (r37aFingerprint(sealedUnsigned) !== sealedAttemptFingerprint) throw new Error("R37A_SEALED_ATTEMPT_DRIFT");
  if (sealed.preparedRequest.candidateKey !== sealed.authorization.candidateKey) {
    throw new Error("R37A_CANDIDATE_BINDING_MISMATCH");
  }
  if (
    sealed.authorization.candidateKey === "OPENROUTER_CONTROLLER" &&
    (sealed.preparedRequest.payload as { model?: unknown }).model !== sealed.authorization.exactModelId
  ) {
    throw new Error("R37A_EXACT_MODEL_BINDING_MISMATCH");
  }
  return sealed;
}

function mustBeCurrent(input: Readonly<{
  campaign: R37CampaignManifest;
  sandboxCase: SandboxCase;
  requestPlan: ProviderRequestPlan;
  authorization: unknown;
  now: string;
}>): R37AAuthorization {
  const authorization = r37aAuthorizationSchema.parse(input.authorization);
  if (authorization.executionMode !== "SYNTHETIC_TRANSPORT") throw new Error("R37A_SYNTHETIC_MODE_REQUIRED");
  if (authorization.candidateKey === "DIRECT_CONTROLLER_CONTROL") throw new Error("R37A_DIRECT_CONTROLLER_UNBOUND");
  if (input.campaign.state !== "PREPARED_NOT_AUTHORIZED" || input.campaign.providerExecutionAuthorized || input.campaign.externalDispatchPerformed) {
    throw new Error("R37A_CAMPAIGN_STATE_REFUSED");
  }
  const packet = R36B_CANDIDATE_PACKETS[authorization.candidateKey];
  if (!input.campaign.packetFingerprints.includes(packet.packetFingerprint)) throw new Error("R37A_PACKET_NOT_IN_CAMPAIGN");
  if (!input.campaign.caseFingerprints.includes(input.sandboxCase.caseFingerprint) || !input.sandboxCase.syntheticOnly) {
    throw new Error("R37A_SYNTHETIC_CASE_REQUIRED");
  }
  if (input.requestPlan.providerKey !== authorization.candidateKey || input.requestPlan.packetFingerprint !== packet.packetFingerprint || input.requestPlan.caseFingerprint !== input.sandboxCase.caseFingerprint || input.requestPlan.ceilingFingerprint !== input.sandboxCase.ceilingFingerprint) {
    throw new Error("R37A_REQUEST_BINDING_MISMATCH");
  }
  if (packet.perAttemptCostCeilingMicros > input.campaign.maximumTotalSpendMicros || input.sandboxCase.ceilings.maxCostMicros > input.campaign.maximumTotalSpendMicros) {
    throw new Error("R37A_CAMPAIGN_BUDGET_EXCEEDED");
  }
  if (authorization.expiresAt <= authorization.authorizedAt || authorization.authorizedAt > input.now) throw new Error("R37A_AUTHORIZATION_TIME_INVALID");
  if (authorization.candidateKey === "OPENROUTER_CONTROLLER") {
    if (!authorization.exactModelId) throw new Error("R37A_EXACT_MODEL_REQUIRED");
    if (input.requestPlan.providerKey !== "OPENROUTER_CONTROLLER" || input.requestPlan.payload.provider.allowFallbacks || !input.requestPlan.payload.provider.requireParameters || input.requestPlan.payload.provider.dataCollection !== "deny" || !input.requestPlan.payload.provider.zdr) {
      throw new Error("R37A_OPENROUTER_PRIVACY_BINDING_REQUIRED");
    }
  }
  return authorization;
}

function prepareRequest(requestPlan: ProviderRequestPlan, authorization: R37AAuthorization): R37APreparedRequest {
  if (requestPlan.providerKey === "OPENROUTER_CONTROLLER") {
    const unsigned = {
      schemaVersion: 1 as const,
      candidateKey: "OPENROUTER_CONTROLLER" as const,
      endpointFamily: "OPENROUTER_CHAT_COMPLETIONS" as const,
      method: "POST" as const,
      path: requestPlan.path,
      dispatchable: false as const,
      credentialResolved: false as const,
      payload: {
        model: authorization.exactModelId,
        orderedFacts: requestPlan.payload.orderedFacts,
        responseContractKey: requestPlan.payload.responseContractKey,
        provider: requestPlan.payload.provider,
      },
    };
    return r37aPreparedRequestSchema.parse({ ...unsigned, preparedRequestFingerprint: r37aFingerprint(unsigned) });
  }
  const unsigned = {
    schemaVersion: 1 as const,
    candidateKey: "PERPLEXITY_SEARCH" as const,
    endpointFamily: "PERPLEXITY_SEARCH_API" as const,
    method: "POST" as const,
    path: requestPlan.path,
    dispatchable: false as const,
    credentialResolved: false as const,
    payload: requestPlan.payload,
  };
  return r37aPreparedRequestSchema.parse({ ...unsigned, preparedRequestFingerprint: r37aFingerprint(unsigned) });
}

// `now` below is a historical preparation timestamp, NOT runtime authorization.
// A valid sealed artifact still requires fresh checks on every execution.
export function sealSyntheticAttempt(input: Readonly<{
  campaign: R37CampaignManifest;
  sandboxCase: SandboxCase;
  requestPlan: ProviderRequestPlan;
  authorization: unknown;
  now: string;
}>): SealedSyntheticAttempt {
  const authorization = mustBeCurrent(input);
  const preparedRequest = prepareRequest(input.requestPlan, authorization);
  const unsigned = {
    schemaVersion: 1 as const,
    campaignFingerprint: input.campaign.manifestFingerprint,
    authorization,
    sandboxCase: input.sandboxCase,
    preparedRequest,
  };
  return { ...unsigned, sealedAttemptFingerprint: r37aFingerprint(unsigned) };
}

function serialisedByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    throw new Error("R37A_RESPONSE_NOT_SERIALIZABLE");
  }
}

export async function runSyntheticAttempt(input: Readonly<{
  sealed: SealedSyntheticAttempt;
  adapter: SyntheticProviderTransport;
  adapterContext?: SyntheticProviderInvocationContext;
  abortSignal?: AbortSignal;
}>, options: SyntheticExecutionOptions = {}): Promise<R37ASyntheticEvidence> {
  if ("now" in input) throw new Error("R37A_CALLER_TIME_REFUSED");
  const sealed = assertR37ASealedSyntheticAttempt(input.sealed);
  const admittedAt = assertRuntimeAuthorizationTime(sealed, options);
  const expiresAt = Date.parse(sealed.authorization.expiresAt);
  if (input.abortSignal?.aborted) throw new Error("R37A_SYNTHETIC_ATTEMPT_ABORTED");
  if (sealed.preparedRequest.dispatchable || sealed.preparedRequest.credentialResolved) throw new Error("R37A_DISPATCHABLE_REQUEST_REFUSED");
  const ceilings = sealed.sandboxCase.ceilings;
  const timeoutMs = Math.min(ceilings.maxLatencyMs, expiresAt - admittedAt);
  const controller = new AbortController();
  const startedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  let rawAdapterResult: unknown;
  try {
    const deadline = new Promise<never>((_, reject) => {
      const terminate = (code: string) => {
        // Cooperative cancellation request only. This does NOT prove a hung
        // callback stopped, and is never evidence that external work was cancelled.
        controller.abort();
        reject(new Error(code));
      };
      timer = setTimeout(() => terminate("R37A_SYNTHETIC_ATTEMPT_TIMEOUT"), timeoutMs);
      abortListener = () => terminate("R37A_SYNTHETIC_ATTEMPT_ABORTED");
      input.abortSignal?.addEventListener("abort", abortListener, { once: true });
    });
    const attempted = Promise.resolve().then(() => {
      if (controller.signal.aborted || input.abortSignal?.aborted) throw new Error("R37A_SYNTHETIC_ATTEMPT_ABORTED");
      assertRuntimeAuthorizationTime(sealed, options);
      return input.adapter(sealed.preparedRequest, input.adapterContext, { abortSignal: controller.signal });
    });
    // A rejected/late adapter remains handled by race, but cannot emit success
    // evidence after timeout. In-process JavaScript cannot preempt synchronous CPU.
    rawAdapterResult = await Promise.race([attempted, deadline]);
    if (performance.now() - startedAt >= timeoutMs) throw new Error("R37A_SYNTHETIC_ATTEMPT_TIMEOUT");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abortListener) input.abortSignal?.removeEventListener("abort", abortListener);
    controller.abort();
  }
  if (!rawAdapterResult || typeof rawAdapterResult !== "object" || (rawAdapterResult as { externalTransportPerformed?: unknown }).externalTransportPerformed !== false) {
    throw new Error("R37A_EXTERNAL_TRANSPORT_REFUSED");
  }
  const adapterResult = r37aSyntheticAdapterResultSchema.parse(rawAdapterResult);
  if (adapterResult.latencyMs > ceilings.maxLatencyMs) throw new Error("R37A_LATENCY_CEILING_EXCEEDED");
  if (adapterResult.costMicros > ceilings.maxCostMicros) throw new Error("R37A_COST_CEILING_EXCEEDED");
  if (serialisedByteLength(adapterResult.body) > ceilings.maxOutputTokens * 4) throw new Error("R37A_RESPONSE_SIZE_EXCEEDED");
  assertRuntimeAuthorizationTime(sealed, options);
  // These flags classify fixture evidence; they do not attest callback I/O.
  const unsigned = {
    schemaVersion: 1 as const,
    evidenceLabel: "SYNTHETIC" as const,
    externalDispatchPerformed: false as const,
    certified: false as const,
    sealedAttemptFingerprint: sealed.sealedAttemptFingerprint,
    responseFingerprint: r37aFingerprint(adapterResult.body),
    latencyMs: adapterResult.latencyMs,
    costMicros: adapterResult.costMicros,
  };
  return r37aSyntheticEvidenceSchema.parse({ ...unsigned, evidenceFingerprint: r37aFingerprint(unsigned) });
}

export function requestObservedProviderExecution(): never {
  throw new Error("R37A_OBSERVED_PROVIDER_AUTHORITY_REQUIRED");
}
