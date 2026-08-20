import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createOpenRouterSttCandidateAdapter } from "@/server/model-gateway/voice/adapters/openrouter-candidate";
import { VOICE_ENVELOPE } from "./model-gateway-voice-adapter-contract.test";

describe("OpenRouter-shaped STT candidate", () => {
  const envelope = {
    ...VOICE_ENVELOPE,
    adapterKey: "openrouter-stt-candidate" as const,
    billingProvider: "openrouter",
    intermediary: "openrouter",
    endpointKey: "/api/v1/audio/transcriptions",
    modelKey: "candidate/stt-model@frozen",
  };

  it("maps exact bytes, format, language, model, provider and privacy controls", async () => {
    let captured: unknown;
    const adapter = createOpenRouterSttCandidateAdapter({
      endpointKey: "/api/v1/audio/transcriptions",
      modelKey: "candidate/stt-model@frozen",
      providerEndpointSlug: "candidate-provider/endpoint-1",
      zdrRequired: true,
      transport: async (request) => {
        captured = request;
        return {
          id: "candidate-request-1",
          text: "Synthetic transcript.",
          usage: { audio_seconds: 1, cost: 0.000025 },
        };
      },
    });
    await expect(adapter.dispatch(envelope)).resolves.toMatchObject({
      dispatchKnowledge: "response_received",
      transcriptText: "Synthetic transcript.",
      usage: { audioSeconds: 1, measuredCostMicros: 25n },
    });
    expect(captured).toEqual({
      model: "candidate/stt-model@frozen",
      input_audio: { data: Buffer.from([1, 2, 3]).toString("base64"), format: "webm" },
      language: "en",
      temperature: 0,
      provider: {
        only: ["candidate-provider/endpoint-1"],
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: true,
      },
    });
  });

  it("has no network or credential construction path", () => {
    const source = readFileSync(
      "src/server/model-gateway/voice/adapters/openrouter-candidate.ts", "utf8"
    );
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/process\.env|OPENROUTER_API_KEY|authorization/i);
  });

  it("refuses exact-provider/model/intermediary substitution before transport", async () => {
    let calls = 0;
    const adapter = createOpenRouterSttCandidateAdapter({
      endpointKey: "/api/v1/audio/transcriptions",
      modelKey: "candidate/stt-model@frozen",
      providerEndpointSlug: "candidate-provider/endpoint-1",
      zdrRequired: true,
      transport: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    });
    await expect(adapter.dispatch({ ...envelope, modelKey: "latest" }))
      .resolves.toMatchObject({ dispatchKnowledge: "not_dispatched" });
    await expect(adapter.dispatch({ ...envelope, intermediary: null }))
      .resolves.toMatchObject({ dispatchKnowledge: "not_dispatched" });
    expect(calls).toBe(0);
  });
});
