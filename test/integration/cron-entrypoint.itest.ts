import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { compileWorkflowForTask, processWorkflowRuns } from "@/server/workflow-runs";
import { attemptsAllowedForStep } from "@/lib/ai-work-engine/automation-cost-policy";
import { resolvePrimitive } from "@/lib/ai-work-engine/registry";
import { currentPrimitiveVersion } from "@/lib/ai-work-engine/primitive-vocabulary";
import { putObject } from "@/lib/storage";
import { createClient } from "./fixtures";

/**
 * PART D — THE CRON ENTRYPOINT ITSELF, NOT advanceWorkflow(taskId) DIRECTLY.
 *
 * Every other integration test that drives execution (frozen-bytes.itest.ts,
 * file-path-activation.itest.ts) calls `advanceWorkflow(taskId)` — the
 * function that does the WORK, handed the run's own id by the test. None of
 * them call `processWorkflowRuns()` — the function production's cron
 * actually invokes on a schedule, with NO argument at all, whose first job
 * is to find which runs need driving at all. A bug in that SELECT (the
 * `status: "running"` filter, the `take: 10` cap, the ordering) would be
 * invisible to every test that hands the runner its target directly, and
 * would only ever surface as "the cron tick did nothing" in production.
 *
 * This file seeds ONE workflow run in the exact state a crashed prior
 * invocation leaves behind — a step claimed and left `running` under an
 * EXPIRED lease, one attempt already spent — then calls the real cron
 * entrypoint with zero arguments and proves, against committed Postgres
 * rows:
 *
 *   1. RUN SELECTION — the run is found and driven without ever being told
 *      its id, purely from `status: "running"` in the database.
 *   2. CORRECT LEASE / REPRISE — the stale claim is reclaimed under a NEW
 *      fencing token, not left stuck forever and not double-claimed.
 *   3. EXECUTION — the step actually runs (a real output, not a status
 *      flipped without doing the work).
 *   4. NO DOUBLE PROCESSING — calling the entrypoint again after the run
 *      completes touches nothing a second time.
 *
 * A second, untouched "control" run (compiled, then forced to `paused`
 * before ever being claimed) proves selection is real rather than a no-op
 * sweep that happens to leave rows alone: it is the negative half of claim 1.
 *
 * Per the order: the 12 L3 corpus scenarios are NOT touched or forced
 * through this path. This is one new, separate, self-contained fixture.
 */

const runNonce = randomUUID().replace(/-/g, "").slice(0, 10);
let seq = 0;
const uid = () => `ce${runNonce}${(seq++).toString(36)}`;
const sha256Hex = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const ingestResolved = resolvePrimitive("ingest.csv", currentPrimitiveVersion("ingest.csv"));
if (ingestResolved === null) {
  throw new Error(
    "cron-entrypoint fixture: ingest.csv does not resolve at its current version; the graph below would be fiction"
  );
}
const ingestPrimitive = ingestResolved;
const INGEST_ATTEMPT_BOUND = attemptsAllowedForStep(ingestPrimitive, null);
if (INGEST_ATTEMPT_BOUND < 2) {
  throw new Error(
    "cron-entrypoint fixture: this scenario reclaims a step on its SECOND attempt, which needs " +
      "at least 2 allowed attempts for ingest.csv — the registry bound dropped below what this test assumes."
  );
}

function csvBytes(marker: string): Buffer {
  return Buffer.from(["email,company", `${marker}@example.com,Example Co`, ""].join("\n"), "utf8");
}

type Contract = { taskId: string; fileId: string; storageKey: string; snapshotId: string };

/**
 * The same minimal single-step ingest.csv contract frozen-bytes.itest.ts
 * uses, self-contained here rather than imported: each itest file owns its
 * own fixture builder in this suite's existing convention.
 */
