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
import { requirePersonalDisposableDatabase } from "./personal-model.fixture";
import { projectBrainRecoveryFixture as fixture, expireProjectBrainRecoveryClaim as expire, projectBrainRecoveryRows as rows } from "./project-brain-voice-recovery.fixture";
import { recoverExpiredProjectBrainVoiceAttempts as recover } from "@/server/model-gateway/voice/project-brain-recovery";
import { dispatchVoiceGatewayAttempt } from "@/server/model-gateway/voice/dispatch";
import { claimAiOperation } from "@/server/ai-operations";

requirePersonalDisposableDatabase();
afterAll(async () => { storage.clear(); await prisma.$disconnect(); });
const enabled = { enabled: true, environment: "local" as const };
type TxWork = (tx: Prisma.TransactionClient) => Promise<unknown>;
type TxOptions = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };

function unchangedEvidence(before: Awaited<ReturnType<typeof rows>>, after: Awaited<ReturnType<typeof rows>>) {
  expect(after.attempt.accountSpendHold).toEqual(before.attempt.accountSpendHold);
  expect(after.source).toEqual(before.source);
  expect(after.ai).toMatchObject({ attempts: 1, lockedBy: before.ai.lockedBy, lockedAt: before.ai.lockedAt,
    leaseExpiresAt: before.ai.leaseExpiresAt, lastError: before.ai.lastError, resultKind: before.ai.resultKind, resultId: before.ai.resultId });
  expect(after.session.sourceBinding).toEqual(before.session.sourceBinding);
  expect(after.session.segmentManifest).toEqual(before.session.segmentManifest);
  expect(after.attempt.requestEvidenceRef).toBe(before.attempt.requestEvidenceRef);
  expect(after.transcripts).toEqual(before.transcripts); expect(after.usages).toEqual(before.usages);
  expect(after.audits.filter(a => before.audits.some(b => a.id === b.id))).toEqual(before.audits);
}

