import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
const storage = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("@/lib/storage-local", () => ({
  LOCAL_OBJECT_SCAN_MAX_ENTRIES: 256,
  putLocalObject: async (key: string, bytes: Buffer) => { storage.set(key, Buffer.from(bytes)); },
  readLocalObject: async (key: string) => { const bytes = storage.get(key); if (!bytes) throw new Error("SYNTHETIC_OBJECT_MISSING"); return Buffer.from(bytes); },
  deleteLocalObject: async (key: string) => { storage.delete(key); },
  scanLocalObjects: async () => ({ entries: [], scannedEntries: 0, cycleComplete: true }),
}));
import { prisma } from "@/lib/db";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { dispatchVoiceGatewayAttempt } from "@/server/model-gateway/voice/dispatch";
import { readProjectBrainVoiceTranscriptReview as read, assertProjectBrainVoiceTranscriptReviewPublication as assertPublication } from "@/server/model-gateway/voice/project-brain-transcript-review";
import { requirePersonalDisposableDatabase } from "./personal-model.fixture";
import { projectBrainRecoveryFixture as fixture, projectBrainRecoveryRows as rows, type RecoveryFixture } from "./project-brain-voice-recovery.fixture";

requirePersonalDisposableDatabase();
afterAll(async () => { storage.clear(); await prisma.$disconnect(); });
type TxWork = (tx: Prisma.TransactionClient) => Promise<unknown>;
type TxOptions = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };
const identity = (f: RecoveryFixture) => ({ actorUserId: f.user.id, workspaceId: f.workspaceId, sessionId: f.session.sessionId });
const readFixture = (f: RecoveryFixture) => read(identity(f), { enabled: true });
async function succeed(f: RecoveryFixture) {
  expect(await dispatchVoiceGatewayAttempt({ admission: f.admission, actor: f.input.actor, rollout: f.options,
    abortSignal: new AbortController().signal })).toMatchObject({ status: "synthetic_succeeded", externalTransportPerformed: false, transcriptionQualityVerified: false });
}
async function waitForExpiry(f: RecoveryFixture) {
  const deadline = Date.now() + 12_000;
  for (;;) {
    const [clock] = await prisma.$queryRawUnsafe<Array<{ remaining: number }>>(`SELECT
      EXTRACT(EPOCH FROM ("expiresAt"-(clock_timestamp() AT TIME ZONE 'UTC')))*1000 AS remaining
      FROM "VoiceIntakeSession" WHERE id=$1`, f.session.sessionId);
    const remaining = Number(clock?.remaining);
    if (!Number.isFinite(remaining) || remaining > 10_000) throw new Error("SHORT_SYNTHETIC_TTL_REQUIRED");
    if (remaining <= 0) return;
    if (Date.now() >= deadline) throw new Error("SYNTHETIC_EXPIRY_WAIT_EXCEEDED");
    await prisma.$queryRawUnsafe("SELECT pg_sleep($1::double precision)::text", Math.min(remaining + 10, 250) / 1000);
  }
}

