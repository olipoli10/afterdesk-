import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { advanceWorkflow, compileWorkflowForTask } from "@/server/workflow-runs";
import { artifactStorageKey } from "@/server/workflow-artifacts";
import { attemptsAllowedForStep } from "@/lib/ai-work-engine/automation-cost-policy";
import { resolvePrimitive } from "@/lib/ai-work-engine/registry";
import { currentPrimitiveVersion } from "@/lib/ai-work-engine/primitive-vocabulary";
import { deleteObject, objectExists, putObject, readObject } from "@/lib/storage";
import { createClient } from "./fixtures";

/**
 * THE RELEASE GATE FOR 1E-alpha: AN ACCEPTED FILE'S BYTES ARE FROZEN.
 *
 * The contract (TaskAcceptanceSnapshotFile) pins a client file by identity AND
 * by sha256. Everything below runs the REAL path - real Postgres rows, real
 * bytes in the storage backend, the production compiler and the production
 * runner - and proves the whole invariant, not a slice of it:
 *
 *   if the backing bytes change after acceptance, not one of the NEW bytes may
 *   ever reach a primitive, no artifact may be derived from them, and the run
 *   must land in its designed fail-closed state (bounded retries, then a
 *   paused run) with no fallback to any alternate input.
 *
 * Scenario B is the non-vacuity control: the identical graph with untouched
 * bytes executes to completion, so scenario A fails BECAUSE of the tamper and
 * not because execution never works in this harness. Scenario C is the cheap
 * variant of the same gate: the backing object disappears entirely.
 *
 * Unit tests already pin the read() closure's shape; what only this suite can
 * prove is that the refusal actually flows through claim/lease/backoff/pause
 * against committed rows, and that nothing anywhere picked up the new bytes.
 */

/* ────────────────────────────── shared pieces ───────────────────────────── */

// Fixture-style uid: one per-process nonce plus a sequence, so ids are unique
// across reruns on a dirty database without a wall clock in any identifier.
const runNonce = randomUUID().replace(/-/g, "").slice(0, 10);
let seq = 0;
const uid = () => `fb${runNonce}${(seq++).toString(36)}`;

const sha256Hex = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/**
 * The runner's REAL refusal messages, quoted from the read() closure in
 * src/server/workflow-runs.ts:
 *   `accepted input file ${f.fileId} is no longer stored`
 *   `accepted input file ${f.fileId} no longer matches the hash frozen at acceptance`
 * Asserting these exact substrings is what ties the observed failure to the
 * snapshot check rather than to some unrelated throw.
 */
const hashMismatchMessage = (fileId: string) =>
  `accepted input file ${fileId} no longer matches the hash frozen at acceptance`;
const notStoredMessage = (fileId: string) => `accepted input file ${fileId} is no longer stored`;

/**
 * The attempt bound the runner itself uses for a NON-billable step: the
 * registry's maxAttempts, because no contractual figure exists for a step that
 * cannot bill. Computed through the production functions so a registry change
 * moves the assertion with it instead of silently diverging.
 */
const ingestResolved = resolvePrimitive("ingest.csv", currentPrimitiveVersion("ingest.csv"));
if (ingestResolved === null) {
  throw new Error("ingest.csv does not resolve at its current version; the graph below would be fiction");
}
// Re-bound after the guard so the non-null type survives into the closures.
const ingestPrimitive = ingestResolved;
const INGEST_ATTEMPT_BOUND = attemptsAllowedForStep(ingestPrimitive, null);

/** Data rows in every fixture CSV. Must equal quantityInterpreted below. */
const DATA_ROWS = 3;

function csvBytes(marker: string): Buffer {
  return Buffer.from(
    [
      "email,company",
      `${marker}@original.example,Alpha Supply`,
      `${marker}.b@original.example,Bravo Logistics`,
      `${marker}.c@original.example,Charlie Freight`,
      "",
    ].join("\n"),
    "utf8"
  );
}

type ContractGraph = {
  taskId: string;
  fileId: string;
  storageKey: string;
  snapshotId: string;
  planVersionId: string;
  originalSha256: string;
};

/**
 * The full real graph behind one accepted single-step ingest contract, written
 * in the order the production acceptance path writes it: plan version and step
 * BEFORE the snapshot, because the append-only trigger refuses a step inserted
 * into an already-accepted plan.
 */
