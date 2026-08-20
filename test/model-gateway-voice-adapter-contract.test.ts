import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createVoiceSyntheticDirectAdapter } from "@/server/model-gateway/voice/adapters/synthetic-direct";
import type { VoiceAdapterEnvelope } from "@/server/model-gateway/voice/adapters/contract";

const hash = (char: string): `sha256:${string}` => `sha256:${char.repeat(64)}`;
export const VOICE_ENVELOPE: VoiceAdapterEnvelope = Object.freeze({
  operationId: "voice-operation-1",
  attemptId: "voice-attempt-1",
  tenantId: "client-1",
  sessionId: "session-1",
  segmentId: "segment-1",
  adapterKey: "voice-synthetic-direct",
  billingProvider: "synthetic",
  intermediary: null,
  endpointKey: "audio/transcriptions",
  modelKey: "synthetic-stt-v1",
  projection: Object.freeze({
    operationType: "intake_voice_transcription",
    sessionId: "session-1",
    segmentId: "segment-1",
    ordinal: 0,
    languageHint: "en",
    mediaFormat: "webm",
    mimeType: "audio/webm",
    durationMs: 1_000,
    byteCount: 3,
    audioFingerprint: `sha256:${createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex")}`,
    audioBytes: new Uint8Array([1, 2, 3]),
  }),
  outputContractHash: hash("b"),
  requestEvidenceRef: hash("c"),
  abortSignal: new AbortController().signal,
});

describe("voice adapter contract", () => {
  it("makes exactly one injected transport call and returns bounded usage", async () => {
    let calls = 0;
    const adapter = createVoiceSyntheticDirectAdapter({
      endpointKey: "audio/transcriptions",
      modelKey: "synthetic-stt-v1",
      transport: async () => {
        calls += 1;
        return { transcriptText: "A clear workflow.", audioSeconds: 1, measuredCostMicros: 25n };
      },
    });
    await expect(adapter.dispatch(VOICE_ENVELOPE)).resolves.toMatchObject({
      dispatchKnowledge: "response_received",
      transcriptText: "A clear workflow.",
      usage: { audioSeconds: 1, measuredCostMicros: 25n },
      errorClass: null,
    });
    expect(calls).toBe(1);
  });

  it("refuses substitution and abort before transport", async () => {
    let calls = 0;
    const adapter = createVoiceSyntheticDirectAdapter({
      endpointKey: "audio/transcriptions",
      modelKey: "synthetic-stt-v1",
      transport: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    });
    await expect(adapter.dispatch({ ...VOICE_ENVELOPE, modelKey: "other" }))
      .resolves.toMatchObject({ dispatchKnowledge: "not_dispatched", errorClass: "malformed_request" });
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.dispatch({ ...VOICE_ENVELOPE, abortSignal: controller.signal }))
      .resolves.toMatchObject({ dispatchKnowledge: "not_dispatched", errorClass: "timeout" });
    expect(calls).toBe(0);
  });

  it("never hides a retry after an ambiguous dispatch", async () => {
    let calls = 0;
    const adapter = createVoiceSyntheticDirectAdapter({
      endpointKey: "audio/transcriptions",
      modelKey: "synthetic-stt-v1",
      transport: async () => {
        calls += 1;
        throw new Error("request timed out after dispatch");
      },
    });
    await expect(adapter.dispatch(VOICE_ENVELOPE)).resolves.toMatchObject({
      dispatchKnowledge: "dispatched_unknown",
      errorClass: "unknown_dispatched_outcome",
    });
    expect(calls).toBe(1);
  });
});
