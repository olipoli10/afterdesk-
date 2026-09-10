import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(resolve(root, "prisma/migrations/20260910100000_personal_utc_naive_datetime_fix/migration.sql"), "utf8");
const previous = readFileSync(resolve(root, "prisma/migrations/20260910050000_calendar_sms_confirmation_store_off/migration.sql"), "utf8");
const moduleSource = (name: string) => readFileSync(resolve(root, "src/server/personal-assistant", name), "utf8");
const functionSource = (source: string, name: string) => {
  const start = source.indexOf("FUNCTION " + name + "()");
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("END $$;", start) + 7).replaceAll("\r\n", "\n");
};
describe("forward UTC repair retains confirmation authority and historical rows", () => {
  it.each(["calendar_confirmation_guard", "calendar_confirmation_final_binding"])("only normalizes datetime operands in %s", name => {
    const repaired = functionSource(migration, name)
      .replaceAll("(clock_timestamp() AT TIME ZONE 'UTC')", "clock_timestamp()")
      .replace(/\((\([^\n]*?\)::timestamptz) AT TIME ZONE 'UTC'\)/g, "$1");
    expect(repaired).toBe(functionSource(previous, name));
  });
  it("changes only sixteen scoped defaults and two existing functions", () => {
    expect([...migration.matchAll(/ALTER TABLE /g)]).toHaveLength(16);
    expect([...migration.matchAll(/CREATE OR REPLACE FUNCTION /g)]).toHaveLength(2);
    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE|TRUNCATE)\s+"(?:Personal|Model|Ai|Account)/);
    expect(migration).not.toMatch(/ALTER TABLE "Construction|DROP (?:CONSTRAINT|TRIGGER)|ALTER COLUMN "\w+" TYPE|SET TIME ?ZONE/i);
    expect(migration).toContain('ALTER TABLE "PersonalAssistantOperation" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE \'UTC\')');
    expect(migration).toContain('ALTER TABLE "ModelGatewayDecision" ALTER COLUMN "decidedAt"');
  });
  it("keeps Prisma defaults synchronized with the exact sixteen ALTER targets", () => {
    const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
    const alters = [...migration.matchAll(/ALTER TABLE "(\w+)" ALTER COLUMN "(\w+)" SET DEFAULT \(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'\);/g)];
    expect(alters).toHaveLength(16);
    for (const [, table, column] of alters) {
      const start = schema.indexOf("model " + table + " {");
      expect(start).toBeGreaterThanOrEqual(0);
      const body = schema.slice(start, schema.indexOf("\n}", start));
      const field = body.split(/\r?\n/).find(line => line.trim().startsWith(column + " "));
      expect(field).toContain('@default(dbgenerated("(CURRENT_TIMESTAMP AT TIME ZONE \'UTC\'::text)"))');
      expect(field).not.toContain("@db.Timestamptz");
    }
  });
  it.each(["calendar-confirmation-authority.ts", "calendar-sms-confirmation-store.ts", "calendar-confirmation-bridge.ts",
    "calendar-confirmation-worker.ts", "calendar-confirmation-maintenance.ts"])("normalizes naive SQL clocks in %s, preserving genuine instant SELECT", name => {
    const source = moduleSource(name).replace("SELECT clock_timestamp() AS now", "SELECT PRESERVED_INSTANT AS now");
    expect(source.match(/clock_timestamp\(\)(?! AT TIME ZONE 'UTC')/g)).toBeNull();
    expect(source).not.toMatch(/"leaseUntil"=\$\d/);
  });
  it("retains the absolute DB clock and explicitly normalizes all store Date positions", () => {
    expect(moduleSource("calendar-confirmation-authority.ts")).toContain("SELECT clock_timestamp() AS now");
    const store = moduleSource("calendar-sms-confirmation-store.ts");
    for (const n of [4, 5, 8, 16, 17]) expect(store).toContain("($" + n + "::timestamptz AT TIME ZONE 'UTC')");
  });
});
