import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tx: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.tx } }));
import { purgeExpiredVoiceIntakeContent } from "@/server/model-gateway/voice/transcripts";
const legacySql = `WITH due AS (SELECT t.id FROM "VoiceTranscriptSegment" t JOIN "VoiceIntakeSegment" s ON s.id=t."segmentId" JOIN "VoiceIntakeSession" v ON v.id=s."sessionId" WHERE t."purgedAt" IS NULL AND (t."expiresAt" <= $1 OR v.status IN ('cancelled','purged')) ORDER BY t."expiresAt",t.id LIMIT $2 FOR UPDATE OF t SKIP LOCKED) UPDATE "VoiceTranscriptSegment" t SET text='',"purgedAt"=$1 FROM due WHERE t.id=due.id RETURNING t.id`;
beforeEach(() => { vi.resetAllMocks(); m.tx.mockImplementation(async work => work({ $queryRawUnsafe: m.query })); m.query.mockResolvedValue([]); });
describe("voice purge UTC-naive date binding", () => {
  it("uses UTC-naive conversion for both expiry comparison and purge timestamp assignment", async () => {
    const now = new Date("2026-09-10T16:00:00.000Z"); await purgeExpiredVoiceIntakeContent({ now, batchSize: 7 });
    const [sql, date, size] = m.query.mock.calls[0];
    expect(sql).toContain('t."expiresAt" <= ($1::timestamptz AT TIME ZONE \'UTC\')');
    expect(sql).toContain('"purgedAt"=($1::timestamptz AT TIME ZONE \'UTC\')');
    expect(date).toEqual(now); expect(size).toBe(7);
  });
  it("changes only the two Date expressions, preserving bounded SKIP LOCKED/idempotent content-first SQL", async () => {
    await purgeExpiredVoiceIntakeContent(); const sql = m.query.mock.calls[0][0];
    expect(sql.replaceAll("($1::timestamptz AT TIME ZONE 'UTC')", "$1")).toBe(legacySql);
    expect(m.query.mock.calls[0][2]).toBe(100);
  });
  it("returns the exact affected count then zero without retry or transcript reinsert", async () => {
    m.query.mockResolvedValueOnce([{ id: "synthetic-expired" }]).mockResolvedValueOnce([]);
    expect(await purgeExpiredVoiceIntakeContent()).toBe(1); expect(await purgeExpiredVoiceIntakeContent()).toBe(0);
    expect(m.tx).toHaveBeenCalledTimes(2); expect(m.query).toHaveBeenCalledTimes(2);
  });
  it("snapshots the maintenance instant before waiting for its transaction", async () => {
    const mutableNow = new Date("2026-09-10T16:00:00.000Z");
    m.tx.mockImplementation(async work => { await Promise.resolve(); return work({ $queryRawUnsafe: m.query }); });
    const pending = purgeExpiredVoiceIntakeContent({ now: mutableNow }); mutableNow.setUTCHours(23);
    await pending; expect(m.query.mock.calls[0][1]).toEqual(new Date("2026-09-10T16:00:00.000Z"));
  });
  it.each([0, -1, 501, NaN, 1.5])("invalid batch %s refuses before database", async batchSize => {
    await expect(purgeExpiredVoiceIntakeContent({ batchSize })).rejects.toThrow("INVALID_VOICE_PURGE_BATCH"); expect(m.tx).not.toHaveBeenCalled();
  });
});