async function buildAcceptedIngestContract(bytes: Buffer): Promise<Contract> {
  const client = await createClient();
  const task = await prisma.task.create({
    data: {
      clientId: client.id,
      title: "Cron entrypoint fixture",
      description: "Read the accepted CSV into the working set.",
      status: "ai_processing" as never,
      clientPriceCents: 10_000,
      vaPayoutCents: 2_000,
      estimatedMinutes: 60,
    },
    select: { id: true },
  });
  await prisma.payment.create({
    data: { taskId: task.id, amountCents: 10_000, method: "card", status: "authorized" },
  });
  await prisma.taskAiClassification.create({
    data: {
      taskId: task.id,
      objective: "Prepare the list the client attached",
      deliverableFormat: "csv",
      requiredFields: ["email"],
      quantityInterpreted: 1,
      geography: [],
      verificationLevel: "light",
      sourceRequirements: [],
      sensitiveData: false,
      requiredAccess: [],
      missingInformation: [],
      assumptions: [],
      quoteTier: "manual",
      confidence: "medium",
      model: "integration-fixture",
    },
  });

  const storageKey = `it/cron-entrypoint/${uid()}.csv`;
  const sha256 = sha256Hex(bytes);
  const file = await prisma.file.create({
    data: {
      taskId: task.id,
      kind: "input",
      uploaderId: client.id,
      storageKey,
      fileName: "input.csv",
      mime: "text/csv",
      sizeBytes: bytes.byteLength,
      scanStatus: "clean",
      detectedMime: "text/csv",
      sha256,
      scannedAt: new Date("2026-08-10T00:00:00.000Z"),
    },
    select: { id: true },
  });
  await putObject(storageKey, bytes);

  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated",
      deliverableDescription: "The list, read and prepared",
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 2_000,
      calibration: "uncalibrated",
      dataClass: "business_confidential",
      dataClassSignals: ["client attachment named by the plan"],
    },
    select: { id: true },
  });
  await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: planVersion.id,
      order: 1,
      title: "Read the accepted CSV",
      description: "Ingest the frozen client file into the working set.",
      executor: "deterministic_code",
      estimatedMinutesOptimistic: 0,
      estimatedMinutesLikely: 0,
      estimatedMinutesConservative: 0,
      verificationMethod: "operator check",
      acceptanceCriteria: [],
      riskLevel: "low",
      dependsOnOrder: [],
      primitiveId: "ingest.csv",
      primitiveVersion: ingestPrimitive.version,
      params: { fileId: file.id },
    },
  });
  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "Cron entrypoint fixture",
      description: "contract copy",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: client.id,
      dataClass: "business_confidential",
    },
    select: { id: true },
  });
  await prisma.taskAcceptanceSnapshotFile.create({
    data: {
      snapshotId: snapshot.id,
      fileId: file.id,
      sha256,
      fileName: "input.csv",
      sizeBytes: bytes.byteLength,
    },
  });
  return { taskId: task.id, fileId: file.id, storageKey, snapshotId: snapshot.id };
}