describe("PB protected synthetic review on real native ledger rows, no provider", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("reads exact accepted synthetic evidence and changes nothing under %s", async timezone => {
    const f = await fixture(storage); await succeed(f);
    const before = await rows(f), native = prisma.$transaction.bind(prisma), seen: string[] = [];
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: TxWork, options?: TxOptions) => native(async tx => {
      await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", timezone);
      const [setting] = await tx.$queryRawUnsafe<Array<{ timezone: string }>>("SELECT current_setting('TimeZone') AS timezone");
      seen.push(setting.timezone); return work(tx);
    }, options)) as typeof prisma.$transaction);
    try {
      const value = await readFixture(f);
      expect(value).toMatchObject({ status: "SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED", executionAuthorized: false,
        contentIntegrityVerified: true, syntheticReviewAvailable: true, realTranscriptionAvailable: false,
        transcriptionQualityVerified: false, semanticAccuracyVerified: false, projectFactConfirmed: false, externalTransportPerformed: false });
      if (value.status === "DISABLED") throw new Error("fixture");
      expect(value.text).toBe(before.transcripts[0].text); expect(value.textFingerprint).toBe(canonicalFingerprint(value.text));
      expect(value.orderedEvidence).toEqual([{ ordinal: 0, segmentId: f.segment.id, transcriptId: before.transcripts[0].id,
        gatewayOperationId: before.operation.id, gatewayAttemptId: before.attempt.id, audioFingerprint: f.segment.audioFingerprint,
        textFingerprint: before.transcripts[0].textFingerprint, responseEvidenceRef: before.attempt.responseEvidenceRef }]);
      expect(value.expiresAt).toBe(before.session.expiresAt.toISOString());
      expect(await readFixture(f)).toEqual(value); expect(await rows(f)).toEqual(before);
      expect(seen).toEqual([timezone, timezone]);
    } finally { wrapped.mockRestore(); }
  });
  it("OFF and incomplete admitted session disclose no content and change no evidence", async () => {
    const f = await fixture(storage), before = await rows(f);
    expect(await read(identity(f))).toEqual({ status: "DISABLED", executionAuthorized: false });
    await expect(readFixture(f)).rejects.toThrow("VOICE_PB_TRANSCRIPT_REVIEW_REFUSED"); expect(await rows(f)).toEqual(before);
  });
  it("an application CLIENT admin in the same workspace and a mismatched workspace are not the PB owner", async () => {
    const f = await fixture(storage); await succeed(f);
    const other = await prisma.user.create({ data: { email: `pb-read-admin-${randomUUID()}@example.invalid`, name: "Synthetic admin", role: "CLIENT", emailVerified: true } });
    await prisma.constructionWorkspaceMember.create({ data: { workspaceId: f.workspaceId, userId: other.id, role: "admin", status: "active" } });
    const before = await rows(f);
    await expect(read({ ...identity(f), actorUserId: other.id }, { enabled: true })).rejects.toThrow("VOICE_PB_READ_REFUSED");
    await expect(read({ ...identity(f), workspaceId: `wrong-${f.workspaceId}` }, { enabled: true })).rejects.toThrow("VOICE_PB_READ_REFUSED");
    expect(await rows(f)).toEqual(before);
  });
  it("revoke/regrant membership cannot revive the original pinned epoch", async () => {
    const f = await fixture(storage); await succeed(f);
    await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.user.id } }, data: { status: "revoked" } });
    await expect(readFixture(f)).rejects.toThrow("VOICE_PB_READ_REFUSED");
    await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.user.id } }, data: { status: "active" } });
    const before = await rows(f); await expect(readFixture(f)).rejects.toThrow("AUTHORITY_CHANGED"); expect(await rows(f)).toEqual(before);
  });
  it("unknown synthetic outcome is not a readable transcript or settled exposure", async () => {
    const f = await fixture(storage);
    expect(await dispatchVoiceGatewayAttempt({ admission: f.admission, actor: f.input.actor, rollout: f.options,
      abortSignal: new AbortController().signal, syntheticScenario: "UNKNOWN" })).toMatchObject({ status: "uncertain" });
    const before = await rows(f); expect(before.transcripts).toHaveLength(0); expect(before.attempt.accountSpendHold.status).toBe("held");
    await expect(readFixture(f)).rejects.toThrow("VOICE_PB_TRANSCRIPT_REVIEW_REFUSED"); expect(await rows(f)).toEqual(before);
  });
  it("real immutable transcript guards reject text/expiry tampering; reader does not repair evidence", async () => {
    const f = await fixture(storage); await succeed(f); const before = await rows(f);
    await expect(prisma.voiceTranscriptSegment.update({ where: { id: before.transcripts[0].id }, data: { text: "changed" } })).rejects.toThrow("VoiceTranscriptSegment content may only transition atomically to purged");
    await expect(prisma.voiceTranscriptSegment.update({ where: { id: before.transcripts[0].id }, data: { expiresAt: new Date(before.session.expiresAt.getTime() + 1) } })).rejects.toThrow("VoiceTranscriptSegment evidence is immutable");
    expect((await readFixture(f)).status).toBe("SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED"); expect(await rows(f)).toEqual(before);
  });
  it("a legal content-only purge makes the former result unreadable without changing its lineage", async () => {
    const f = await fixture(storage); await succeed(f); const before = await rows(f);
    await prisma.voiceTranscriptSegment.update({ where: { id: before.transcripts[0].id }, data: { text: "", purgedAt: new Date() } });
    const purged = await rows(f); await expect(readFixture(f)).rejects.toThrow("REVIEW_REFUSED"); expect(await rows(f)).toEqual(purged);
    expect(purged.transcripts[0].textFingerprint).toBe(before.transcripts[0].textFingerprint);
    expect(purged.attempt).toEqual(before.attempt); expect(purged.ai).toEqual(before.ai); expect(purged.source).toEqual(before.source);
  });
  it("an actually expired short consent/session never renews protected content", async () => {
    const f = await fixture(storage, { consentLifetimeMs: 8000 }); await succeed(f);
    expect((await readFixture(f)).status).toBe("SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED");
    const before = await rows(f); await waitForExpiry(f);
    await expect(readFixture(f)).rejects.toThrow("EXPIRED"); expect(await rows(f)).toEqual(before);
  });
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("suppresses disclosure after actual read commit followed by original DB expiry under %s", async timezone => {
    const f = await fixture(storage, { consentLifetimeMs: 4000 }); await succeed(f);
    const before = await rows(f), native = prisma.$transaction.bind(prisma);
    let committed = false, expired = false, databaseZone = "";
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: TxWork, options?: TxOptions) => {
      const result = await native(async tx => {
        await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", timezone);
        const [setting] = await tx.$queryRawUnsafe<Array<{ timezone: string }>>("SELECT current_setting('TimeZone') AS timezone");
        databaseZone = setting.timezone;
        return work(tx);
      }, options);
      committed = true;
      // The real read transaction has committed and released its locks. Delay
      // only delivery of its result; do not alter expiry, DB time or product budget.
      await waitForExpiry(f); expired = true; return result;
    }) as typeof prisma.$transaction);
    try {
      await expect(readFixture(f)).rejects.toThrow("VOICE_PB_TRANSCRIPT_REVIEW_REFUSED");
      expect(committed).toBe(true); expect(expired).toBe(true); expect(databaseZone).toBe(timezone);
    } finally { wrapped.mockRestore(); }
    expect(await rows(f)).toEqual(before);
  });
  it("an abort after a real successful read commit suppresses content without rewriting evidence", async () => {
    const f = await fixture(storage); await succeed(f);
    const before = await rows(f), native = prisma.$transaction.bind(prisma), controller = new AbortController();
    let committed = false;
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: TxWork, options?: TxOptions) => {
      const result = await native(work, options); committed = true; controller.abort(); return result;
    }) as typeof prisma.$transaction);
    try {
      await expect(read(identity(f), { enabled: true }, { deadlineAt: Date.now() + 10000,
        monotoneDeadlineAt: performance.now() + 10000, signal: controller.signal })).rejects.toThrow("VOICE_PB_TRANSCRIPT_REVIEW_REFUSED");
      expect(committed).toBe(true); expect(controller.signal.aborted).toBe(true);
    } finally { wrapped.mockRestore(); }
    expect(await rows(f)).toEqual(before);
  });
  it("the exact returned native result loses publication eligibility at original DB expiry and copies never qualify", async () => {
    const f = await fixture(storage, { consentLifetimeMs: 4000 }); await succeed(f);
    const before = await rows(f), value = await readFixture(f);
    expect(value.status).toBe("SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED");
    expect(() => assertPublication(value)).not.toThrow();
    const wire = JSON.stringify(value);
    expect(wire).not.toMatch(/databaseNowMs|clockStartedMono|monotoneDeadline|publicationGuard/);
    expect(() => assertPublication(JSON.parse(wire))).toThrow("VOICE_PB_TRANSCRIPT_REVIEW_REFUSED");
    await waitForExpiry(f);
    expect(() => assertPublication(value)).toThrow("VOICE_PB_TRANSCRIPT_REVIEW_REFUSED");
    expect(await rows(f)).toEqual(before);
  });
  it("two real reader backends may share the canonical lock and return the same immutable evidence", async () => {
    const f = await fixture(storage); await succeed(f); const before = await rows(f);
    const native = prisma.$transaction.bind(prisma), pids: number[] = [];
    let release!: () => void, timedOut = false, completedUnderLocks = 0;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const timer = setTimeout(() => { timedOut = true; release(); }, 750);
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: TxWork, options?: TxOptions) => native(async tx => {
      const [backend] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
      pids.push(backend.pid);
      const result = await work(tx);
      // Both reads must finish while each still holds its transaction locks.
      // A mistakenly exclusive advisory cannot complete both before release.
      completedUnderLocks++; if (completedUnderLocks === 2) release(); await ready; return result;
    }, options)) as typeof prisma.$transaction);
    try {
      const outcomes = await Promise.allSettled([readFixture(f), readFixture(f)]);
      expect(timedOut).toBe(false); expect(new Set(pids).size).toBe(2); expect(completedUnderLocks).toBe(2);
      const values = outcomes.map(outcome => { if (outcome.status === "rejected") throw outcome.reason; return outcome.value; });
      expect(values[0]).toEqual(values[1]);
    } finally { clearTimeout(timer); release(); wrapped.mockRestore(); }
    expect(await rows(f)).toEqual(before);
  });
  it("the current-owner read holds a real revocation until its transaction completes; next read refuses", async () => {
    const f = await fixture(storage); await succeed(f);
    const native = prisma.$transaction.bind(prisma);
    let readerReady!: () => void, releaseReader!: () => void, writerReady!: () => void, writerPid = 0, timedOut = false;
    const ready = new Promise<void>(resolve => { readerReady = resolve; }), held = new Promise<void>(resolve => { releaseReader = resolve; });
    const writerStarted = new Promise<void>(resolve => { writerReady = resolve; });
    const timer = setTimeout(() => { timedOut = true; readerReady(); writerReady(); releaseReader(); }, 2000);
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: TxWork, options?: TxOptions) => native(async tx => {
      const result = await work(tx); readerReady(); await held; return result;
    }, options)) as typeof prisma.$transaction);
    const reading = readFixture(f).then(value => ({ ok: true as const, value }), error => { readerReady(); return { ok: false as const, error }; });
    let writing: Promise<{ ok: true } | { ok: false; error: unknown }> | undefined;
    try {
      await ready;
      writing = native(async tx => {
        const [backend] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
        writerPid = backend.pid; writerReady();
        await tx.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.user.id } }, data: { status: "revoked" } });
      }, { timeout: 4000 }).then(() => ({ ok: true as const }), error => { writerReady(); return { ok: false as const, error }; });
      await writerStarted;
      let blocked = false;
      for (let i = 0; i < 25 && !blocked; i++) {
        const [state] = await prisma.$queryRawUnsafe<Array<{ blocked: boolean }>>("SELECT cardinality(pg_blocking_pids($1::int))>0 AS blocked", writerPid);
        blocked = state?.blocked === true;
        if (!blocked) await prisma.$queryRawUnsafe("SELECT pg_sleep(0.01)::text");
      }
      expect(blocked).toBe(true); expect(timedOut).toBe(false);
    } finally {
      clearTimeout(timer); releaseReader(); wrapped.mockRestore();
      const r = await reading; if (!r.ok) throw r.error;
      expect(r.value.status).toBe("SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED");
      if (writing) { const w = await writing; if (!w.ok) throw w.error; }
    }
    const revoked = await rows(f); await expect(readFixture(f)).rejects.toThrow("VOICE_PB_READ_REFUSED"); expect(await rows(f)).toEqual(revoked);
  });
});
