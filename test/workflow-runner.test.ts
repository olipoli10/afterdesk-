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

/**
 * 1D-alpha0 pins. These are SOURCE-level because the behaviours they protect
 * are wiring, and wiring is exactly what a refactor drops silently: a
 * classification module nobody calls, a reservation nobody takes, a counter
 * nobody updates. Each of the three was a real defect found by audit.
 */
describe("the runner acts on the failure class, it does not merely store it", () => {
  it("classifies inside the catch and lets the class decide exhaustion", () => {
    // The defect this forbids: storing errorClass on the invocation row while
    // the retry decision still treats a permanent 401 like a transient 429.
    expect(runner).toContain("classifyProviderError");
    expect(runner).toMatch(/classified\.pauseRunImmediately/);
    expect(runner).toMatch(/!classified\.retryable/);
  });

  it("honours the provider's Retry-After over our own curve", () => {
    expect(runner).toMatch(/classified\.retryAfterSeconds !== null/);
  });
});

describe("spend is reserved before the call, never checked after it", () => {
  it("reserves against the run budget and pauses instead of failing", () => {
    expect(runner).toContain("reserveSpend");
    expect(runner).toContain("pauseRunForBudget");
    // The dead `costCeilingMicros: 0` of 1B must not come back.
    expect(runner).not.toMatch(/costCeilingMicros:\s*0\s*,/);
    expect(runner).toMatch(/costCeilingMicros: reservation\?\.grantedMicros/);
  });

  it("resolves the hold in the same transaction as the invocation row", () => {
    expect(runner).toContain("settleHold");
    // An uncertain outcome keeps its reservation: only these two states
    // resolve it, and neither of them is a guess.
    expect(runner).toMatch(/dispatchState === "settled"/);
    expect(runner).toMatch(/dispatchState === "cancelled_before_dispatch"/);
  });

  it("COPIES the ceiling from the accepted contract and derives nothing", () => {
    /**
     * The defect this forbids, in the exact shape it had: the ceiling was
     * computed HERE, at compile time, from the registry's current caps.
     * Compile runs after payment, so raising a cap in a deploy raised the
     * budget of mandates already sold.
     */
    expect(runner).toContain("runAutomationBudgetMicros: snapshot.automationSpendCeilingMicros");
    expect(runner).not.toContain("deriveRunBudgetMicros");
    // And the reservation uses the value frozen on the plan step, never a
    // current registry or policy figure.
    expect(runner).toContain("worstCaseMicros: step.maxCostMicrosPerAttemptAtQuote");
    expect(runner).not.toMatch(/worstCaseMicros: primitive\./);
    // A percentage of the price would authorise more machine spend on an
    // expensive mandate than on an identical cheap one.
    expect(runner).not.toMatch(/runAutomationBudgetMicros[^\n]*clientPriceCents/);
  });

  it("hands a billable step with no frozen ceiling to a person", () => {
    // A contract accepted before this correction carries no frozen figure, so
    // its spend cannot be bounded against what the client actually signed.
    expect(runner).toContain("step.maxCostMicrosPerAttemptAtQuote === null");
    expect(runner).toContain("no per-attempt cost frozen at quote time");
  });

  /**
   * A RETRY THE CONTRACT DID NOT FUND IS A RETRY THAT MUST NOT BE PROMISED.
   *
   * The registry declared two attempts for research while the ceiling funded
   * one, so a transient provider error was classified retryable and its retry
   * was then refused for want of budget. The run paused having done nothing
   * wrong, and the six-hour stall sweep gave the mandate to a person.
   */
  it("bounds retries by the frozen contract value, never by the registry", () => {
    // BOTH exhaustion checks — the claim loop and the failure handler — go
    // through the same rule, so a step cannot be exhausted by one and still
    // claimable under the other. The rule's own behaviour is tested directly
    // in automation-cost-policy.test.ts; what is pinned here is that this file
    // routes every decision through it.
    const reads = runner.match(/attemptsAllowedForStep\(/g) ?? [];
    expect(reads.length).toBe(2);
    expect(runner).toContain('import { attemptsAllowedForStep }');
    // And no comparison reaches past it to the registry's current number.
    expect(runner).not.toMatch(/attempts\s*>=\s*primitive\.maxAttempts/);
    expect(runner).not.toMatch(/attempts:\s*\{\s*lt:\s*primitive\.maxAttempts\s*\}/);
  });
});

describe("an unknown payout is never published as zero", () => {
  it("refuses the handover on both publishing paths", () => {
    // `?? 0` published $0.00 for 0 minutes with no alarm anywhere: the hourly
    // floor returns true at zero minutes and overBudget (0 > 0) is false.
    expect(runner).toContain("handoverBlockedForUnknownPayout");
    expect(runner).toContain("workflow_handover_blocked");
    const calls = runner.match(/await handoverBlockedForUnknownPayout\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("promises no automatic recovery, because no authoritative amount exists", () => {
    // The snapshot carries the client price, not the payout, and
    // suggestedVaPayoutCents is a suggestion the admin may have overridden.
    expect(runner).toContain("THERE IS NO AUTHORITATIVE FALLBACK");
    /**
     * The column is named in prose to explain why it is refused, so the pin
     * is on the shape that would actually USE it: a Prisma select. Reading it
     * would publish a number the operator never chose.
     */
    expect(runner).not.toMatch(/suggestedVaPayoutCents:\s*true/);
  });
});

describe("an in-flight handoff keeps the run counters true", () => {
  it("routes every handoff through the counter-aware helper", () => {
    // automatedStepCount feeds computeResidual, which decides what the worker
    // is paid. A step that becomes human work while still counted as
    // automated overstates the machine's contribution.
    expect(runner).toContain("async function handOffStepToHuman");
    expect(runner).toMatch(/automatedStepCount: \{ decrement/);
    expect(runner).toMatch(/humanStepCount: \{ increment/);
    // No raw handoff update may bypass it.
    const rawHandoffs = runner.match(/status: "handed_to_human"/g) ?? [];
    // One inside the helper, one in the compile-time step creation ternary.
    expect(rawHandoffs.length).toBeLessThanOrEqual(2);
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
