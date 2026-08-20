import "server-only";
import type { VoiceAdapterEnvelope, VoiceModelGatewayAdapter } from "./contract";
import { validateVoiceAdapterEnvelope } from "./contract";
import { voiceNotDispatched, voiceResponse, voiceTransportFailure } from "./shared";

export type OpenRouterSttCandidateRequest = Readonly<{
  model: string;
  input_audio: Readonly<{ data: string; format: string }>;
  language: string;
  temperature: 0;
  provider: Readonly<{
    only: readonly [string];
    allow_fallbacks: false;
    require_parameters: true;
    data_collection: "deny";
    zdr: boolean;
  }>;
}>;

export type OpenRouterSttCandidateResponse = Readonly<{
  id?: string;
  text?: unknown;
  usage?: Readonly<{
    audio_seconds?: number | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    cost?: number | null;
  }>;
  httpStatus?: number;
}>;

function measuredMicros(cost: number | null | undefined): bigint | null {
  if (cost === undefined || cost === null) return null;
  if (!Number.isFinite(cost) || cost < 0) return -1n;
  const micros = cost * 1_000_000;
  if (!Number.isSafeInteger(Math.round(micros)) || Math.abs(micros - Math.round(micros)) > 1e-6) {
    return -1n;
  }
  return BigInt(Math.round(micros));
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
      if (!validateVoiceAdapterEnvelope(envelope) ||
          envelope.adapterKey !== "openrouter-stt-candidate" ||
          envelope.billingProvider !== "openrouter" || envelope.intermediary !== "openrouter" ||
          envelope.endpointKey !== input.endpointKey || envelope.modelKey !== input.modelKey) {
        return voiceNotDispatched("malformed_request");
      }
      if (envelope.abortSignal.aborted) return voiceNotDispatched("timeout");
      const request: OpenRouterSttCandidateRequest = Object.freeze({
        model: input.modelKey,
        input_audio: Object.freeze({
          data: Buffer.from(envelope.projection.audioBytes).toString("base64"),
          format: envelope.projection.mediaFormat,
        }),
        language: envelope.projection.languageHint,
        temperature: 0 as const,
        provider: Object.freeze({
          only: Object.freeze([input.providerEndpointSlug]) as readonly [string],
          allow_fallbacks: false as const,
          require_parameters: true as const,
          data_collection: "deny" as const,
          zdr: input.zdrRequired,
        }),
      });
      const requestRef = `openrouter-candidate:${envelope.attemptId}`;
      try {
        const result = await input.transport(request, envelope.abortSignal);
        return voiceResponse({
          requestRef: result.id ?? requestRef,
          transcriptText: result.text,
          usage: {
            audioSeconds: result.usage?.audio_seconds ?? null,
            inputTokens: result.usage?.input_tokens ?? null,
            outputTokens: result.usage?.output_tokens ?? null,
            measuredCostMicros: measuredMicros(result.usage?.cost),
          },
          httpStatus: result.httpStatus,
        });
      } catch (error) {
        return voiceTransportFailure(error, requestRef);
      }
    },
  });
}
