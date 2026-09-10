import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { purgeExpiredVoiceIntakeContent } from "@/server/model-gateway/voice/transcripts";
import { requirePersonalDisposableDatabase } from "./personal-model.fixture";
requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
const now = new Date("2026-09-10T16:00:00.000Z");
const legacySql = `WITH due AS (SELECT t.id FROM "VoiceTranscriptSegment" t JOIN "VoiceIntakeSegment" s ON s.id=t."segmentId" JOIN "VoiceIntakeSession" v ON v.id=s."sessionId" WHERE t."purgedAt" IS NULL AND (t."expiresAt" <= $1 OR v.status IN ('cancelled','purged')) ORDER BY t."expiresAt",t.id LIMIT $2 FOR UPDATE OF t SKIP LOCKED) UPDATE "VoiceTranscriptSegment" t SET text='',"purgedAt"=$1 FROM due WHERE t.id=due.id RETURNING t.id`;
const rollbackOnly = new Error("SYNTHETIC_PURGE_FIXTURE_ROLLBACK_ONLY");
async function inFixture(timezone: string, check: (tx: Prisma.TransactionClient) => Promise<void>) {
  requirePersonalDisposableDatabase();
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", timezone);
      // These session-local TEMP names shadow the application tables. No real
      // application transcript is read or modified; the entire fixture rolls back.
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "VoiceIntakeSession" (id text PRIMARY KEY,status text NOT NULL) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "VoiceIntakeSegment" (id text PRIMARY KEY,"sessionId" text NOT NULL) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "VoiceTranscriptSegment" (id text PRIMARY KEY,"segmentId" text NOT NULL,text text NOT NULL,"expiresAt" timestamp(3) NOT NULL,"purgedAt" timestamp(3)) ON COMMIT DROP');
      await tx.$queryRawUnsafe("SELECT set_config('search_path','pg_temp',true)");
      const [scope] = await tx.$queryRawUnsafe<Array<{ timezone: string; temporary: boolean }>>(`SELECT current_setting('TimeZone') AS timezone,
        (SELECT relnamespace=pg_my_temp_schema() FROM pg_class WHERE oid='"VoiceTranscriptSegment"'::regclass) AS temporary`);
      expect(scope).toEqual({ timezone, temporary: true });
      await tx.$executeRawUnsafe(`INSERT INTO "VoiceIntakeSession" VALUES ('synthetic-session','transcribing')`);
      await tx.$executeRawUnsafe(`INSERT INTO "VoiceIntakeSegment" VALUES ('synthetic-segment-due','synthetic-session'),('synthetic-segment-future','synthetic-session')`);
      await tx.$executeRawUnsafe(`INSERT INTO "VoiceTranscriptSegment" VALUES
        ('synthetic-due','synthetic-segment-due','SYNTHETIC_DUE',TIMESTAMP '2026-09-10 15:00:00',NULL),
        ('synthetic-future','synthetic-segment-future','SYNTHETIC_FUTURE',TIMESTAMP '2026-09-10 17:00:00',NULL)`);
      await check(tx); throw rollbackOnly;
    }, { isolationLevel: "Serializable", timeout: 5000 });
  } catch (error) { if (error !== rollbackOnly) throw error; }
}
describe("real PostgreSQL purge SQL using rollback-only synthetic TEMP tables, not application FK coverage", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("retains the falsifiable old Date inference control in %s", async timezone => {
    await inFixture(timezone, async tx => {
      const legacy = await tx.$queryRawUnsafe<Array<{ id: string }>>(legacySql, now, 100);
      expect(legacy.map(r => r.id).sort()).toEqual(timezone === "UTC" ? ["synthetic-due"] : timezone === "America/New_York" ? [] : ["synthetic-due", "synthetic-future"]);
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; stored: string | null }>>(`SELECT id,to_char("purgedAt",'YYYY-MM-DD HH24:MI:SS.MS') AS stored FROM "VoiceTranscriptSegment" ORDER BY id`);
      expect(rows).toEqual(timezone === "UTC" ? [{ id: "synthetic-due", stored: "2026-09-10 16:00:00.000" }, { id: "synthetic-future", stored: null }]
        : timezone === "America/New_York" ? [{ id: "synthetic-due", stored: null }, { id: "synthetic-future", stored: null }]
          : [{ id: "synthetic-due", stored: "2026-09-11 01:00:00.000" }, { id: "synthetic-future", stored: "2026-09-11 01:00:00.000" }]);
    });
  });
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("actual maintenance function expires only the due text and stores UTC in %s", async timezone => {
    await inFixture(timezone, async tx => {
      const delegated = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: (inner: Prisma.TransactionClient) => Promise<unknown>) => work(tx)) as typeof prisma.$transaction);
      try { expect(await purgeExpiredVoiceIntakeContent({ now, batchSize: 100 })).toBe(1); expect(await purgeExpiredVoiceIntakeContent({ now, batchSize: 100 })).toBe(0); }
      finally { delegated.mockRestore(); }
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; text: string; purgedAt: Date | null; stored: string | null }>>(`SELECT id,text,"purgedAt",to_char("purgedAt",'YYYY-MM-DD HH24:MI:SS.MS') AS stored FROM "VoiceTranscriptSegment" ORDER BY id`);
      expect(rows).toEqual([{ id: "synthetic-due", text: "", purgedAt: now, stored: "2026-09-10 16:00:00.000" },
        { id: "synthetic-future", text: "SYNTHETIC_FUTURE", purgedAt: null, stored: null }]);
    });
  });
});
