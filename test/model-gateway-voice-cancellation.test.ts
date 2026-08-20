import { describe, expect, it } from "vitest";
import { assembleVoiceTranscriptDraft } from "@/server/model-gateway/voice/assembly";
import { nextVoiceSessionStatus } from "@/server/model-gateway/voice/sessions";

const segment = {
  ordinal: 0, status: "succeeded", audioFingerprint: `sha256:${"a".repeat(64)}`,
  text: "done", textFingerprint: `sha256:${"b".repeat(64)}`, purgedAt: null,
};

describe("voice cancellation and incomplete outcomes", () => {
  it("allows only named session transitions and never revives cancellation", () => {
    expect(nextVoiceSessionStatus("open", "finish")).toBe("finishing");
    expect(nextVoiceSessionStatus("finishing", "transcribe")).toBe("transcribing");
    expect(nextVoiceSessionStatus("transcribing", "incomplete")).toBe("incomplete");
    expect(nextVoiceSessionStatus("transcribing", "uncertain")).toBe("uncertain");
    expect(nextVoiceSessionStatus("cancelled", "ready")).toBeNull();
    expect(nextVoiceSessionStatus("uncertain", "retry")).toBeNull();
  });

  it.each(["cancelled", "incomplete", "uncertain", "failed"])(
    "never assembles a %s session as ready",
    (sessionStatus) => {
      expect(() => assembleVoiceTranscriptDraft({
        sessionId: "session-1", sessionStatus, expectedSegmentCount: 1, segments: [segment],
      })).toThrow("voice_session_closed");
    }
  );
});
