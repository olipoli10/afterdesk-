import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  expect(from, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `missing end marker: ${end}`).toBeGreaterThan(from);
  return text.slice(from, to);
}

describe("T078 — local release-candidate structural guards", () => {
  it("keeps the T001-T078 registry contiguous, unique and closed", () => {
    const tasks = source("specs/001-human-workunit-resume/tasks.md");
    const rows = [...tasks.matchAll(/^- \[[xX ]\] T(\d{3})\b/gm)];
    const ids = rows.map((row) => Number(row[1]));
    expect(ids).toEqual(Array.from({ length: 78 }, (_, index) => index + 1));
    expect(new Set(ids).size).toBe(78);
    expect(tasks).toMatch(/^- \[[xX]\] T078\b/m);
  });

  it("hwu-rollout-gate-bypass", () => {
    const workflow = source("src/server/workflow-runs.ts");
    const compile = between(
      workflow,
      "export async function compileWorkflowForTask",
      "export async function advanceWorkflow"
    );
    expect(occurrences(workflow, "settings.humanWorkUnitResumeEnabled")).toBe(1);
    expect(occurrences(compile, "settings.humanWorkUnitResumeEnabled")).toBe(1);
  });

  it("hwu-stale-generation-resume-bypass", () => {
    const resume = between(
      source("src/server/human-unit-resume.ts"),
      "export async function applyResume",
      "/** Crash recovery:"
    );
    expect(resume).toMatch(
      /where:\s*\{[\s\S]*?id: unit\.id,[\s\S]*?state: "accepted",[\s\S]*?resumeGeneration: unit\.resumeGeneration,[\s\S]*?\}/
    );
    expect(resume).toContain("if (movedUnit.count === 0) throw new LostResumeCas()");
  });

  it("hwu-lifecycle-withdrawal-bypass", () => {
    const advance = between(
      source("src/server/workflow-runs.ts"),
      "export async function advanceWorkflow",
      "export async function finishRun"
    );
    const exit = between(
      advance,
      "if (!heldByAPerson)",
      "const mayContinueAfterResume"
    );
    expect(exit).toContain("await prisma.$transaction(async (tx) =>");
    expect(exit).toContain('status: "abandoned"');
    expect(exit).toContain("await withdrawHumanUnit(tx, {");
    expect(exit).toContain('cause: "lifecycle_exit"');
  });

  it("hwu-worker-projection-leak", () => {
    const worker = between(
      source("src/lib/queries/human-unit.ts"),
      "export async function humanUnitForWorker",
      "export type AdminUnitView"
    );
    const activeProjection = between(
      worker,
      "const unit = await tx.humanWorkUnitRunState.findFirst",
      "if (!unit) return null"
    );
    for (const forbidden of [
      "taskId",
      "runId",
      "snapshotId",
      "claimedById",
      "clientPriceCents",
      "clientId",
      "clientDeadlineUtc",
      "computedPayoutCents",
      "reservedBudgetCents",
      "actualAiCostMicros",
      "actualToolCostMicros",
    ]) {
      expect(activeProjection).not.toMatch(new RegExp(`\\b${forbidden}\\s*:\\s*true\\b`));
    }
  });

  it("hwu-waiting-provider-spend-bypass", () => {
    const advance = between(
      source("src/server/workflow-runs.ts"),
      "export async function advanceWorkflow",
      "export async function finishRun"
    );
    const admissionFence = between(
      advance,
      "const heldByAPerson",
      "const classification = run.task.aiClassification"
    );
    expect(admissionFence).toContain(
      'run.humanWorkUnit?.state === "resumed" && run.task.status === "claimed"'
    );
    expect(admissionFence).toContain("if (!mayContinueAfterResume) return { steps: 0, finished: false }");
  });

  it("hwu-duplicate-resume-or-payout-bypass", () => {
    const resume = between(
      source("src/server/human-unit-resume.ts"),
      "export async function applyResume",
      "/** Crash recovery:"
    );
    const schema = between(
      source("prisma/schema.prisma"),
      "model HumanWorkUnitResumeRecord",
      "model HumanWorkUnitTransition"
    );
    expect(resume).toContain('if (unit.resume || unit.state === "resumed")');
    expect(resume).toContain("await tx.humanWorkUnitResumeRecord.create({");
    expect(schema).toMatch(/runId\s+String\s+@unique/);
    expect(schema).toMatch(/unitStateId\s+String\s+@unique/);
    expect(schema).toMatch(/acceptanceId\s+String\s+@unique/);
  });

  it("hwu-poison-item-stops-recovery-sweep", () => {
    const recovery = between(
      source("src/server/human-unit-resume.ts"),
      "export async function recoverPendingHumanUnitResumes",
      "return resumed;"
    );
    const loop = recovery.slice(recovery.indexOf("for (const unit of pending)"));
    expect(loop).toContain("try {");
    expect(loop).toContain("await applyResume(unit.id)");
    expect(loop).toContain("} catch (error) {");
    expect(loop).toContain("unitStateId: unit.id");
  });

  it("hwu-post-commit-replay-duplicates-effect", () => {
    const worker = between(
      source("src/server/actions/human-unit-worker.ts"),
      "export async function submitHumanUnitResult",
      "return { ok: true }"
    );
    const commit = worker.indexOf("await submitHumanUnitCandidate({");
    const refusal = worker.indexOf("if (!outcome.submitted)");
    const sessionStop = worker.indexOf("await stopAllOpenSessions(");
    const revalidate = worker.indexOf("revalidatePath(");
    expect(commit).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(commit);
    expect(sessionStop).toBeGreaterThan(refusal);
    expect(revalidate).toBeGreaterThan(sessionStop);
    expect(occurrences(worker, "await stopAllOpenSessions(")).toBe(1);
  });
});
