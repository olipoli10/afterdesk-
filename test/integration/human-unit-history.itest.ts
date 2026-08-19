import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { splitSqlStatements } from "./global-setup";

const rawDatabaseUrl = process.env.AFTERDESK_TEST_DATABASE_URL;
if (!rawDatabaseUrl) throw new Error("AFTERDESK_TEST_DATABASE_URL is required");
const databaseUrl = rawDatabaseUrl.includes("pgbouncer=")
  ? rawDatabaseUrl
  : `${rawDatabaseUrl}&pgbouncer=true&connection_limit=1`;

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const schema = `hwu_history_${Date.now().toString(36)}`;

function migrationSql(directory: string): string {
  return readFileSync(
    join(process.cwd(), "prisma", "migrations", directory, "migration.sql"),
    "utf8"
  );
}

async function inHistorySchema<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    return fn(tx);
  });
}

async function applyMigration(directory: string): Promise<void> {
  const statements = splitSqlStatements(migrationSql(directory));
  await inHistorySchema(async (tx) => {
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
  });
}

async function historicalRows() {
  return inHistorySchema(async (tx) => {
    const [runs, packages, payouts, audits, steps] = await Promise.all([
      tx.$queryRawUnsafe(`SELECT to_jsonb(r) AS row FROM "TaskWorkflowRun" r ORDER BY "id"`),
      tx.$queryRawUnsafe(`SELECT to_jsonb(p) AS row FROM "TaskHumanWorkPackage" p ORDER BY "id"`),
      tx.$queryRawUnsafe(`SELECT to_jsonb(p) AS row FROM "Payout" p ORDER BY "id"`),
      tx.$queryRawUnsafe(`SELECT to_jsonb(e) AS row FROM "TaskEvent" e ORDER BY "id"`),
      tx.$queryRawUnsafe(`SELECT to_jsonb(s) AS row FROM "TaskExecutionPlanStep" s ORDER BY "id"`),
    ]);
    return { runs, packages, payouts, audits, steps };
  });
}

async function enumLabels(typeName: string): Promise<string[]> {
  return inHistorySchema(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ label: string }>>(
      `SELECT e.enumlabel AS label
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = '${schema}' AND t.typname = '${typeName}'
        ORDER BY e.enumsortorder`
    );
    return rows.map((row) => row.label);
  });
}

