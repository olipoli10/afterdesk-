import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { requirePersonalDisposableDatabase } from "./personal-model.fixture";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
describe("UTC-naive personal defaults and instant bindings on a disposable database", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("preserves future/expired dates, JSON equality and defaults in %s", async timezone => {
    requirePersonalDisposableDatabase();
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
      const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const future = new Date(now.getTime() + 60000), expired = new Date(now.getTime() - 60000);
      const id = "synthetic-utc-" + randomUUID();
      const budget = await tx.personalAssistantBudget.create({ data: { id, ceilingCadMicros: 1000n, expiresAt: future } });
      expect(Math.abs(budget.createdAt.getTime() - now.getTime())).toBeLessThan(5000);
      expect(budget.expiresAt.toISOString()).toBe(future.toISOString());
      const rows = await tx.$queryRaw<Array<{ exact: boolean; live: boolean; expired: boolean; jsonExact: boolean }>>`
        SELECT "expiresAt"=(${future}::timestamptz AT TIME ZONE 'UTC') AS exact,
          "expiresAt">(clock_timestamp() AT TIME ZONE 'UTC') AS live,
          (${expired}::timestamptz AT TIME ZONE 'UTC')<(clock_timestamp() AT TIME ZONE 'UTC') AS expired,
          "expiresAt"=((${JSON.stringify({ expiresAt: future.toISOString() })}::jsonb->>'expiresAt')::timestamptz AT TIME ZONE 'UTC') AS "jsonExact"
        FROM "PersonalAssistantBudget" WHERE id=${id}`;
      expect(rows).toEqual([{ exact: true, live: true, expired: true, jsonExact: true }]);
      const changed = await tx.$executeRaw`UPDATE "PersonalAssistantBudget" SET "reservedCadMicros"=1,
        "updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
        WHERE id=${id} AND "expiresAt"=(${future}::timestamptz AT TIME ZONE 'UTC') AND "expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')`;
      expect(changed).toBe(1);
      const changedAgain = await tx.$executeRaw`UPDATE "PersonalAssistantBudget" SET "reservedCadMicros"=2
        WHERE id=${id} AND "expiresAt"=(${expired}::timestamptz AT TIME ZONE 'UTC')`;
      expect(changedAgain).toBe(0);
    }, { isolationLevel: "Serializable" });
  });
  it("keeps all sixteen affected defaults UTC-naive without changing column types", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string; data_type: string; datetime_precision: number; column_default: string }>>`
      SELECT table_name,column_name,data_type,datetime_precision,column_default FROM information_schema.columns
      WHERE table_schema='public' AND (table_name,column_name) IN (
        ('AiUsage','createdAt'),('AiOperation','createdAt'),('AccountProviderSpendHold','createdAt'),
        ('ModelGatewayPolicyVersion','createdAt'),('ModelGatewayRouteProfile','createdAt'),('ModelGatewayOperation','createdAt'),
        ('ModelGatewayDecision','decidedAt'),('ModelGatewayAttempt','startedAt'),('ModelGatewayBreaker','changedAt'),
        ('ModelGatewayBreakerEvent','createdAt'),('ModelGatewayAuditEvent','createdAt'),
        ('PersonalAssistantOperation','createdAt'),('PersonalCalendarSmsConfirmationNonce','createdAt'),
        ('PersonalCalendarSmsConfirmation','createdAt'),('PersonalAssistantBudget','createdAt'),('PersonalAssistantDeliveryReceipt','createdAt'))`;
    expect(rows).toHaveLength(16);
    for (const row of rows) {
      expect(row.data_type).toBe("timestamp without time zone"); expect(row.datetime_precision).toBe(3);
      expect(row.column_default).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'");
    }
  });
});
