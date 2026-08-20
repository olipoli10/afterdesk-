import { describe, expect, it } from "vitest";
import { createVoiceAuditEvent } from "@/server/model-gateway/voice/evidence";

const hash = (char: string): `sha256:${string}` => `sha256:${char.repeat(64)}`;

describe("voice content-free audit", () => {
  it("projects bounded identity, counts and hashes into the closed gateway event", () => {
    const event = createVoiceAuditEvent({
      eventType: "voice_intake.segment.succeeded",
      correlationId: "voice:session-1:segment-1",
      tenantId: "client-1",
      sessionId: "session-1",
      segmentId: "segment-1",
      ordinal: 0,
      audioFingerprint: hash("a"),
      transcriptFingerprint: hash("b"),
      byteCount: 100,
      durationMs: 1_000,
      characterCount: 25,
    });
    expect(event).toMatchObject({
      eventType: "voice_intake.segment.succeeded",
      correlationId: "voice:session-1:segment-1",
      tenantId: "client-1",
      attemptId: "segment-1",
      evidenceRef: expect.stringMatching(/^sha256:/),
    });
    expect(JSON.stringify(event)).not.toContain("transcript text canary");
  });

  it.each(["audioBytes", "audioBase64", "transcriptText", "credential", "secret"])(
    "rejects the %s canary field",
    (field) => {
      expect(() => createVoiceAuditEvent({
        eventType: "voice_intake.segment.failed",
        correlationId: "voice:session-1:segment-1",
        tenantId: "client-1",
        sessionId: "session-1",
        segmentId: "segment-1",
        ordinal: 0,
        audioFingerprint: hash("a"),
        byteCount: 100,
        durationMs: 1_000,
        [field]: "canary",
      } as never)).toThrow("VOICE_AUDIT_CONTENT_FORBIDDEN");
    }
  );
});
