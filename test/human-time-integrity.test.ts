import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A HUMAN-COMPLETED JOB CANNOT LEAVE workerActiveSeconds UNMEASURED.
 *
 * ── WHY THIS FILE IS A PIN, NOT THE PROOF ──
 *
 * The real behavior lives in submitDeliverable, which requires a Postgres
 * transaction and a real session — this file cannot exercise it, the same
 * reason test/worker-after-claim.test.ts pins the download route's identity
 * check by reading source rather than calling the route. The full behavioral
 * proof is test/integration/human-time-integrity.itest.ts (real Postgres:
 * refusal, unchanged pre-submission state, success once a session exists,
 * payout untouched, active-session finalization, retry non-double-count) and
 * .scratch/r4-human-time-integrity.e2e.ts (the original R4 execution
 * evidence, six scenarios, kept as-is).
 *
 * What THIS file guarantees, in the fast tier that actually runs in CI: if
 * the gate is deleted, reordered past the state transition, or its phase
 * filter drifts from what operational-actuals.ts actually reads, this fails
 * immediately — instead of the drift being discovered as a silent
 * MISSING_WORKER_TIME regression weeks later.
 */

const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

describe("submitDeliverable refuses a worker who never opened a timed session", () => {
  const source = read("src/server/actions/va-tasks.ts");
  const submitFn = source.slice(source.indexOf("export async function submitDeliverable"));

  it("is not vacuous: submitDeliverable is a real transactional action", () => {
    expect(submitFn).toContain("await prisma.$transaction(async (tx) => {");
    expect(submitFn).toContain("throw new Refused(");
  });

  it("counts real TaskWorkSession rows, scoped to this task and this worker", () => {
    expect(submitFn).toMatch(/tx\.taskWorkSession\.count\(\{\s*\n\s*where:\s*\{/);
    const countCall = submitFn.slice(
      submitFn.indexOf("tx.taskWorkSession.count("),
      submitFn.indexOf("if (timedAtLeastOnce === 0)")
    );
    expect(countCall).toContain("taskId,");
    expect(countCall).toContain("userId: user.id,");
    expect(countCall).toContain('role: "worker",');
  });

  it("matches EXACTLY the phases operational-actuals.ts reads as workerActiveSeconds — not a copy that can drift", () => {
    /**
     * The load-bearing coupling. operational-actuals.ts:346 sums
     * accumulatedSeconds for role==="worker" && (phase==="residual_work" ||
     * phase==="manual_fallback"). If this gate's phase list ever diverges —
     * narrower, wider, or reordered into a different enum — a worker could
     * satisfy the gate while still leaving workerActiveSeconds null, which
     * is the exact defect R4 exists to close.
     */
    const actuals = read("src/server/operational-actuals.ts");
    expect(actuals).toContain('s.phase === "residual_work" || s.phase === "manual_fallback"');
    expect(submitFn).toContain('phase: { in: ["residual_work", "manual_fallback"] }');
  });

  it("refuses BEFORE any state transition — the check gates the transition, not merely observes it", () => {
    const countIndex = submitFn.indexOf("tx.taskWorkSession.count(");
    const refusalIndex = submitFn.indexOf("Start your timer before delivering");
    const transitionIndex = submitFn.indexOf('to: "submitted_for_qc"');
    expect(countIndex).toBeGreaterThan(0);
    expect(refusalIndex).toBeGreaterThan(countIndex);
    expect(transitionIndex).toBeGreaterThan(refusalIndex);
  });

  it("the refusal is a Refused (surfaces as { ok: false }), never an unhandled throw", () => {
    const gate = submitFn.slice(
      submitFn.indexOf("tx.taskWorkSession.count("),
      submitFn.indexOf("tx.taskWorkSession.count(") + 700
    );
    expect(gate).toMatch(/if \(timedAtLeastOnce === 0\) \{\s*\n\s*throw new Refused\(/);
  });

  it("does not weaken or bypass the pre-existing active-session finalization on submit", () => {
    // stopAllOpenSessions must still run, still after the transaction commits
    // (the pool-exhaustion fix this session already made) — R4 only adds a
    // precondition, it does not touch this mechanism.
    const afterTx = source.slice(source.indexOf("await stopAllOpenSessions("));
    expect(afterTx.indexOf("await stopAllOpenSessions(")).toBe(0);
    expect(source).toContain("await stopAllOpenSessions(taskId, user.id, new Date());");
  });

  it("does not touch pricing or payout: no assignment to vaPayoutCents or clientPriceCents in this function", () => {
    expect(submitFn).not.toMatch(/vaPayoutCents\s*[:=]/);
    expect(submitFn).not.toMatch(/clientPriceCents\s*[:=]/);
  });
});
