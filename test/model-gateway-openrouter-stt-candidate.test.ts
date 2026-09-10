import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createOpenRouterSttCandidateAdapter, normalizeOpenRouterSttCandidateResponse, prepareOpenRouterSttCandidateRequest } from "@/server/model-gateway/voice/adapters/openrouter-candidate";
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

  it("blocks the uncertified route even with a configured provider pin and injected transport", async () => {
    let captured: unknown;
    const adapter = createOpenRouterSttCandidateAdapter({
      endpointKey: "/api/v1/audio/transcriptions",
      modelKey: "candidate/stt-model@frozen",
      providerEndpointSlug: "candidate-provider/endpoint-1",
      zdrRequired: true,
      transport: async (request) => {
        captured = request;
        return {
          text: "Synthetic transcript.",
          usage: { seconds: 1, cost: 0.000025 },
        };
      },
    });
    await expect(adapter.dispatch(envelope)).resolves.toMatchObject({
      dispatchKnowledge: "not_dispatched",
      transcriptText: null,
      usage: null,
    });
    expect(captured).toBeUndefined();
    expect(prepareOpenRouterSttCandidateRequest(envelope)).toEqual({
      model: "candidate/stt-model@frozen",
      input_audio: { data: Buffer.from([1, 2, 3]).toString("base64"), format: "webm" },
      language: "en",
      temperature: 0,
    });
  });

  it("reads documented STT seconds and a header receipt without settling a reported cost", () => {
    const normalized = normalizeOpenRouterSttCandidateResponse({
      body: { id: "untrusted-body-id", text: "Le dosseret est terminé.", usage: { seconds: 1.25, input_tokens: 2, output_tokens: 3, cost: 0.000025 } },
      requestRef: "local-attempt-1", generationId: "gen-synthetic-1",
    });
    expect(normalized).toMatchObject({
      result: { providerRequestRef: "gen-synthetic-1", transcriptText: "Le dosseret est terminé.",
        usage: { audioSeconds: 1.25, inputTokens: 2, outputTokens: 3, measuredCostMicros: null }, errorClass: null },
      reportedCostUpperBoundUsdMicros: 25n,
    });
  });

  it.each([undefined, null, {}, { audio_seconds: 45 }])("keeps omitted documented usage unknown: %j", (usage) => {
    expect(normalizeOpenRouterSttCandidateResponse({ body: { text: "ok", usage }, requestRef: "local-1" }))
      .toMatchObject({ result: { usage: { audioSeconds: null, measuredCostMicros: null } }, reportedCostUpperBoundUsdMicros: null });
  });

  it.each([-1, Number.NaN, Infinity, "1", [], {}])("refuses malformed seconds %j", (seconds) => {
    expect(normalizeOpenRouterSttCandidateResponse({ body: { text: "ok", usage: { seconds } }, requestRef: "local-1" }).result)
      .toMatchObject({ transcriptText: null, errorClass: "malformed_request" });
  });

  it.each([-1, Number.NaN, Infinity, Number.MAX_VALUE, "0"]) ("refuses malformed reported cost %j", (cost) => {
    expect(normalizeOpenRouterSttCandidateResponse({ body: { text: "ok", usage: { cost } }, requestRef: "local-1" }))
      .toMatchObject({ result: { transcriptText: null, errorClass: "malformed_request" }, reportedCostUpperBoundUsdMicros: null });
  });

  it("retains a positive sub-micro cost as a nonzero reported upper bound, not settlement", () => {
    expect(normalizeOpenRouterSttCandidateResponse({ body: { text: "ok", usage: { cost: 0.000000001 } }, requestRef: "local-1" }))
      .toMatchObject({ result: { usage: { measuredCostMicros: null } }, reportedCostUpperBoundUsdMicros: 1n });
  });

  it.each([null, [], "text", { text: "" }, { text: "x".repeat(20_001) }, { text: "ok", usage: [] }])("refuses malformed response %j", (body) => {
    expect(normalizeOpenRouterSttCandidateResponse({ body, requestRef: "local-1" }).result)
      .toMatchObject({ transcriptText: null, errorClass: "malformed_request" });
  });

  it.each([400, 429, 500])("does not label HTTP %s text as a successful transcript", (httpStatus) => {
    expect(normalizeOpenRouterSttCandidateResponse({ body: { text: "an error" }, requestRef: "local-1", httpStatus }).result)
      .toMatchObject({ transcriptText: null, errorClass: "malformed_request", httpStatus });
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
