import { createVoiceSyntheticDirectAdapter } from "@/server/model-gateway/voice/adapters/synthetic-direct";
import { normalizeOpenRouterSttCandidateResponse } from "@/server/model-gateway/voice/adapters/openrouter-candidate";
import { voiceTransportFailure } from "@/server/model-gateway/voice/adapters/shared";
import type { VoiceAdapterEnvelope, VoiceAdapterResult } from "@/server/model-gateway/voice/adapters/contract";

export async function runVoiceConformanceFixture(input: {
  envelope: VoiceAdapterEnvelope;
  mode: "success" | "failure" | "ambiguous" | "malformed_usage";
}) {
  let directCalls = 0;
  let wireFixtureNormalizations = 0;
  const direct = createVoiceSyntheticDirectAdapter({
    endpointKey: "audio/transcriptions",
    modelKey: "synthetic-stt-v1",
    transport: async () => {
      directCalls += 1;
      if (input.mode === "failure") throw Object.assign(new Error("fixture"), { status: 429 });
      if (input.mode === "ambiguous") throw new Error("timed out after dispatch");
      if (input.mode === "malformed_usage") return { transcriptText: "ok", audioSeconds: -1 };
      return { transcriptText: "same words", audioSeconds: 1 };
    },
  });
  const directResult = await direct.dispatch(input.envelope);
  // Normalization equivalence only. The production candidate is non-dispatching;
  // this test must never impersonate provider routing, settlement or live proof.
  wireFixtureNormalizations += 1;
  const candidateResult = input.mode === "failure"
    ? voiceTransportFailure(Object.assign(new Error("fixture"), { status: 429 }), "wire-fixture")
    : input.mode === "ambiguous"
      ? voiceTransportFailure(new Error("timed out after dispatch"), "wire-fixture")
      : normalizeOpenRouterSttCandidateResponse({
          body: input.mode === "malformed_usage" ? { text: "ok", usage: { seconds: -1 } }
            : { text: "same words", usage: { seconds: 1, cost: 0.00001 } },
          requestRef: "wire-fixture",
        }).result;
  return { directResult, candidateResult, directCalls, wireFixtureNormalizations };
}

export const stableVoiceDisposition = (result: VoiceAdapterResult) => ({
  dispatchKnowledge: result.dispatchKnowledge,
  transcriptText: result.transcriptText,
  usage: result.usage,
  errorClass: result.errorClass,
  httpStatus: result.httpStatus,
});
