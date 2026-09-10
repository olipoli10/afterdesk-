import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve("prisma/migrations/20260910120000_project_brain_voice_sessions_off/migration.sql"), "utf8");
const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
const sessionSource = readFileSync(resolve("src/server/model-gateway/voice/project-brain-sessions.ts"), "utf8");
describe("Project Brain forward persistence scope and SQL contracts (not execution proof)", () => {
  it("keeps old voice guards and historical sources untouched", () => {
    expect(sql).not.toMatch(/DROP\s+(?:TRIGGER|CONSTRAINT|TABLE)|CREATE OR REPLACE FUNCTION|UPDATE\s+"Construction|DELETE FROM\s+"Construction/i);
    expect(sql).not.toMatch(/ALTER COLUMN.*TYPE|SET\s+TIME\s+ZONE/i);
    expect(sql).not.toMatch(/INSERT INTO "(?:AiOperation|ModelGatewayRouteProfile|ModelGatewayPolicyVersion)"/);
  });
  it("separates legacy CLIENT and Project Brain identities instead of treating owner as CLIENT", () => {
    expect(sql).toContain('"subjectKind"=\'voice_intake\' AND "clientId" IS NOT NULL');
    expect(sql).toContain('"subjectKind"=\'project_brain_voice\' AND "clientId" IS NULL');
    expect(sql).toContain('FOREIGN KEY ("projectBrainSourceId","workspaceId","projectId","intakeId")');
    expect(schema).toContain('@relation("ProjectBrainVoiceRequester"');
  });
  it("preserves permanent source nonreuse and all final segment coverage", () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "voice_pb_one_session_per_source_key"');
    expect(sql).toContain("voice_pb_session_delete_refused"); expect(sql).toContain("voice_pb_evidence_truncate_refused");
    expect(sql.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2);
    expect(sql).toContain('SELECT * INTO current_session FROM "VoiceIntakeSession" WHERE id=session_id');
    expect(sql).toContain('voice_pb_manifest_incomplete'); expect(sql).toContain('voice_pb_manifest_segment_mismatch');
    // First actual native migration run failed at unparenthesized NOT CASE (42601).
    expect(sql).toContain('IF NOT (CASE segment."mediaFormat"::text');
    expect(sql).toContain("ELSE false END) THEN");
  });
  it("uses explicit UTC for new defaults, raw Date writes and JSON epoch comparisons", () => {
    expect(sql.match(/ALTER COLUMN "createdAt" SET DEFAULT \(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'\)/g)).toHaveLength(2);
    for (const n of [14, 24, 25]) expect(sessionSource).toContain(`($${n}::timestamptz AT TIME ZONE 'UTC')`);
    expect(sessionSource).toContain("($10::timestamptz AT TIME ZONE 'UTC')");
    expect(sql).toContain("((s->>'memberRevision')::timestamptz AT TIME ZONE 'UTC')");
    expect(sql).toContain("now_utc := clock_timestamp() AT TIME ZONE 'UTC'");
  });
  it("does not upgrade synthetic manifest or source approval into provider consent", () => {
    expect(sql).toContain("'PROJECT_BRAIN_VOICE_LOCAL_SYNTHETIC'"); expect(sql).toContain("'SYNTHETIC_LOCAL'");
    expect(sql).toContain("consent->'externalProcessingAllowed' IS DISTINCT FROM 'false'::jsonb");
    expect(sql).toContain("manifest->'mediaDecodingVerified' IS DISTINCT FROM 'false'::jsonb");
    expect(sessionSource).not.toMatch(/fetch\(|reserveAccount|reserveVoiceAiOperation\(/);
    expect(sessionSource).toContain("spendReserved: false");
  });
});
