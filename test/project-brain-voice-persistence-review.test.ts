import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { voiceFixture } from "./fixtures/project-brain-voice";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/server/construction-operating-assistant-r36v/project-brain-intake", () => ({ readProjectBrainSourceBytesInternally: vi.fn() }));
import { inspectProjectBrainSourceSegments } from "@/server/model-gateway/voice/source-segments";
import { assertVoiceSessionAccess } from "@/server/model-gateway/voice/sessions";

const migration = readFileSync("prisma/migrations/20260910120000_project_brain_voice_sessions_off/migration.sql", "utf8");
const legacy = readFileSync("prisma/migrations/20260820120000_intake_voice_transcription/migration.sql", "utf8");

describe("independent Project Brain voice persistence review — no database execution", () => {
  it.each(["id", "version", "encodingProfile"] as const)("rejects malformed transformer %s before persistence", key => {
    for (const value of [null, {}, "", "x".repeat(161), "😀".repeat(81)]) {
      const input = voiceFixture().manifest;
      expect(() => inspectProjectBrainSourceSegments({ ...input, transformer: { ...input.transformer, [key]: value } }, { enabled: true })).toThrow();
    }
  });
  it.each([1, 160])("retains a bounded %i-character transformer as synthetic metadata only", length => {
    const input = voiceFixture().manifest;
    const result = inspectProjectBrainSourceSegments({ ...input, transformer: { ...input.transformer, id: "x".repeat(length), version: "v".repeat(length), encodingProfile: "p".repeat(length) } }, { enabled: true });
    expect(result).toMatchObject({ status: "MANIFEST_VALIDATED_LOCAL_NOT_AUTHORIZED", executionAuthorized: false, externalTransportPerformed: false });
    if (result.status === "DISABLED") throw new Error("unexpected disabled");
    expect(result.manifest.mediaDecodingVerified).toBe(false);
    expect(Object.isFrozen(result.manifest.transformer)).toBe(true);
  });
  it.each(["CLIENT", "ADMIN"])("a %s role cannot acquire legacy ownership of a null-client session", role => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const session = { id: "pb", clientId: null, status: "transcribing", consentVersion: "v1", consentedAt: now, expiresAt: new Date(now.getTime() + 60_000) };
    expect(() => assertVoiceSessionAccess(session as never, { id: "owner-a", role }, now, ["transcribing"])).toThrow("voice_session_not_owned");
  });
  it("does not replace the preexisting NULL-safe consent/client/limit mutation guard", () => {
    expect(legacy).toContain('ROW(NEW."clientId",NEW."languageHint",NEW."consentVersion",NEW."consentedAt"');
    expect(legacy).toContain("IS DISTINCT FROM");
    expect(migration).not.toMatch(/DROP\s+TRIGGER|CREATE\s+OR\s+REPLACE\s+FUNCTION\s+voice_reject_session_frozen_mutation/i);
    expect(migration).toContain('"subjectKind"=\'voice_intake\' AND "clientId" IS NOT NULL');
    expect(migration).toContain('"subjectKind"=\'project_brain_voice\' AND "clientId" IS NULL');
  });
  it("ties final manifest checks to current committed rows, not queued stale row images", () => {
    expect(migration).toContain('SELECT * INTO current_session FROM "VoiceIntakeSession" WHERE id=session_id');
    expect(migration.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2);
    expect(migration).toContain("voice_pb_manifest_incomplete");
    expect(migration).toContain("voice_pb_manifest_coverage_refused");
    expect(migration).toContain("voice_pb_session_delete_refused");
    expect(migration).toContain("voice_pb_evidence_truncate_refused");
  });
  it("checks all transformer label types and exact UTF-16 bounds in SQL before hashes or insertion", () => {
    for (const key of ["id", "version", "encodingProfile"]) {
      expect(migration).toContain(`jsonb_typeof(manifest#>'{transformer,${key}}') IS DISTINCT FROM 'string'`);
      expect(migration).toContain(`voice_pb_utf16_length(manifest#>>'{transformer,${key}}') NOT BETWEEN 1 AND 160`);
    }
    expect(migration).toContain("ascii(character)>65535 THEN 2 ELSE 1 END");
    expect(migration.indexOf("RAISE EXCEPTION 'voice_pb_transformer_refused'")).toBeLessThan(migration.indexOf("NEW.\"segmentManifestHash\" IS DISTINCT FROM encode"));
  });
  it("matches the nonpartial Prisma unique while the closed legacy branch keeps NULL sources", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "voice_pb_one_session_per_source_key" ON "VoiceIntakeSession" ("projectBrainSourceId");');
    expect(migration).toContain('AND "workspaceId" IS NULL AND "projectId" IS NULL AND "intakeId" IS NULL AND "projectBrainSourceId" IS NULL');
  });
});