async function buildAcceptedIngestContract(originalBytes: Buffer): Promise<ContractGraph> {
  const client = await createClient();

  // Positive payout and effort estimate: scenario B's handover publishes the
  // task to the pool, and second_shift_pool_payable_guard refuses anything
  // else. Same figures the shared fixtures use.
  const task = await prisma.task.create({
    data: {
      clientId: client.id,
      title: "Prepare the supplier list",
      description: "Read the accepted CSV into the working set.",
      status: "ai_processing" as never,
      clientPriceCents: 10_000,
      vaPayoutCents: 2_000,
      estimatedMinutes: 60,
    },
    select: { id: true },
  });

  // A task only ever reaches ai_processing because a payment cleared first,
  // and the pool-entry trigger re-checks that on the ai_processing -> open
  // handover (workflow_guards migration). The graph carries its authorized
  // payment exactly as production does; without it scenario B's handover
  // would be refused for a reason that has nothing to do with frozen bytes.
  await prisma.payment.create({
    data: {
      taskId: task.id,
      amountCents: 10_000,
      method: "card",
      status: "authorized",
    },
  });

  // Every required column filled honestly: the gate in compileDecisions reads
  // sensitiveData and requiredAccess, and a row invented to dodge the schema
  // would prove the invariant against a shape production cannot produce.
  await prisma.taskAiClassification.create({
    data: {
      taskId: task.id,
      objective: "Prepare the supplier list the client attached",
      deliverableFormat: "csv",
      requiredFields: ["email"],
      quantityInterpreted: DATA_ROWS,
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

  const storageKey = `it/frozen-bytes/${uid()}.csv`;
  const originalSha256 = sha256Hex(originalBytes);

  // A clean File row must carry the scan evidence the pipeline produces
  // (File_clean_requires_scan_evidence): hash, detected mime, scan time.
  const file = await prisma.file.create({
    data: {
      taskId: task.id,
      kind: "input",
      uploaderId: client.id,
      storageKey,
      fileName: "suppliers.csv",
      mime: "text/csv",
      sizeBytes: originalBytes.byteLength,
      scanStatus: "clean",
      detectedMime: "text/csv",
      sha256: originalSha256,
      scannedAt: new Date("2026-08-10T00:00:00.000Z"),
    },
    select: { id: true },
  });
  await putObject(storageKey, originalBytes);

  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated",
      deliverableDescription: "The supplier list, read and prepared",
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 2_000,
      calibration: "uncalibrated",
      // The frozen execution class of a mandate that reads a client file.
      // `local` capabilities may process it; a provider capability may not.
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
      // The frozen configuration: WHICH file this step was accepted to read.
      params: { fileId: file.id },
      // No frozen economics on purpose: ingest.csv is non-billable, so the
      // attempt bound must come from the registry, exactly as asserted above.
    },
  });

  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "Prepare the supplier list",
      description: "contract copy",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: client.id,
      dataClass: "business_confidential",
    },
    select: { id: true },
  });

  // The bytes the client accepted, frozen by identity AND by content. The
  // sha256 recorded here is of the ORIGINAL bytes and nothing in any scenario
  // ever changes it (the table is append-only by trigger).
  await prisma.taskAcceptanceSnapshotFile.create({
    data: {
      snapshotId: snapshot.id,
      fileId: file.id,
      sha256: originalSha256,
      fileName: "suppliers.csv",
      sizeBytes: originalBytes.byteLength,
    },
  });

  return {
    taskId: task.id,
    fileId: file.id,
    storageKey,
    snapshotId: snapshot.id,
    planVersionId: planVersion.id,
    originalSha256,
  };
}

const ITERATION_CAP = 10;

/**
 * Drives the REAL runner until the run leaves "running" or the cap trips.
 * Between invocations the failed step's backoff and lease are force-expired
 * with a direct row update: that is test clock control (the same columns a
 * passing minute would change), never a change to what the runner does.
 */
async function driveToRest(taskId: string): Promise<{ finalStatus: string; iterations: number }> {
  for (let i = 1; i <= ITERATION_CAP; i++) {
    await advanceWorkflow(taskId);
    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId },
      select: { id: true, status: true },
    });
    if (run.status !== "running") return { finalStatus: run.status, iterations: i };
    await prisma.taskWorkflowStepRun.updateMany({
      where: { runId: run.id, executionMode: "automated", status: { notIn: ["done", "handed_to_human"] } },
      data: { nextAttemptAt: new Date(0), leaseExpiresAt: new Date(0) },
    });
  }
  const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
    where: { taskId },
    select: { status: true },
  });
  return { finalStatus: run.status, iterations: ITERATION_CAP };
}