describe("HumanWorkUnit additive migration history", () => {
  let beforeRows: Awaited<ReturnType<typeof historicalRows>>;
  let runLabelsBefore: string[];
  let stepLabelsBefore: string[];

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await inHistorySchema(async (tx) => {
      const setupSql = `
        CREATE TYPE "TaskWorkflowRunStatus" AS ENUM
          ('pending', 'running', 'awaiting_human', 'completed', 'paused', 'abandoned');
        CREATE TYPE "TaskWorkflowStepStatus" AS ENUM
          ('pending', 'running', 'completed', 'failed', 'blocked');

        CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
        CREATE TABLE "File" ("id" TEXT PRIMARY KEY);
        CREATE TABLE "TaskExecutionPlanVersion" ("id" TEXT PRIMARY KEY);
        CREATE TABLE "TaskExecutionPlanStep" (
          "id" TEXT PRIMARY KEY,
          "planVersionId" TEXT NOT NULL
        );
        CREATE TABLE "TaskAcceptanceSnapshot" ("id" TEXT PRIMARY KEY);
        CREATE TABLE "TaskWorkflowRun" (
          "id" TEXT PRIMARY KEY,
          "status" "TaskWorkflowRunStatus" NOT NULL,
          "historicalMarker" TEXT NOT NULL
        );
        CREATE TABLE "Task" (
          "id" TEXT PRIMARY KEY,
          "claimedById" TEXT,
          "vaPayoutCents" INTEGER NOT NULL,
          "estimatedMinutes" INTEGER NOT NULL
        );
        CREATE TABLE "WorkflowBudgetHold" ("runId" TEXT NOT NULL);

        CREATE TABLE "TaskHumanWorkPackage" (
          "id" TEXT PRIMARY KEY,
          "runId" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "payload" JSONB NOT NULL
        );
        CREATE TABLE "Payout" (
          "id" TEXT PRIMARY KEY,
          "taskId" TEXT NOT NULL,
          "amountCents" INTEGER NOT NULL,
          "status" TEXT NOT NULL
        );
        CREATE TABLE "TaskEvent" (
          "id" TEXT PRIMARY KEY,
          "taskId" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "meta" JSONB NOT NULL
        );

        INSERT INTO "TaskExecutionPlanVersion" VALUES ('plan-historical');
        INSERT INTO "TaskExecutionPlanStep" VALUES ('step-historical', 'plan-historical');
        INSERT INTO "TaskWorkflowRun" VALUES
          ('run-historical', 'awaiting_human', 'terminal handover to the legacy pool');
        INSERT INTO "Task" VALUES ('task-historical', NULL, 4200, 60);
        INSERT INTO "TaskHumanWorkPackage" VALUES
          ('package-historical', 'run-historical', 'open', '{"source":"legacy","attempt":1}');
        INSERT INTO "Payout" VALUES
          ('payout-historical', 'task-historical', 4200, 'pending');
        INSERT INTO "TaskEvent" VALUES
          ('event-historical', 'task-historical', 'workflow_awaiting_human',
           '{"reason":"legacy_terminal_handover"}');
      `;
      for (const statement of splitSqlStatements(setupSql)) {
        await tx.$executeRawUnsafe(statement);
      }
    });

    beforeRows = await historicalRows();
    runLabelsBefore = await enumLabels("TaskWorkflowRunStatus");
    stepLabelsBefore = await enumLabels("TaskWorkflowStepStatus");

    // Enum additions must commit before the table migration uses them.
    await applyMigration("20260815120000_human_work_unit_enums");
    await applyMigration("20260815120100_human_work_unit");
  }, 60_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
  });

  it("preserves every pre-feature run, package, payout and audit byte-for-byte", async () => {
    const afterRows = await historicalRows();
    expect(afterRows.runs).toEqual(beforeRows.runs);
    expect(afterRows.packages).toEqual(beforeRows.packages);
    expect(afterRows.payouts).toEqual(beforeRows.payouts);
    expect(afterRows.audits).toEqual(beforeRows.audits);
  });

  it("adds nullable output-contract columns without inventing historical provenance", async () => {
    const afterRows = await historicalRows();
    expect(afterRows.steps).toEqual([
      {
        row: {
          id: "step-historical",
          planVersionId: "plan-historical",
          humanOutputSchema: null,
          humanRequiredArtifactKinds: [],
        },
      },
    ]);
    expect(beforeRows.steps).toEqual([
      { row: { id: "step-historical", planVersionId: "plan-historical" } },
    ]);
  });

  it("does not backfill or retroactively admit any historical run", async () => {
    await inHistorySchema(async (tx) => {
      const count = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint AS count FROM "HumanWorkUnitRunState"`
      );
      expect(count[0]?.count).toBe(0n);
    });
  });

  it("keeps awaiting_human as the same legacy terminal-handover value", async () => {
    const afterRows = await historicalRows();
    expect(afterRows.runs).toEqual(beforeRows.runs);
    expect((afterRows.runs as Array<{ row: { status: string; historicalMarker: string } }>)[0]).toEqual({
      row: {
        id: "run-historical",
        status: "awaiting_human",
        historicalMarker: "terminal handover to the legacy pool",
      },
    });
  });

  it("retains every pre-existing enum label in order and only appends new meanings", async () => {
    const runLabelsAfter = await enumLabels("TaskWorkflowRunStatus");
    const stepLabelsAfter = await enumLabels("TaskWorkflowStepStatus");
    expect(runLabelsAfter.filter((label) => runLabelsBefore.includes(label))).toEqual(runLabelsBefore);
    expect(stepLabelsAfter.filter((label) => stepLabelsBefore.includes(label))).toEqual(stepLabelsBefore);
    expect(runLabelsAfter).toContain("awaiting_human_unit");
    expect(stepLabelsAfter).toContain("blocked_on_human_unit");
  });
});