describe("PB expired-lease recovery in a real disposable database; no provider", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("prepared claim expires by DB clock and cancels without budget release under %s", async timezone => {
    const f = await fixture(storage);
    const nativeTransaction = prisma.$transaction.bind(prisma), observed: string[] = [];
    // A real transaction delegated unchanged, only timezone is transaction-local.
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: TxWork, options?: TxOptions) =>
      nativeTransaction(async tx => {
        await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", timezone);
        const [setting] = await tx.$queryRawUnsafe<Array<{ timezone: string }>>(`SELECT current_setting('TimeZone') AS timezone`);
        observed.push(setting.timezone); return work(tx);
      }, options)) as typeof prisma.$transaction);
    try {
      await expire(f.admission); const before = await rows(f), started = Date.now();
      expect(await recover(enabled)).toMatchObject({ recovered: 1, cancelledBeforeDispatch: 1, uncertain: 0, executionAuthorized: false });
      const after = await rows(f);
      expect(after.ai.status).toBe("abandoned"); expect(after.session.status).toBe("incomplete"); expect(after.segment.status).toBe("failed");
      expect(after.attempt).toMatchObject({ status: "cancelled_before_dispatch", dispatchState: "not_dispatched", resultContractStatus: "not_evaluated", dispatchedAt: null });
      expect(after.operation).toMatchObject({ status: "refused", finalAttemptId: after.attempt.id });
      unchangedEvidence(before, after);
      expect(after.ai.finishedAt!.getTime()).toBeGreaterThanOrEqual(started);
      expect(after.ai.finishedAt!.getTime()).toBeLessThanOrEqual(Date.now());
      expect(observed.length).toBeGreaterThanOrEqual(2); expect(observed.every(value => value === timezone)).toBe(true);
      expect((await recover(enabled)).recovered).toBe(0); expect(await rows(f)).toEqual(after);
      expect(await claimAiOperation(f.admission.claim.operationKey)).toBeNull(); expect(await rows(f)).toEqual(after);
    } finally { wrapped.mockRestore(); }
  });
  it("a committed dispatch marker produces uncertainty, not a claimed invocation, and fences a late exact writer", async () => {
    const f = await fixture(storage); await expire(f.admission, true); const before = await rows(f);
    expect(await recover(enabled)).toMatchObject({ recovered: 1, uncertain: 1, cancelledBeforeDispatch: 0, budgetReservationReleased: false });
    const after = await rows(f); unchangedEvidence(before, after);
    expect(after.ai.status).toBe("abandoned"); expect(after.session.status).toBe("uncertain"); expect(after.segment.status).toBe("uncertain");
    expect(after.attempt).toMatchObject({ status: "uncertain", dispatchState: "unaccounted", errorClass: "unknown_dispatched_outcome" });
    // Real former-owner CAS using the exact stored short lease, not a fabricated
    // replacement admission. Terminal status must fence it even though nonce remains.
    const late = await prisma.$executeRawUnsafe(`UPDATE "AiOperation" SET status='succeeded'
      WHERE id=$1 AND "lockedBy"=$2 AND "leaseExpiresAt"=($3::timestamptz AT TIME ZONE 'UTC') AND status='running' AND attempts=1`,
    before.ai.id, before.ai.lockedBy, before.ai.leaseExpiresAt);
    expect(late).toBe(0); expect(await rows(f)).toEqual(after);
    expect((await recover(enabled)).recovered).toBe(0); expect(await rows(f)).toEqual(after);
  });
  it("OFF leaves an expired admitted claim completely unchanged", async () => {
    const f = await fixture(storage); await expire(f.admission); const before = await rows(f);
    expect((await recover()).status).toBe("DISABLED"); expect((await recover({ enabled: true })).status).toBe("DISABLED");
    expect(await rows(f)).toEqual(before);
    expect((await recover(enabled)).recovered).toBe(1); // End this actual lifecycle, no fixture reset.
  });
  it("two overlapping real backends terminalize one expired claim at most once", async () => {
    const f = await fixture(storage); await expire(f.admission); const before = await rows(f);
    const nativeTransaction = prisma.$transaction.bind(prisma), pids: number[] = [];
    let release!: () => void, rendezvousTimedOut = false;
    const ready = new Promise<void>(resolve => { release = resolve; }), timer = setTimeout(() => { rendezvousTimedOut = true; release(); }, 500);
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: TxWork, options?: TxOptions) =>
      nativeTransaction(async tx => {
        const [backend] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
        pids.push(backend.pid); if (pids.length === 2) release(); await ready; return work(tx);
      }, options)) as typeof prisma.$transaction);
    try {
      const outcomes = await Promise.allSettled([recover(enabled), recover(enabled)]);
      expect(rendezvousTimedOut).toBe(false);
      expect(new Set(pids).size).toBe(2);
      const successes = outcomes.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof recover>>> => r.status === "fulfilled");
      expect(successes.reduce((sum, r) => sum + r.value.recovered, 0)).toBe(1);
      for (const r of outcomes) if (r.status === "rejected") {
        const error = r.reason as { code?: string; meta?: { code?: string } };
        expect(error.code === "P2034" || error.code === "P2010" && error.meta?.code === "40001").toBe(true);
      }
    } finally { clearTimeout(timer); release(); wrapped.mockRestore(); }
    const after = await rows(f); unchangedEvidence(before, after);
    expect(after.audits.length).toBe(before.audits.length + 1);
    expect((await recover(enabled)).recovered).toBe(0); expect(await rows(f)).toEqual(after);
  });
  it("an occupied canonical session advisory is skipped, then processed only after release", async () => {
    const f = await fixture(storage); await expire(f.admission); const before = await rows(f);
    let release!: () => void, locked!: () => void;
    const ready = new Promise<void>(resolve => { locked = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
    const timer = setTimeout(() => { release(); locked(); }, 1500);
    const locker = prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `voice-session-spend:${f.session.sessionId}`);
      locked(); await hold;
    }, { timeout: 2500 });
    const lockerOutcome = locker.then(() => ({ ok: true as const }), error => { locked(); return { ok: false as const, error }; });
    try {
      await ready;
      expect(await recover(enabled)).toMatchObject({ recovered: 0, skipped: 1 }); expect(await rows(f)).toEqual(before);
    } finally {
      clearTimeout(timer); release(); const outcome = await lockerOutcome;
      if (!outcome.ok) throw outcome.error;
    }
    expect((await recover(enabled)).recovered).toBe(1);
  });
  it("revocation does not prevent evidence-only recovery or alter the retained source", async () => {
    const f = await fixture(storage); await expire(f.admission);
    await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.user.id } }, data: { status: "revoked" } });
    const before = await rows(f); expect((await recover(enabled)).recovered).toBe(1); unchangedEvidence(before, await rows(f));
  });
  it("a real completed synthetic result and its settled hold are never rewritten", async () => {
    const f = await fixture(storage);
    expect(await dispatchVoiceGatewayAttempt({ admission: f.admission, actor: f.input.actor, rollout: f.options, abortSignal: new AbortController().signal })).toMatchObject({ status: "synthetic_succeeded" });
    const before = await rows(f);
    expect(before.transcripts).toHaveLength(1); expect(before.attempt.accountSpendHold.status).toBe("settled");
    expect((await recover(enabled)).recovered).toBe(0); expect(await rows(f)).toEqual(before);
  });
  it("the bounded sweep processes 25 of 26 real independent sessions then exactly one", async () => {
    const fixtures = [];
    for (let i = 0; i < 26; i++) { const f = await fixture(storage); await expire(f.admission); fixtures.push(f); }
    const before = await Promise.all(fixtures.map(rows));
    expect((await recover({ ...enabled, batchSize: 25 })).recovered).toBe(25);
    expect((await recover({ ...enabled, batchSize: 25 })).recovered).toBe(1);
    const after = await Promise.all(fixtures.map(rows));
    after.forEach((value, index) => { unchangedEvidence(before[index], value); expect(value.ai.status).toBe("abandoned"); });
    expect((await recover(enabled)).recovered).toBe(0);
  });
  // Keep this contradiction last: it must remain retained/ineligible, not be
  // silently erased or forced terminal merely to clean another test's fixtures.
  it("an existing synthetic AiUsage linked by physical operationId blocks recovery even without attempt usage FK", async () => {
    const f = await fixture(storage); await expire(f.admission);
    await prisma.aiUsage.create({ data: { userId: f.user.id, operationId: f.admission.claim.operationId, attempt: 1,
      purpose: "intake_voice_transcription", provider: "synthetic", model: "synthetic-existing-usage-fixture-not-provider-call", costMicros: 0 } });
    const before = await rows(f); expect(before.attempt.aiUsageId).toBeNull(); expect(before.usages).toHaveLength(1);
    expect(await recover(enabled)).toMatchObject({ recovered: 0, skipped: 1 }); expect(await rows(f)).toEqual(before);
  });
});