/** The deterministic key persistPayload would write, via the real key builder. */
const payloadKeyOf = (snapshotId: string) =>
  artifactStorageKey({ snapshotId, order: 1, name: "payload", outputVersion: 1, extension: "json" });

type StepRow = {
  status: string;
  attempts: number;
  lastError: string | null;
  outputSummary: unknown;
};

async function firstStepOf(taskId: string): Promise<StepRow> {
  return prisma.taskWorkflowStepRun.findFirstOrThrow({
    where: { run: { taskId }, order: 1 },
    select: { status: true, attempts: true, lastError: true, outputSummary: true },
  });
}

/* ─────────────────────── SCENARIO A: the tamper ─────────────────────────── */

describe("SCENARIO A: bytes tampered after acceptance", () => {
  // Unique per run, so a rerun on a dirty database cannot false-positive on a
  // sentinel written by an earlier execution.
  const sentinel = `ZZQX-TAMPERED-9f3k-${uid()}`;

  let a: ContractGraph;
  let tamperedSha256: string;
  let compiled: Awaited<ReturnType<typeof compileWorkflowForTask>>;
  let rest: { finalStatus: string; iterations: number };
  let step: StepRow;

  beforeAll(async () => {
    a = await buildAcceptedIngestContract(csvBytes(`keep-${uid()}`));

    const tampered = Buffer.from(
      ["email,company", `intruder@tampered.example,${sentinel}`, ""].join("\n"),
      "utf8"
    );
    tamperedSha256 = sha256Hex(tampered);

    // THE TAMPER: same storage key, new bytes. The snapshot rows stay as the
    // client accepted them.
    await putObject(a.storageKey, tampered);

    // File.sha256 is ALSO moved to the new hash, mimicking a re-upload or a
    // rescan that recorded the new content. If the runner verified against the
    // File row it would now see a matching hash and read the tampered bytes
    // without complaint - so a pass here proves the check reads the SNAPSHOT's
    // frozen hash, not the mutable row.
    await prisma.file.update({ where: { id: a.fileId }, data: { sha256: tamperedSha256 } });

    compiled = await compileWorkflowForTask(a.taskId);
    if (!compiled) throw new Error("scenario A: the contract did not compile; nothing below would mean anything");
    rest = await driveToRest(a.taskId);
    step = await firstStepOf(a.taskId);
  });

  it("compiles the ingest step as machine work, so the gate below is actually exercised", () => {
    expect(compiled).not.toBeNull();
    expect(compiled!.fullyHuman).toBe(false);
  });

  it("the step never succeeds, and its lastError is the runner's hash-mismatch refusal", () => {
    expect(step.status).not.toBe("done");
    expect(step.status).toBe("failed");
    expect(step.lastError ?? "").toContain(hashMismatchMessage(a.fileId));
    // No output summary either: the step produced nothing to summarise.
    expect(step.outputSummary).toBeNull();
  });

  it("attempts stop at the registry bound for ingest.csv, with no infinite retry", () => {
    expect(step.attempts).toBe(INGEST_ATTEMPT_BOUND);
    // The loop settled by pausing, not by hitting its own safety cap.
    expect(rest.iterations).toBeLessThan(ITERATION_CAP);
  });

  it("the run lands in the designed fail-closed state: paused, journaled, naming the step", async () => {
    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: a.taskId },
      select: { status: true, pausedReason: true },
    });
    expect(rest.finalStatus).toBe("paused");
    expect(run.status).toBe("paused");
    // The exact reason pauseRunForExhaustedStep writes:
    // `Step ${order} (${primitiveId}) failed ${attempts} times: ${message}`
    expect(run.pausedReason ?? "").toContain(
      `Step 1 (ingest.csv) failed ${INGEST_ATTEMPT_BOUND} times:`
    );
    expect(run.pausedReason ?? "").toContain(hashMismatchMessage(a.fileId));

    const pauseEvents = await prisma.taskEvent.findMany({
      where: { taskId: a.taskId, action: "workflow_run_paused" },
      select: { meta: true },
    });
    expect(pauseEvents).toHaveLength(1);
    expect(pauseEvents[0].meta).toMatchObject({
      order: 1,
      primitiveId: "ingest.csv",
      attempts: INGEST_ATTEMPT_BOUND,
    });
  });

  it("THE SENTINEL APPEARS NOWHERE: no artifact exists and no stored or journaled byte carries it", async () => {
    // Nothing was produced at all.
    const artifacts = await prisma.file.findMany({
      where: { taskId: a.taskId, kind: "artifact" },
      select: { storageKey: true },
    });
    expect(artifacts).toHaveLength(0);

    // Belt and braces: if any artifact row DID exist, its bytes must not carry
    // the sentinel either.
    for (const artifact of artifacts) {
      const body = (await readObject(artifact.storageKey)).toString("utf8");
      expect(body).not.toContain(sentinel);
    }

    // The deterministic key the payload writer would have used holds no bytes:
    // persistPayload never ran, not even partially.
    expect(await objectExists(payloadKeyOf(a.snapshotId))).toBe(false);

    // No step row (summaries, errors, lock bookkeeping) carries the sentinel.
    const stepRows = await prisma.taskWorkflowStepRun.findMany({
      where: { run: { taskId: a.taskId } },
    });
    expect(JSON.stringify(stepRows)).not.toContain(sentinel);

    // No journal entry carries it either, pausedReason included.
    const events = await prisma.taskEvent.findMany({ where: { taskId: a.taskId } });
    expect(JSON.stringify(events)).not.toContain(sentinel);
    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: a.taskId },
      select: { pausedReason: true },
    });
    expect(run.pausedReason ?? "").not.toContain(sentinel);
  });

  it("no alternate input: the frozen hash is the authority and nothing consumed the current bytes", async () => {
    // The refusal references the FROZEN expectation, not a storage error and
    // not the File row's (matching!) current hash.
    expect(step.lastError ?? "").toContain(hashMismatchMessage(a.fileId));

    // The divergence that makes that meaningful is still in place: the File
    // row says the tampered bytes are fine, the contract says otherwise, and
    // the contract won.
    const file = await prisma.file.findUniqueOrThrow({
      where: { id: a.fileId },
      select: { sha256: true },
    });
    expect(file.sha256).toBe(tamperedSha256);
    const frozen = await prisma.taskAcceptanceSnapshotFile.findFirstOrThrow({
      where: { snapshotId: a.snapshotId },
      select: { sha256: true },
    });
    expect(frozen.sha256).toBe(a.originalSha256);
    expect(frozen.sha256).not.toBe(tamperedSha256);

    // Nothing was invoked and nothing completed: no execution consumed the
    // file in ANY version, and no fallback input was substituted.
    const invocations = await prisma.taskToolInvocation.count({
      where: { stepRun: { run: { taskId: a.taskId } } },
    });
    expect(invocations).toBe(0);
    const doneSteps = await prisma.taskWorkflowStepRun.count({
      where: { run: { taskId: a.taskId }, status: "done" },
    });
    expect(doneSteps).toBe(0);
  });
});

