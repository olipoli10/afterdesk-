import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

// Only local object bytes are simulated. Source admission, database provenance,
// resolver, consent, session insertion and deferred constraints are real.
const storage = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("@/lib/storage-local", () => ({
  LOCAL_OBJECT_SCAN_MAX_ENTRIES: 256,
  putLocalObject: async (key: string, bytes: Buffer) => { storage.set(key, Buffer.from(bytes)); },
  readLocalObject: async (key: string) => { const bytes = storage.get(key); if (!bytes) throw new Error("SYNTHETIC_OBJECT_MISSING"); return Buffer.from(bytes); },
  deleteLocalObject: async (key: string) => { storage.delete(key); },
  scanLocalObjects: async () => ({ entries: [], scannedEntries: 0, cycleComplete: true }),
}));
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { createConstructionProject, initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { admitProjectBrainSource, processProjectBrainIntakeCommand } from "@/server/construction-operating-assistant-r36v/project-brain-intake";
import { createProjectBrainVoiceSession, readProjectBrainVoiceSession } from "@/server/model-gateway/voice/project-brain-sessions";
import { reserveVoiceAiOperation } from "@/server/model-gateway/voice/operations";
import { requirePersonalDisposableDatabase } from "./personal-model.fixture";

requirePersonalDisposableDatabase();
afterAll(async () => { storage.clear(); await prisma.$disconnect(); });

// Existing repository synthetic AAC/M4A fixture (R36V integration suite), not user media.
const audio = Buffer.from("AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAs5tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAgAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACHXRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAgAAAAAAAAAAAAAAAAQEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAIAAAAQAAAEAAAAAAZVtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAB9AAAAIAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAAFAbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEEc3RibAAAAGpzdHNkAAAAAAAAAAEAAABabXA0YQAAAAAAAAABAAAAAAAAAAAAAQAQAAAAAB9AAAAAAAA2ZXNkcwAAAAADgICAJQABAASAgIAXQBUAAAAAAD6AAAAA+gWAgIAFFYhW5QAGgICAAQIAAAAYc3R0cwAAAAAAAAABAAAAAgAABAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAIAAAABAAAAFHN0c3oAAAAAAAAABAAAAAIAAAAUc3RjbwAAAAAAAAABAAAC+gAAABpzZ3BkAQAAAHJvbGwAAAACAAAAAf//AAAAHHNiZ3AAAAAAcm9sbAAAAAEAAAACAAAAAQAAAD11ZHRhAAAANW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAACGlsc3QAAAAIZnJlZQAAABBtZGF0ARggBwEYIAc=", "base64");

async function fixture() {
  requirePersonalDisposableDatabase();
  const user = await prisma.user.create({ data: { email: `voice-pb-${randomUUID()}@example.invalid`, name: "Synthetic PB owner", emailVerified: true, role: "CLIENT" } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic PB audio" });
  const project = await createConstructionProject({ userId: user.id, workspaceId, code: `PB-${randomUUID()}`, name: "Synthetic chantier" });
  const intake = await processProjectBrainIntakeCommand({ userId: user.id, command: {
    schemaVersion: 1, action: "CREATE_PROJECT_BRAIN_INTAKE", commandId: randomUUID(), workspaceId, projectId: project.id,
  } });
  const admitted = await admitProjectBrainSource({ userId: user.id, bytes: audio, command: {
    schemaVersion: 1, action: "ADMIT_PROJECT_BRAIN_SOURCE", commandId: randomUUID(), workspaceId, projectId: project.id,
    intakeId: intake.intakeId, expectedStateVersion: intake.stateVersion, kind: "VOICE_NOTE", fileName: "synthetic.m4a", mimeType: "audio/m4a", sizeBytes: audio.length, durationMs: 256,
  } });
  const source = await prisma.constructionProjectBrainSource.findFirstOrThrow({ where: { intakeId: intake.intakeId }, include: { file: true } });
  const sourceBytes = storage.get(source.file.storageKey)!;
  const now = Date.now();
  const input = {
    source: { actorUserId: user.id, workspaceId, projectId: project.id, intakeId: intake.intakeId, sourceId: source.id, expectedIntakeStateVersion: admitted.stateVersion },
    commandId: randomUUID(),
    consent: { schemaVersion: 1, purpose: "PROJECT_BRAIN_VOICE_LOCAL_SYNTHETIC", accepted: true, externalProcessingAllowed: false,
      version: "SYNTHETIC_CONSENT_NOT_PROVIDER_PERMISSION-v1", actorUserId: user.id, workspaceId, projectId: project.id, intakeId: intake.intakeId,
      sourceId: source.id, sourceContentHash: source.contentHash, acceptedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60 * 60_000).toISOString(),
      languageHint: "fr", maxTotalCostMicros: "1000000", retentionHours: 24 },
    segmentation: { transformer: { id: "synthetic-identity-fixture", version: "1", encodingProfile: "existing-small-fixture", mode: "SYNTHETIC_LOCAL" },
      segments: [{ ordinal: 0, startMs: 0, endMs: source.durationMs!, durationMs: source.durationMs!, mediaFormat: "m4a", mimeType: source.mimeType,
        bytes: sourceBytes, contentHash: source.contentHash }] },
  };
  return { user, workspaceId, project, intake, source, input };
}
async function prepare(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await createProjectBrainVoiceSession(f.input, { enabled: true });
  if (result.status !== "PREPARED_LOCAL_NOT_AUTHORIZED") throw new Error(`UNEXPECTED_${result.status}`);
  return result;
}
async function countSessions(sourceId: string) {
  const [row] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*) FROM "VoiceIntakeSession" WHERE "projectBrainSourceId"=$1', sourceId);
  return Number(row.count);
}

describe("native disposable Project Brain voice durable OFF foundation", () => {
  it("OFF performs no database/source work even with an invalid input", async () => {
    expect(await createProjectBrainVoiceSession({} as never)).toEqual({ status: "DISABLED", executionAuthorized: false });
  });
  it("actual source -> consent -> session and exact segment without download audit, AiOperation, fact or provider", async () => {
    const f = await fixture(); const before = await prisma.constructionProjectBrainSource.findUniqueOrThrow({ where: { id: f.source.id } });
    const result = await prepare(f);
    const [row] = await prisma.$queryRawUnsafe<Array<{ clientId: string | null; subjectKind: string; createdAtInstant: Date; sourceBinding: unknown; segmentManifest: unknown; sourceBindingHash: string; segmentManifestHash: string }>>(
      `SELECT "clientId","subjectKind","createdAt" AT TIME ZONE 'UTC' AS "createdAtInstant","sourceBinding","segmentManifest","sourceBindingHash","segmentManifestHash" FROM "VoiceIntakeSession" WHERE id=$1`, result.sessionId);
    expect(row.clientId).toBeNull(); expect(row.subjectKind).toBe("project_brain_voice");
    expect(Math.abs(row.createdAtInstant.getTime() - Date.now())).toBeLessThan(10_000);
    expect(row.sourceBindingHash).toBe(sha256Canonical(row.sourceBinding)); expect(row.segmentManifestHash).toBe(sha256Canonical(row.segmentManifest));
    const segments = await prisma.voiceIntakeSegment.findMany({ where: { sessionId: result.sessionId } });
    expect(segments).toHaveLength(1); expect(segments[0]).toMatchObject({ ordinal: 0, status: "registered", audioFingerprint: `sha256:${f.source.contentHash}`, durationMs: f.source.durationMs });
    expect(await prisma.aiOperation.count({ where: { voiceIntakeSegmentId: segments[0].id } })).toBe(0);
    expect(await prisma.fileAccessLog.count({ where: { fileId: f.source.fileId, action: "download" } })).toBe(0);
    expect(await prisma.constructionProjectBrainSource.findUnique({ where: { id: f.source.id } })).toEqual(before);
    expect(result).toMatchObject({ executionAuthorized: false, externalTransportPerformed: false, spendReserved: false });
  });
  it("exact source replay reuses durable session, while a new command cannot reset it", async () => {
    const f = await fixture(); const first = await prepare(f);
    expect(await createProjectBrainVoiceSession(f.input, { enabled: true })).toMatchObject({ status: "REPLAYED_LOCAL_NOT_AUTHORIZED", sessionId: first.sessionId });
    await expect(createProjectBrainVoiceSession({ ...f.input, commandId: randomUUID() }, { enabled: true })).rejects.toThrow("VOICE_PB_SESSION_IDEMPOTENCY_CONFLICT");
    expect(await countSessions(f.source.id)).toBe(1);
  });
  it("two concurrent commands leave at most one durable source session and no duplicate segments", async () => {
    const f = await fixture();
    const outcomes = await Promise.allSettled([createProjectBrainVoiceSession(f.input, { enabled: true }), createProjectBrainVoiceSession({ ...f.input, commandId: randomUUID() }, { enabled: true })]);
    expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(1);
    expect(await countSessions(f.source.id)).toBe(1);
    const [count] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*) FROM "VoiceIntakeSegment" s JOIN "VoiceIntakeSession" v ON v.id=s."sessionId" WHERE v."projectBrainSourceId"=$1', f.source.id);
    expect(Number(count.count)).toBe(1);
  });
  it("rejects wrong tenant, stale consent and absent consent without durable session", async () => {
    const f = await fixture(); const other = await fixture();
    await expect(createProjectBrainVoiceSession({ ...f.input, consent: null }, { enabled: true })).rejects.toThrow();
    await expect(createProjectBrainVoiceSession({ ...f.input, source: { ...f.input.source, workspaceId: other.workspaceId } }, { enabled: true })).rejects.toThrow();
    await expect(createProjectBrainVoiceSession({ ...f.input, consent: { ...f.input.consent, expiresAt: new Date(Date.now() - 1000).toISOString() } }, { enabled: true })).rejects.toThrow("VOICE_PB_CONSENT_TIME_REFUSED");
    expect(await countSessions(f.source.id)).toBe(0);
  });
  it("permits real owner revocation and refuses future reads without deleting evidence", async () => {
    const f = await fixture(); await prepare(f);
    await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.user.id } }, data: { status: "revoked" } });
    await expect(createProjectBrainVoiceSession(f.input, { enabled: true })).rejects.toThrow(); expect(await countSessions(f.source.id)).toBe(1);
  });
  it("owner metadata projection reads actual persisted bindings without changing source, session or grants", async () => {
    const f = await fixture(); const prepared = await prepare(f);
    const before = await prisma.voiceIntakeSession.findUniqueOrThrow({ where: { id: prepared.sessionId }, include: { segments: true } });
    const projection = await readProjectBrainVoiceSession({ actorUserId: f.user.id, workspaceId: f.workspaceId, sessionId: prepared.sessionId }, { enabled: true });
    expect(projection).toMatchObject({ status: "READ_ONLY_NOT_AUTHORIZED", executionAuthorized: false, transcriptionAvailable: false,
      mediaDecodingVerified: false, sourceId: f.source.id, sessionId: prepared.sessionId, sessionStatus: "finishing", durationMs: 256 });
    expect(JSON.stringify(projection)).not.toContain(f.source.file.storageKey);
    expect(await prisma.voiceIntakeSession.findUniqueOrThrow({ where: { id: prepared.sessionId }, include: { segments: true } })).toEqual(before);
    expect(await prisma.aiOperation.count({ where: { voiceIntakeSegmentId: { in: before.segments.map(segment => segment.id) } } })).toBe(0);
    expect(await prisma.fileAccessLog.count({ where: { fileId: f.source.fileId, action: "download" } })).toBe(0);
  });
  it("owner read rejects another actor/workspace and revoked membership without erasing the session", async () => {
    const f = await fixture(); const other = await fixture(); const prepared = await prepare(f);
    await expect(readProjectBrainVoiceSession({ actorUserId: other.user.id, workspaceId: f.workspaceId, sessionId: prepared.sessionId }, { enabled: true })).rejects.toThrow("VOICE_PB_READ_REFUSED");
    await expect(readProjectBrainVoiceSession({ actorUserId: f.user.id, workspaceId: other.workspaceId, sessionId: prepared.sessionId }, { enabled: true })).rejects.toThrow("VOICE_PB_READ_REFUSED");
    await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.user.id } }, data: { status: "revoked" } });
    await expect(readProjectBrainVoiceSession({ actorUserId: f.user.id, workspaceId: f.workspaceId, sessionId: prepared.sessionId }, { enabled: true })).rejects.toThrow("VOICE_PB_READ_REFUSED");
    expect(await countSessions(f.source.id)).toBe(1);
  });
  it("database-clock expiry refuses the read without extending or rewriting persisted evidence", async () => {
    const f = await fixture(); const expires = Date.now() + 5_000;
    f.input.consent.expiresAt = new Date(expires).toISOString();
    const prepared = await prepare(f);
    const before = await prisma.voiceIntakeSession.findUniqueOrThrow({ where: { id: prepared.sessionId }, include: { segments: true } });
    await new Promise(resolve => setTimeout(resolve, Math.max(0, expires - Date.now()) + 100));
    await expect(readProjectBrainVoiceSession({ actorUserId: f.user.id, workspaceId: f.workspaceId, sessionId: prepared.sessionId }, { enabled: true })).rejects.toThrow("VOICE_PB_READ_EXPIRED");
    expect(await prisma.voiceIntakeSession.findUniqueOrThrow({ where: { id: prepared.sessionId }, include: { segments: true } })).toEqual(before);
  }, 15_000);
  it("database guards reject subject mutation/deletion and missing segment at deferred commit", async () => {
    const f = await fixture(); const result = await prepare(f);
    await expect(prisma.$executeRawUnsafe('UPDATE "VoiceIntakeSession" SET "sourceBindingHash"=$2 WHERE id=$1', result.sessionId, "0".repeat(64))).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('UPDATE "VoiceIntakeSession" SET "clientId"=$2 WHERE id=$1', result.sessionId, f.user.id)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('DELETE FROM "VoiceIntakeSession" WHERE id=$1', result.sessionId)).rejects.toThrow();
    await expect(prisma.$transaction(async tx => { await tx.$executeRawUnsafe('DELETE FROM "VoiceIntakeSegment" WHERE "sessionId"=$1', result.sessionId); }, { isolationLevel: "Serializable" })).rejects.toThrow();
    expect(await prisma.voiceIntakeSegment.count({ where: { sessionId: result.sessionId } })).toBe(1);
  });
  it("session status uncertainty preserves one-use and legacy CLIENT path remains closed", async () => {
    const f = await fixture(); const result = await prepare(f);
    const segment = await prisma.voiceIntakeSegment.findFirstOrThrow({ where: { sessionId: result.sessionId } });
    await expect(reserveVoiceAiOperation({ actor: { id: f.user.id, role: "CLIENT" }, sessionId: result.sessionId, segmentId: segment.id, audioFingerprint: segment.audioFingerprint })).rejects.toThrow("voice_session_not_owned");
    await prisma.$executeRawUnsafe('UPDATE "VoiceIntakeSession" SET status=\'transcribing\' WHERE id=$1', result.sessionId);
    await prisma.$executeRawUnsafe('UPDATE "VoiceIntakeSession" SET status=\'uncertain\' WHERE id=$1', result.sessionId);
    expect(await createProjectBrainVoiceSession(f.input, { enabled: true })).toMatchObject({ status: "REPLAYED_LOCAL_NOT_AUTHORIZED", sessionStatus: "uncertain" });
    expect(await prisma.aiOperation.count({ where: { voiceIntakeSegmentId: segment.id } })).toBe(0);
  });
  it("raw SQL rejects malformed transformer metadata even with a freshly recomputed manifest hash", async () => {
    const f = await fixture(); const prepared = await prepare(f);
    const [stored] = await prisma.$queryRawUnsafe<Array<{ segmentManifest: unknown }>>('SELECT "segmentManifest" FROM "VoiceIntakeSession" WHERE id=$1', prepared.sessionId);
    for (const field of ["id", "version", "encodingProfile"]) {
      for (const value of [null, {}, "", "a".repeat(161), "😀".repeat(81)]) {
        const manifest = JSON.parse(JSON.stringify(stored.segmentManifest)); manifest.transformer[field] = value;
        await expect(prisma.$executeRawUnsafe(
          `INSERT INTO "VoiceIntakeSession" SELECT (jsonb_populate_record(NULL::"VoiceIntakeSession", to_jsonb(s) ||
           jsonb_build_object('id',$2::text,'segmentManifest',$3::jsonb,'segmentManifestHash',$4::text))).*
           FROM "VoiceIntakeSession" s WHERE id=$1`, prepared.sessionId, randomUUID(), JSON.stringify(manifest), sha256Canonical(manifest),
        )).rejects.toThrow("voice_pb_transformer_refused");
      }
    }
    expect(await countSessions(f.source.id)).toBe(1);
  });
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("canonical JSON and UTC timestamp defaults round-trip in %s", async timezone => {
    await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", timezone);
      const json = { schemaVersion: 1, texte: "Québec — l'heure: 14 h\n\\\"", segments: [{ ordinal: 0, durationMs: 256, ok: false }], amount: "9223372036854775807", nil: null };
      const [row] = await tx.$queryRawUnsafe<Array<{ hash: string; exact: boolean }>>(
        `SELECT encode(sha256(convert_to(voice_pb_canonical_json($1::jsonb),'UTF8')),'hex') AS hash,
         (($2::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') = $2::timestamptz AS exact`, JSON.stringify(json), new Date("2026-09-10T12:34:56.789Z"));
      expect(row.hash).toBe(sha256Canonical(json)); expect(row.exact).toBe(true);
    });
  });
});
