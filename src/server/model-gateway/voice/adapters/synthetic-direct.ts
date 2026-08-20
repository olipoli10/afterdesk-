import "server-only";
import type { VoiceAdapterEnvelope, VoiceModelGatewayAdapter } from "./contract";
import { validateVoiceAdapterEnvelope } from "./contract";
import { voiceNotDispatched, voiceResponse, voiceTransportFailure } from "./shared";

export type VoiceSyntheticTransportResult = Readonly<{
  transcriptText: unknown;
  audioSeconds?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  measuredCostMicros?: bigint | null;
  providerRequestRef?: string;
  httpStatus?: number;
}>;

export function createVoiceSyntheticDirectAdapter(input: Readonly<{
  endpointKey: string;
  modelKey: string;
  transport: (envelope: VoiceAdapterEnvelope) => Promise<VoiceSyntheticTransportResult>;
}>): VoiceModelGatewayAdapter {
  return Object.freeze({
    key: "voice-synthetic-direct" as const,
    async dispatch(envelope: VoiceAdapterEnvelope) {
      if (!validateVoiceAdapterEnvelope(envelope) ||
          envelope.adapterKey !== "voice-synthetic-direct" ||
          envelope.billingProvider !== "synthetic" || envelope.intermediary !== null ||
          envelope.endpointKey !== input.endpointKey || envelope.modelKey !== input.modelKey) {
        return voiceNotDispatched("malformed_request");
      }
      if (envelope.abortSignal.aborted) return voiceNotDispatched("timeout");
      const requestRef = `voice-synthetic:${envelope.attemptId}`;
      try {
        const result = await input.transport(envelope);
        return voiceResponse({
          requestRef: result.providerRequestRef ?? requestRef,
          transcriptText: result.transcriptText,
          usage: {
            audioSeconds: result.audioSeconds ?? null,
            inputTokens: result.inputTokens ?? null,
            outputTokens: result.outputTokens ?? null,
            measuredCostMicros: result.measuredCostMicros ?? null,
          },
          httpStatus: result.httpStatus,
        });
      } catch (error) {
        return voiceTransportFailure(error, requestRef);
      }
    },
  });
}
