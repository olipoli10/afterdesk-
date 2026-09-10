import "server-only";
import type { VoiceAdapterEnvelope, VoiceAdapterResult, VoiceModelGatewayAdapter } from "./contract";
import { validateVoiceAdapterEnvelope } from "./contract";
import { voiceNotDispatched, voiceResponse } from "./shared";

/** Wire preparation is not route certification or permission to send audio. */
export type OpenRouterSttCandidateRequest = Readonly<{
  model: string;
  input_audio: Readonly<{ data: string; format: string }>;
  language: string;
  temperature: 0;
}>;

export type OpenRouterSttCandidateResponse = Readonly<{
  text?: unknown;
  usage?: Readonly<{
    seconds?: number | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    cost?: number | null;
  }>;
  httpStatus?: number;
}>;

export const OPENROUTER_STT_BLOCK_REASON = "openrouter_stt_provider_routing_unverified" as const;

function candidateEnvelopeValid(envelope: VoiceAdapterEnvelope): boolean {
  return validateVoiceAdapterEnvelope(envelope) &&
    envelope.adapterKey === "openrouter-stt-candidate" &&
    envelope.billingProvider === "openrouter" && envelope.intermediary === "openrouter" &&
    envelope.endpointKey === "/api/v1/audio/transcriptions" &&
    /^[A-Za-z0-9._:@/-]{1,200}$/.test(envelope.modelKey);
}

/** Pure, local wire fixture helper. No provider-routing/privacy promises are encoded. */
export function prepareOpenRouterSttCandidateRequest(envelope: VoiceAdapterEnvelope): OpenRouterSttCandidateRequest {
  if (!candidateEnvelopeValid(envelope)) throw new Error("INVALID_OPENROUTER_STT_WIRE_ENVELOPE");
  return Object.freeze({
    model: envelope.modelKey,
    input_audio: Object.freeze({
      data: Buffer.from(envelope.projection.audioBytes).toString("base64"),
      format: envelope.projection.mediaFormat,
    }),
    language: envelope.projection.languageHint,
    temperature: 0 as const,
  });
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Reported USD is metadata, never a settled cost. Round upwards, retaining unknown. */
function reportedCostUpperBound(cost: unknown): bigint | null {
  if (cost === undefined || cost === null) return null;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) return -1n;
  const micros = Math.ceil(cost * 1_000_000);
  return Number.isSafeInteger(micros) ? BigInt(micros) : -1n;
}

/**
 * Normalize captured/synthetic wire data only. usage.seconds is the STT field;
 * missing usage is unknown. An X-Generation-Id receipt is supplied separately
 * from the body, and even a reported cost cannot settle a gateway spend hold.
 */
export function normalizeOpenRouterSttCandidateResponse(input: Readonly<{
  body: unknown;
  requestRef: string;
  generationId?: string;
  httpStatus?: number;
}>): Readonly<{ result: VoiceAdapterResult; reportedCostUpperBoundUsdMicros: bigint | null }> {
  const body = record(input.body) ? input.body : {};
  const usage = record(body.usage) ? body.usage : {};
  const reportedCost = reportedCostUpperBound(usage.cost);
  const invalidUsage = (body.usage !== undefined && body.usage !== null && !record(body.usage)) ||
    reportedCost === -1n;
  const requestRef = input.generationId && /^[A-Za-z0-9._:/-]{1,200}$/.test(input.generationId)
    ? input.generationId : input.requestRef;
  const status = input.httpStatus ?? 200;
  const result = voiceResponse({
    requestRef,
    transcriptText: invalidUsage || !Number.isInteger(status) || status < 200 || status > 299
      ? null : body.text,
    usage: {
      audioSeconds: (usage.seconds ?? null) as number | null,
      inputTokens: (usage.input_tokens ?? null) as number | null,
      outputTokens: (usage.output_tokens ?? null) as number | null,
      measuredCostMicros: null,
    },
    httpStatus: status,
  });
  return Object.freeze({
    result,
    reportedCostUpperBoundUsdMicros: result.errorClass === null ? reportedCost : null,
  });
}

export function createOpenRouterSttCandidateAdapter(input: Readonly<{
  endpointKey: "/api/v1/audio/transcriptions";
  modelKey: string;
  providerEndpointSlug: string;
  zdrRequired: boolean;
  transport: (
    request: OpenRouterSttCandidateRequest,
    signal: AbortSignal
  ) => Promise<OpenRouterSttCandidateResponse>;
}>): VoiceModelGatewayAdapter {
  if (!/^[A-Za-z0-9._:@/-]{1,200}$/.test(input.providerEndpointSlug)) {
    throw new Error("INVALID_CANDIDATE_PROVIDER_PIN");
  }
  return Object.freeze({
    key: "openrouter-stt-candidate" as const,
    async dispatch(envelope: VoiceAdapterEnvelope) {
      if (!candidateEnvelopeValid(envelope) || envelope.endpointKey !== input.endpointKey ||
          envelope.modelKey !== input.modelKey) return voiceNotDispatched("malformed_request");
      if (envelope.abortSignal.aborted) return voiceNotDispatched("timeout");
      // OpenRouter STT does not apply provider.only/order/ignore (docs 2026-09-10).
      // No runtime flag or fabricated privacy certificate can repair that pin.
      // Keep the candidate non-dispatching, including injected transports, until
      // a separately reviewed routing/privacy/settlement contract replaces it.
      return voiceNotDispatched("malformed_request");
    },
  });
}
