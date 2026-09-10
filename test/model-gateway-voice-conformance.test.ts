import { describe, expect, it } from "vitest";
import { VOICE_ENVELOPE } from "./model-gateway-voice-adapter-contract.test";
import {
  runVoiceConformanceFixture,
  stableVoiceDisposition,
} from "./support/model-gateway-voice-conformance";

describe("synthetic voice/wire normalization only (no provider certification)", () => {
  it.each(["success", "failure", "ambiguous", "malformed_usage"] as const)(
    "normalizes %s with one direct fake transport and one captured-wire fixture",
    async (mode) => {
      const result = await runVoiceConformanceFixture({ envelope: VOICE_ENVELOPE, mode });
      expect(stableVoiceDisposition(result.directResult)).toEqual(
        stableVoiceDisposition(result.candidateResult)
      );
      expect(result.directCalls).toBe(1);
      expect(result.wireFixtureNormalizations).toBe(1);
    }
  );
});
