import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("voice intake additive schema contract", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260820120000_intake_voice_transcription/migration.sql"
  );

  it("adds explicit pre-Task session, segment and protected transcript entities", () => {
    expect(schema).toContain("model VoiceIntakeSession {");
    expect(schema).toContain("model VoiceIntakeSegment {");
    expect(schema).toContain("model VoiceTranscriptSegment {");
    expect(schema).toMatch(/voiceIntakeSegmentId\s+String\?\s+@unique/);
    expect(schema).toContain("@@unique([sessionId, ordinal])");
  });

  it("contains no durable raw audio field", () => {
    const models = schema.slice(schema.indexOf("model VoiceIntakeSession {"));
    expect(models).not.toMatch(/audio(Bytes|Base64|Blob|Data)\s+/);
    expect(migration).not.toMatch(/"audio(Bytes|Base64|Blob|Data)"/);
  });

  it("enforces voice operation subject and protected-content immutability in PostgreSQL", () => {
    expect(migration).toContain("ai_operation_voice_subject_ck");
    expect(migration).toContain("voice_intake_session_immutable");
    expect(migration).toContain("voice_intake_segment_immutable");
    expect(migration).toContain("voice_transcript_content_guard");
    expect(migration).toContain("intake_voice_transcription");
  });

  it("keeps the migration additive", () => {
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
    expect(migration).not.toMatch(/TRUNCATE/i);
  });
});
