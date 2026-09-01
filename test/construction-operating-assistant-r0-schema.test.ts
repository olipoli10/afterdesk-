import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
const migrationPath = join(
  root,
  "prisma",
  "migrations",
  "20260901020000_endvera_construction_open_loop_r0",
  "migration.sql",
);

describe("Construction Operating Assistant R0 additive schema", () => {
  it("defines durable loop, fact, evidence, contradiction, transition and snapshot records", () => {
    for (const model of [
      "ConstructionOpenLoop",
      "ConstructionOpenLoopFact",
      "ConstructionOpenLoopEvidence",
      "ConstructionOpenLoopContradiction",
      "ConstructionOpenLoopTransition",
      "ConstructionOpenLoopSnapshot",
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it("keeps the migration forward-only and enforces idempotent/versioned records", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ConstructionOpenLoop_workspaceId_idempotencyKey_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ConstructionOpenLoop_workspaceId_semanticKey_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ConstructionOpenLoopTransition_loopId_idempotencyKey_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ConstructionOpenLoopSnapshot_loopId_stateVersion_key"',
    );
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
    expect(migration).not.toMatch(/TRUNCATE/i);
  });

  it("links loops to the existing workspace, project, source message and optional action", () => {
    expect(schema).toMatch(/openLoops\s+ConstructionOpenLoop\[\]/);
    expect(schema).toMatch(/openedByMessage\s+ConstructionMessage/);
    expect(schema).toMatch(/openLoopId\s+String\?/);
    expect(schema).toMatch(/relatedOpenLoopId\s+String\?/);
    expect(schema).toMatch(/semanticKey\s+String/);
    expect(schema).toMatch(/dueAt\s+DateTime\?/);
    expect(schema).toMatch(/dueState\s+String/);
  });
});
