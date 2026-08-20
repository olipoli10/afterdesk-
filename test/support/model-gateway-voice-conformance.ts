import { createVoiceSyntheticDirectAdapter } from "@/server/model-gateway/voice/adapters/synthetic-direct";
import { createOpenRouterSttCandidateAdapter } from "@/server/model-gateway/voice/adapters/openrouter-candidate";
import type { VoiceAdapterEnvelope, VoiceAdapterResult } from "@/server/model-gateway/voice/adapters/contract";

export async function runVoiceConformanceFixture(input: {
  envelope: VoiceAdapterEnvelope;
  mode: "success" | "failure" | "ambiguous" | "malformed_usage";
}) {
  let directCalls = 0;
  let candidateCalls = 0;
  const direct = createVoiceSyntheticDirectAdapter({
    endpointKey: "audio/transcriptions",
    modelKey: "synthetic-stt-v1",
    transport: async () => {
      directCalls += 1;
      if (input.mode === "failure") throw Object.assign(new Error("fixture"), { status: 429 });
      if (input.mode === "ambiguous") throw new Error("timed out after dispatch");
      if (input.mode === "malformed_usage") return { transcriptText: "ok", audioSeconds: -1 };
      return { transcriptText: "same words", audioSeconds: 1, measuredCostMicros: 10n };
    },
  });
  const candidate = createOpenRouterSttCandidateAdapter({
    endpointKey: "/api/v1/audio/transcriptions",
    modelKey: "candidate/stt-model@frozen",
    providerEndpointSlug: "candidate-provider/endpoint-1",
    zdrRequired: true,
    transport: async () => {
      candidateCalls += 1;
      if (input.mode === "failure") throw Object.assign(new Error("fixture"), { status: 429 });
      if (input.mode === "ambiguous") throw new Error("timed out after dispatch");
      if (input.mode === "malformed_usage") return { text: "ok", usage: { audio_seconds: -1 } };
      return { id: "candidate-1", text: "same words", usage: { audio_seconds: 1, cost: 0.00001 } };
    },
  });
  const directResult = await direct.dispatch(input.envelope);
  const candidateResult = await candidate.dispatch({
    ...input.envelope,
    adapterKey: "openrouter-stt-candidate",
    billingProvider: "openrouter",
    intermediary: "openrouter",
    endpointKey: "/api/v1/audio/transcriptions",
    modelKey: "candidate/stt-model@frozen",
  });
  return { directResult, candidateResult, directCalls, candidateCalls };
}

export const stableVoiceDisposition = (result: VoiceAdapterResult) => ({
  dispatchKnowledge: result.dispatchKnowledge,
  transcriptText: result.transcriptText,
  usage: result.usage,
  errorClass: result.errorClass,
  httpStatus: result.httpStatus,
});