/* ──────────────── SCENARIO B: positive control, no tamper ───────────────── */

describe("SCENARIO B: the identical graph with untouched bytes executes to completion", () => {
  // A marker from the ORIGINAL bytes, unique per run for the same reason as
  // the sentinel: finding it later must prove THIS run's bytes flowed through.
  const marker = `origmark-${uid()}`;

  let b: ContractGraph;
  let compiled: Awaited<ReturnType<typeof compileWorkflowForTask>>;
  let rest: { finalStatus: string; iterations: number };
  let step: StepRow;

  beforeAll(async () => {
    b = await buildAcceptedIngestContract(csvBytes(marker));
    compiled = await compileWorkflowForTask(b.taskId);
    if (!compiled) throw new Error("scenario B: the contract did not compile; the control is meaningless");
    rest = await driveToRest(b.taskId);
    step = await firstStepOf(b.taskId);
  });

  it("compiles the same shape scenario A compiled", () => {
    expect(compiled).not.toBeNull();
    expect(compiled!.fullyHuman).toBe(false);
  });

  it("the ingest step reaches done, reporting the file's real row count", () => {
    expect(step.status).toBe("done");
    expect(step.lastError).toBeNull();
    expect(step.outputSummary).toMatchObject({ rows: DATA_ROWS });
  });

  it("the machine block completes and hands to the pool: no pause anywhere", async () => {
    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: b.taskId },
      select: { status: true, pausedReason: true, finishedAt: true },
    });
    // The real terminal behaviour of a single-step machine block: finishRun
    // closes the run as awaiting_human and releases the task to the pool.
    expect(rest.finalStatus).toBe("awaiting_human");
    expect(run.status).toBe("awaiting_human");
    expect(run.pausedReason).toBeNull();
    expect(run.finishedAt).not.toBeNull();

    const task = await prisma.task.findUniqueOrThrow({
      where: { id: b.taskId },
      select: { status: true, vaPayoutCents: true, estimatedMinutes: true },
    });
    expect(task.status).toBe("open");
    // The payable invariant the pool trigger enforces; exact figures belong to
    // the residual tests, not here.
    expect(task.vaPayoutCents ?? 0).toBeGreaterThan(0);
    expect(task.estimatedMinutes ?? 0).toBeGreaterThan(0);

    const humanPackage = await prisma.taskHumanWorkPackage.findUnique({
      where: { taskId: b.taskId },
      select: { id: true },
    });
    expect(humanPackage).not.toBeNull();
  });

  it("the payload artifact written by persistPayload exists and carries the original bytes' marker", async () => {
    const artifact = await prisma.file.findFirstOrThrow({
      where: { taskId: b.taskId, kind: "artifact", fileName: "payload.json" },
      select: { storageKey: true, workflowRunId: true },
    });
    expect(artifact.workflowRunId).not.toBeNull();
    // The same deterministic key the tamper scenario asserts is EMPTY.
    expect(artifact.storageKey).toBe(payloadKeyOf(b.snapshotId));

    const body = (await readObject(artifact.storageKey)).toString("utf8");
    expect(body).toContain(marker);
    // The ingest provenance travelled with the rows, so what was derived is a
    // client-file payload, not a research one.
    expect(body).toContain('"provenance":"client_file"');
  });
});

