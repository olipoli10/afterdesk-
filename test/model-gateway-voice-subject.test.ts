import { describe, expect, it } from "vitest";
import { protectedContentRef } from "@/server/model-gateway/evidence";
import {
  requireAdapterDefinition,
  requireOperationDefinition,
  requirePolicyKey,
  requireRouteKey,
} from "@/server/model-gateway/registry";

describe("voice gateway subject and registry", () => {
  it("registers only the named voice operation and synthetic candidate seams", () => {
    expect(requireOperationDefinition("intake_voice_transcription")).toEqual({
      key: "intake_voice_transcription",
      outputContractKey: "voice-transcript-v1",
    });
    expect(requireAdapterDefinition("voice-synthetic-direct")).toMatchObject({
      key: "voice-synthetic-direct",
      external: false,
    });
    expect(requireAdapterDefinition("openrouter-stt-candidate")).toMatchObject({
      key: "openrouter-stt-candidate",
      external: true,
    });
    expect(requirePolicyKey("intake-voice-transcription-v1")).toBe(
      "intake-voice-transcription-v1"
    );
    expect(requireRouteKey("intake-voice-synthetic-direct-v1")).toBe(
      "intake-voice-synthetic-direct-v1"
    );
    expect(requireRouteKey("intake-voice-openrouter-candidate-v1")).toBe(
      "intake-voice-openrouter-candidate-v1"
    );
  });

  it("creates content references for voice input/output without content", () => {
    const input = protectedContentRef({
      kind: "voice_intake_input",
      id: "segment_1",
      fingerprint: `sha256:${"a".repeat(64)}`,
    });
    const output = protectedContentRef({
      kind: "voice_intake_output",
      id: "segment_1",
      fingerprint: `sha256:${"b".repeat(64)}`,
    });
    expect(input.kind).toBe("voice_intake_input");
    expect(output.kind).toBe("voice_intake_output");
    expect(JSON.stringify({ input, output })).not.toContain("audio bytes");
    expect(JSON.stringify({ input, output })).not.toContain("transcript text");
  });

  it("keeps unknown voice-like identifiers closed", () => {
    expect(() => requireOperationDefinition("voice_chat")).toThrow("UNKNOWN_GATEWAY_OPERATION");
    expect(() => requireAdapterDefinition("openrouter-live")).toThrow("UNKNOWN_GATEWAY_ADAPTER");
    expect(() => requirePolicyKey("intake-voice-latest")).toThrow("UNKNOWN_GATEWAY_POLICY");
    expect(() => requireRouteKey("intake-voice-cheapest")).toThrow("UNKNOWN_GATEWAY_ROUTE");
  });
});
