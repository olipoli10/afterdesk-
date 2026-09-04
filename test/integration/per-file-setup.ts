import { afterAll, beforeAll } from "vitest";
import { assertSafeIntegrationDb } from "./guard";
import { resolveL3TestDatabaseUrl } from "./resolve-l3-db";

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
 * This module re-runs once per FILE in the same worker process.
 * After the first run, DATABASE_URL already IS the test URL — re-running
 * the guard then would trip its own condition 5 (SAME_AS_APP_DB) against
 * the redirection it performed itself. The guard's job is done the moment
 * the process is pointed at the disposable database; subsequent files only
 * need the truncation below.
 */
if (process.env.DATABASE_URL !== process.env.AFTERDESK_TEST_DATABASE_URL) {
  const db = assertSafeIntegrationDb(process.env, {
    l3TestDatabaseUrl: resolveL3TestDatabaseUrl() ?? undefined,
  });
  process.env.DATABASE_URL = db.url;
  process.env.DIRECT_URL = db.url;
}

/**
 * APPEND-ONLY GUARD TRIGGERS, BY NAME — each blocks TRUNCATE by
 * design, same reasoning as before — session-disabled here is acceptable
 * ONLY because the guard proved this database is disposable.
 *
 * `SET session_replication_role = replica` used to do this, session-wide, in
 * one statement. It requires actual Postgres superuser, which the local
 * `prisma dev` cluster grants its connecting role but Neon's `neondb_owner`
 * does not — this suite had never actually been run against Neon until this
 * session, and it failed here with `permission denied to set parameter
 * "session_replication_role"` the first time it was. `ALTER TABLE ... DISABLE
 * TRIGGER <name>` needs only TABLE OWNERSHIP for an ordinary user-defined
 * trigger like the explicitly registered guards below, which the connecting role has on both local
 * Postgres and Neon — so this works everywhere the old approach only worked
 * locally, and it disables only named guards rather than every
 * trigger in the database for the transaction's duration.
 */
const TRUNCATE_GUARDED_TABLES = [
  { table: "LedgerEntry", trigger: "LedgerEntry_no_truncate" },
  {
    table: "TaskAcceptanceSnapshot",
    trigger: "TaskAcceptanceSnapshot_no_truncate",
  },
  {
    table: "TaskOperationalBaseline",
    trigger: "TaskOperationalBaseline_no_truncate",
  },
  /**
   * HUMAN WORK UNIT. Both refuse TRUNCATE by design — an acceptance is the
   * frozen record of what a reviewer signed off on, and a transition trail
   * that can be wiped is not evidence.
   *
   * Registering them here is not optional and is easy to miss: a BEFORE
   * TRUNCATE guard absent from this list does not fail its own file, it fails
   * the NEXT one, which reads as unrelated breakage. Session-disabled during
   * truncation only because the guard proved this database is disposable.
   */
  {
    table: "HumanWorkUnitAcceptance",
    trigger: "afterdesk_human_unit_acceptance_no_truncate",
  },
  {
    table: "HumanWorkUnitTransition",
    trigger: "afterdesk_human_unit_transition_no_truncate",
  },
  {
    table: "ConstructionHumanEscalation",
    trigger: "ConstructionHumanEscalation_guard_truncate",
  },
  {
    table: "ConstructionReceivableEvent",
    trigger: "ConstructionReceivableEvent_guard_truncate",
  },
  {
    table: "ConstructionJobTransition",
    trigger: "ConstructionJobTransition_guard_truncate",
  },
  {
    table: "ConstructionFollowUpTransition",
    trigger: "ConstructionFollowUpTransition_guard_truncate",
  },
  {
    table: "ConstructionEconomicCommand",
    trigger: "ConstructionEconomicCommand_guard_truncate",
  },
  {
    table: "ConstructionProjectBrainIntake",
    trigger: "ConstructionProjectBrainIntake_no_truncate",
  },
  {
    table: "ConstructionProjectBrainSource",
    trigger: "ConstructionProjectBrainSource_no_truncate",
  },
  {
    table: "ConstructionProjectBrainSnapshot",
    trigger: "ConstructionProjectBrainSnapshot_no_truncate",
  },
  {
    table: "ConstructionProjectBrainDecision",
    trigger: "ConstructionProjectBrainDecision_no_truncate",
  },
  {
    table: "ConstructionProjectBrainFactCandidateBatch",
    trigger: "ConstructionProjectBrainFactCandidateBatch_no_truncate",
  },
  {
    table: "ConstructionProjectBrainFactCandidate",
    trigger: "ConstructionProjectBrainFactCandidate_no_truncate",
  },
  {
    table: "ConstructionProjectBrainFactCandidateDecision",
    trigger: "ConstructionProjectBrainFactCandidateDecision_no_truncate",
  },
  { table: "ConstructionProjectBrainUnderstandingReview", trigger: "CPBUR_no_truncate" },
  { table: "ConstructionProjectBrainCandidateDisposition", trigger: "CPBUDisp_no_truncate" },
  { table: "ConstructionProjectBrainContradiction", trigger: "CPBUContr_no_truncate" },
  { table: "ConstructionProjectBrainContradictionMember", trigger: "CPBUCM_no_truncate" },
  { table: "ConstructionProjectBrainContradictionResolution", trigger: "CPBURes_no_truncate" },
  { table: "ConstructionProjectBrainUnderstandingSnapshot", trigger: "CPBUSnap_no_truncate" },
  { table: "ConstructionProjectBrainUnderstandingDecision", trigger: "CPBUDec_no_truncate" },
];

beforeAll(async () => {
  const { prisma } = await import("@/lib/db");
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'it_schema_marker')`,
  );
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$transaction([
    ...TRUNCATE_GUARDED_TABLES.map(({ table, trigger }) =>
      prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`,
      ),
    ),
    prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`),
    ...TRUNCATE_GUARDED_TABLES.map(({ table, trigger }) =>
      prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`,
      ),
    ),
  ]);
});

afterAll(async () => {
  // Each file has an isolated module graph and therefore its own Prisma
  // singleton. Close it before the next file starts so the direct local
  // PostgreSQL server never accumulates abandoned pools across the suite.
  const { prisma } = await import("@/lib/db");
  await prisma.$disconnect();
});