/* ─────────────── SCENARIO C: the backing file disappears ────────────────── */

describe("SCENARIO C: backing file missing after acceptance", () => {
  let c: ContractGraph;
  let rest: { finalStatus: string; iterations: number };
  let step: StepRow;

  beforeAll(async () => {
    c = await buildAcceptedIngestContract(csvBytes(`gone-${uid()}`));

    // The production event that makes stored bytes disappear is the retention
    // purge, which stamps purgedAt; the object is deleted too so no bytes
    // exist ANYWHERE for a fallback to find. Snapshot and File row survive.
    await prisma.file.update({
      where: { id: c.fileId },
      data: { purgedAt: new Date("2026-08-10T01:00:00.000Z") },
    });
    await deleteObject(c.storageKey);

    const compiled = await compileWorkflowForTask(c.taskId);
    if (!compiled) throw new Error("scenario C: the contract did not compile; nothing below would mean anything");
    rest = await driveToRest(c.taskId);
    step = await firstStepOf(c.taskId);
  });

  it("the step fails with the runner's own not-stored refusal, never a substitute read", () => {
    expect(step.status).not.toBe("done");
    expect(step.status).toBe("failed");
    expect(step.lastError ?? "").toContain(notStoredMessage(c.fileId));
  });

  it("attempts stop at the registry bound and the run pauses, same fail-closed shape as the tamper", async () => {
    expect(step.attempts).toBe(INGEST_ATTEMPT_BOUND);
    expect(rest.iterations).toBeLessThan(ITERATION_CAP);

    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: c.taskId },
      select: { status: true, pausedReason: true },
    });
    expect(run.status).toBe("paused");
    expect(run.pausedReason ?? "").toContain(
      `Step 1 (ingest.csv) failed ${INGEST_ATTEMPT_BOUND} times:`
    );
    expect(run.pausedReason ?? "").toContain(notStoredMessage(c.fileId));
  });

  it("no artifact was derived and no other file was consumed in its place", async () => {
    const artifacts = await prisma.file.count({ where: { taskId: c.taskId, kind: "artifact" } });
    expect(artifacts).toBe(0);
    expect(await objectExists(payloadKeyOf(c.snapshotId))).toBe(false);

    const invocations = await prisma.taskToolInvocation.count({
      where: { stepRun: { run: { taskId: c.taskId } } },
    });
    expect(invocations).toBe(0);
    const doneSteps = await prisma.taskWorkflowStepRun.count({
      where: { run: { taskId: c.taskId }, status: "done" },
    });
    expect(doneSteps).toBe(0);
  });
});