describe("processWorkflowRuns() — the real cron entrypoint, called with no arguments", () => {
  const STALE_WORKER = `stale-worker-${uid()}`;

  let main: Contract;
  let control: Contract;
  let controlRunBefore: Awaited<ReturnType<typeof prisma.taskWorkflowRun.findUniqueOrThrow>>;

  beforeAll(async () => {
    /* ── the run under test: a step a "crashed" prior worker abandoned ── */
    main = await buildAcceptedIngestContract(csvBytes(`main-${uid()}`));
    const compiledMain = await compileWorkflowForTask(main.taskId);
    if (!compiledMain) {
      throw new Error("main: the contract did not compile; nothing below would mean anything");
    }

    const mainRun = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: main.taskId },
      select: { id: true, status: true },
    });
    // Exactly the state processWorkflowRuns() looks for — the compiler must
    // have left it here on its own, with no test-side status edit.
    expect(mainRun.status).toBe("running");

    const mainStep = await prisma.taskWorkflowStepRun.findFirstOrThrow({
      where: { runId: mainRun.id, order: 1 },
      select: { id: true },
    });
    // THE DELIBERATE STATE: a step claimed and never released — running,
    // one attempt already spent, lease expired thirty seconds ago. This is
    // what a killed process (an OOM, a platform-forced timeout) leaves
    // behind; nothing about it is a shape only a test could produce.
    await prisma.taskWorkflowStepRun.update({
      where: { id: mainStep.id },
      data: {
        status: "running",
        attempts: 1,
        lockedAt: new Date(Date.now() - 60_000),
        lockedBy: STALE_WORKER,
        leaseExpiresAt: new Date(Date.now() - 30_000),
        startedAt: new Date(Date.now() - 60_000),
      },
    });

    /* ── the negative control: compiled, then parked OUTSIDE "running" ── */
    control = await buildAcceptedIngestContract(csvBytes(`control-${uid()}`));
    const compiledControl = await compileWorkflowForTask(control.taskId);
    if (!compiledControl) {
      throw new Error("control: the contract did not compile; the negative control is meaningless");
    }
    await prisma.taskWorkflowRun.update({
      where: { taskId: control.taskId },
      data: { status: "paused", pausedReason: "control fixture — must never be selected by processWorkflowRuns()" },
    });
    controlRunBefore = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: control.taskId },
    });
  });

  it("CLAIM 1 — selects and drives the run purely from its own DB state, no taskId ever handed to it", async () => {
    /**
     * A real cron tick may take more than one pass: `take: 10, orderBy:
     * createdAt asc` means any older "running" rows already in this shared,
     * long-lived integration database are served first. Polling here is
     * cron's own retry model — production calls this on a schedule — not a
     * workaround for the test.
     */
    let finalStatus = "running";
    for (let i = 0; i < 20 && finalStatus === "running"; i++) {
      await processWorkflowRuns();
      const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
        where: { taskId: main.taskId },
        select: { status: true },
      });
      finalStatus = run.status;
    }
    expect(finalStatus).not.toBe("running");
  });

  it("CLAIM 2 — the stale claim was RECLAIMED under a new lock, not skipped and not left stuck", async () => {
    const step = await prisma.taskWorkflowStepRun.findFirstOrThrow({
      where: { run: { taskId: main.taskId }, order: 1 },
      select: { status: true, attempts: true, lockedBy: true, lastError: true },
    });
    expect(step.status).toBe("done");
    // One attempt was already spent by the "crashed" worker; the reclaim
    // took a second one. Two, not one and not three: neither skipped nor
    // double-claimed — this is the actual proof of reclaim (not stuck under
    // the stale lease forever, and not claimed twice by two racing runners).
    expect(step.attempts).toBe(2);
    /**
     * FOUND BY ACTUALLY RUNNING THIS AGAINST REAL POSTGRES: the original
     * assertion here expected a fresh, non-null lockedBy on the completed
     * step — wrong. workflow-runs.ts's success path (finishClaimedStep with
     * status:"done", ~line 1205) explicitly clears lockedBy to null once a
     * step is done: the fencing token only matters while work is in flight,
     * and leaving a stale-looking lock value on a finished row would be
     * noise, not evidence. The correct proof that the STALE lock specifically
     * is gone is exactly the attempts count above (a genuine reclaim
     * happened, not a no-op skip); the correct proof here is that no lock
     * leaks past completion at all.
     */
    expect(step.lockedBy).toBeNull();
    expect(step.lastError).toBeNull();
  });

  it("CLAIM 3 — real execution happened, not a status flipped without doing the work", async () => {
    const step = await prisma.taskWorkflowStepRun.findFirstOrThrow({
      where: { run: { taskId: main.taskId }, order: 1 },
      select: { outputSummary: true, finishedAt: true },
    });
    expect(step.outputSummary).toMatchObject({ rows: 1 });
    expect(step.finishedAt).not.toBeNull();

    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: main.taskId },
      select: { status: true, finishedAt: true },
    });
    // The real terminal state for a completed single-step machine block:
    // finishRun closes the run and hands the residual to the pool.
    expect(run.status).toBe("awaiting_human");
    expect(run.finishedAt).not.toBeNull();

    const artifact = await prisma.file.findFirst({
      where: { taskId: main.taskId, kind: "artifact", fileName: "payload.json" },
      select: { id: true },
    });
    expect(artifact).not.toBeNull();
  });

  it("CLAIM 4 — NO DOUBLE PROCESSING: calling the entrypoint again after completion changes nothing", async () => {
    const before = await prisma.taskWorkflowStepRun.findFirstOrThrow({
      where: { run: { taskId: main.taskId }, order: 1 },
      select: { status: true, attempts: true, lockedBy: true, outputSummary: true, finishedAt: true },
    });

    // Two more ticks. The run is now "awaiting_human", structurally outside
    // processWorkflowRuns()'s own `status: "running"` selection — so this is
    // exactly what a cron scheduler does every few minutes forever, and the
    // row must be inert under it.
    await processWorkflowRuns();
    await processWorkflowRuns();

    const after = await prisma.taskWorkflowStepRun.findFirstOrThrow({
      where: { run: { taskId: main.taskId }, order: 1 },
      select: { status: true, attempts: true, lockedBy: true, outputSummary: true, finishedAt: true },
    });
    expect(after).toEqual(before);

    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: main.taskId },
      select: { status: true },
    });
    expect(run.status).toBe("awaiting_human");
  });

  it("NEGATIVE CONTROL — a run outside \"running\" is never touched by the entrypoint", async () => {
    const controlRunAfter = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: control.taskId },
    });
    expect(controlRunAfter).toEqual(controlRunBefore);

    const controlStep = await prisma.taskWorkflowStepRun.findFirstOrThrow({
      where: { run: { taskId: control.taskId }, order: 1 },
      select: { status: true, attempts: true, lockedBy: true },
    });
    // Compiled fresh, then paused before this suite ever claimed it — still
    // exactly that untouched shape after every tick above ran.
    expect(["pending", "ready"]).toContain(controlStep.status);
    expect(controlStep.attempts).toBe(0);
    expect(controlStep.lockedBy).toBeNull();
  });
});

describe("T059 — maintenance route registers both Human Work Unit recovery jobs", () => {
  it("keeps both jobs behind run(name, job) and exposes both JSON results", async () => {
    const source = await readFile("src/app/api/cron/maintenance/route.ts", "utf8");
    expect(source).toContain('run("humanUnitDeadlines", sweepHumanWorkUnitDeadlines())');
    expect(source).toContain('run("humanUnitResumes", recoverPendingHumanUnitResumes())');
    expect(source).toMatch(/humanUnitDeadlines[\s\S]*humanUnitResumes/);
  });
});
