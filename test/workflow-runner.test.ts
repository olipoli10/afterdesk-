import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-level pins for the runner, same discipline as
 * money-intent-lease.test.ts: this module talks to Postgres on every line, so
 * the invariants worth protecting are structural, and each one below is a
 * defect that was actually found and fixed rather than a style preference.
 */

const runner = readFileSync(
  join(__dirname, "..", "src/server/workflow-runs.ts"),
  "utf8"
);
const artifacts = readFileSync(
  join(__dirname, "..", "src/server/workflow-artifacts.ts"),
  "utf8"
);

describe("the pipeline runs strictly in order", () => {
  it("stops the walk at the first unfinished step instead of skipping it", () => {
    // Selecting "the lowest CLAIMABLE step" let the after() fast path and a
    // cron tick execute different stages of one run at the same time, so
    // build.csv could write an empty file from a payload that did not exist
    // yet. The loop must break unconditionally after the first candidate.
    const claim = runner.slice(
      runner.indexOf("async function claimNextStep"),
      runner.indexOf("for (const candidate of candidates)")
    );
    expect(claim).toContain("if (claimable) candidates.push(step);");
    expect(claim).toMatch(/if \(claimable\) candidates\.push\(step\);\s*\n\s*\/\/[^\n]*\n\s*break;/);
  });

  it("does not filter unfinished steps out of the query itself", () => {
    // Filtering in SQL would reintroduce the skip: an in-flight step simply
    // would not come back, and the next one would look like the first.
    const claim = runner.slice(
      runner.indexOf("async function claimNextStep"),
      runner.indexOf("for (const candidate of candidates)")
    );
    expect(claim).toContain('where: { runId, executionMode: "automated" }');
  });

  it("hands a withdrawn primitive to a person in place, without advancing", () => {
    // Skipping it left the run permanently stuck: the recovery branch below
    // could only ever be reached by a step that had already resolved.
    expect(runner).toContain('status: "handed_to_human"');
    expect(runner).toContain('executionMode: "human"');
  });
});

describe("a run that is no longer wanted stops", () => {
  it("abandons when the task has left ai_processing", () => {
    // cancelled and expired are legal exits an operator can take from the
    // admin task page at any moment, including mid-run. Without this the
    // machine keeps spending real money on a cancelled mandate.
    expect(runner).toContain('run.task.status !== "ai_processing"');
    expect(runner).toContain('status: "abandoned"');
  });

  it("checks the task status before writing the human package too", () => {
    const finish = runner.slice(runner.indexOf("export async function finishRun"));
    expect(finish).toContain('run.task.status !== "ai_processing"');
  });
});

describe("a replayed step cannot read its own output back as its input", () => {
  it("bounds the payload lookup by the order of the step about to run", () => {
    // persistPayload and the status:"done" write are two separate writes, so
    // a failure between them marks the step failed with its payload already
    // on disk. Unbounded, the retry fed extract.structured_rows the rows it
    // had just produced instead of the evidence it was meant to read.
    expect(artifacts).toContain("beforeOrder?: number");
    expect(artifacts).toContain("{ workflowStepRun: { order: { lt: beforeOrder } } }");
  });

  it("passes the step's own order at the call site", () => {
    expect(runner).toMatch(/loadLatestPayload\(\s*run\.id,\s*step\.order\s*\)/);
  });
});

describe("the durable-step motif keeps what MoneyIntent lacked", () => {
  it("leases, backs off deterministically, and alerts on exhaustion", () => {
    expect(runner).toContain("leaseExpiresAt");
    expect(runner).toContain("function backoffMs");
    // No jitter: a reproducible schedule is worth more than thundering-herd
    // protection at this volume.
    expect(runner).not.toMatch(/backoffMs[\s\S]{0,200}Math\.random/);
    expect(runner).toContain("notifyAdmins");
  });

  it("never lets a workflow failure become a payment failure", () => {
    expect(runner).toContain("// Never rethrow");
  });
});

describe("the payment guard survived the new state", () => {
  it("covers both statuses that can now reach the pool", () => {
    // Inserting ai_processing between payment and the pool made the original
    // OLD.status = 'awaiting_payment' test stop firing entirely.
    const migration = readFileSync(
      join(
        __dirname,
        "..",
        "prisma/migrations/20260806170200_workflow_guards/migration.sql"
      ),
      "utf8"
    );
    expect(migration).toContain(`OLD."status" IN ('awaiting_payment', 'ai_processing')`);
  });

  it("still refuses to quote or bill a standing capacity task", () => {
    // CREATE OR REPLACE replaces the whole body, so a clause left out of the
    // rewrite is a clause deleted. A first draft of this migration did drop
    // it while claiming to copy the function verbatim.
    const migration = readFileSync(
      join(
        __dirname,
        "..",
        "prisma/migrations/20260806170200_workflow_guards/migration.sql"
      ),
      "utf8"
    );
    expect(migration).toContain(`NEW."standingCapacityAccountId" IS NOT NULL`);
    expect(migration).toContain("already paid for by its block");
  });

  it("requires payment before spending money in ai_processing", () => {
    const migration = readFileSync(
      join(
        __dirname,
        "..",
        "prisma/migrations/20260806170200_workflow_guards/migration.sql"
      ),
      "utf8"
    );
    expect(migration).toContain(`NEW."status" = 'ai_processing'`);
    expect(migration).toContain("cannot enter automated processing without an authorized");
  });

  it("freezes the payout once a worker has claimed", () => {
    const migration = readFileSync(
      join(
        __dirname,
        "..",
        "prisma/migrations/20260806170200_workflow_guards/migration.sql"
      ),
      "utf8"
    );
    expect(migration).toContain("vaPayoutCents is frozen once a worker has claimed");
  });
});

describe("no migration in this slice is destructive", () => {
  it("adds and replaces, never drops a table or a column", () => {
    const dir = join(__dirname, "..", "prisma", "migrations");
    const ours = readdirSync(dir).filter((d) => d.startsWith("2026080617"));
    expect(ours.length).toBeGreaterThan(0);
    for (const name of ours) {
      const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
      expect(sql, `${name} drops a table`).not.toMatch(/DROP TABLE/i);
      expect(sql, `${name} drops a column`).not.toMatch(/DROP COLUMN/i);
    }
  });
});
