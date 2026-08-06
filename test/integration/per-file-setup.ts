import { beforeAll } from "vitest";
import { assertSafeIntegrationDb } from "./guard";

/**
 * Runs in EVERY test worker before the file's imports execute their module
 * bodies is too late for env — so this file does two things in order:
 *
 *  1. re-run the guard (workers are separate processes from globalSetup;
 *     fail closed here too) and POINT the app's prisma singleton at the
 *     test database by overwriting DATABASE_URL/DIRECT_URL before any test
 *     file imports @/lib/db;
 *  2. TRUNCATE every application table before the file runs, so each file
 *     starts from a blank, migrated database. RESTART IDENTITY CASCADE;
 *     _prisma_migrations is excluded. The ledger's append-only trigger
 *     blocks TRUNCATE by design — it is session-disabled here, which is
 *     acceptable ONLY because the guard proved this database is disposable.
 */
/**
 * With isolate:false this module re-runs once per FILE in the same process.
 * After the first run, DATABASE_URL already IS the test URL — re-running
 * the guard then would trip its own condition 5 (SAME_AS_APP_DB) against
 * the redirection it performed itself. The guard's job is done the moment
 * the process is pointed at the disposable database; subsequent files only
 * need the truncation below.
 */
if (process.env.DATABASE_URL !== process.env.AFTERDESK_TEST_DATABASE_URL) {
  const db = assertSafeIntegrationDb(process.env);
  process.env.DATABASE_URL = db.url;
  process.env.DIRECT_URL = db.url;
}

beforeAll(async () => {
  const { prisma } = await import("@/lib/db");
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'it_schema_marker')`
  );
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET session_replication_role = replica`),
    prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`),
    prisma.$executeRawUnsafe(`SET session_replication_role = DEFAULT`),
  ]);
});
