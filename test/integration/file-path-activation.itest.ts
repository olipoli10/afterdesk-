import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { objectExists, putObject, readObject } from "@/lib/storage";
import {
  buildAttachmentManifest,
  resolveFileParams,
} from "@/lib/ai-work-engine/attachments";
import { parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";
import { artifactStorageKey } from "@/server/workflow-artifacts";
import { createClient } from "./fixtures";

/**
 * LOT A RELEASE GATE — 1E-alpha IS COMMERCIALLY ACTIVE AT LAST.
 *
 * The Commercial Readiness audit proved the file foundation was complete
 * downstream and unreachable from the live path: the planner invented
 * fileIds, and every AI-planned ingest died at runtime. This suite proves
 * the repaired path END TO END against real Postgres and real bytes:
 *
 *   task + attachments -> planner-style ref params -> deterministic
 *   resolution -> frozen plan -> acceptance snapshot -> compile -> the real
 *   runner -> ingest -> dedupe -> candidate artifact,
 *
 * with the two hostile shapes the order demands: a reference that resolves
 * nowhere (quote-time human, zero rows run), and a real foreign fileId
 * frozen into a plan (runtime refusal against the snapshot set, zero foreign
 * bytes read). Plus the admin edit door: a foreign fileId is refused by the
 * action before anything freezes.
 */

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, getSessionUser: vi.fn(), requireRole: vi.fn() };
});
// The action revalidates admin routes on success; outside a Next request
// context that call throws. Cache invalidation is not what this suite proves.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { getSessionUser, requireRole } = await import("@/lib/authz");
const { editPlanVersion } = await import("@/server/actions/admin-plan");
const { advanceWorkflow, compileWorkflowForTask } = await import("@/server/workflow-runs");

const runNonce = randomUUID().replace(/-/g, "").slice(0, 10);
let seq = 0;
const uid = () => `fp${runNonce}${(seq++).toString(36)}`;
const sha256Hex = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Two same-named CSVs: dup-name disambiguation is part of what is proved.
 *  The SECOND carries a duplicate row so dedupe has real work. */
const fileOneBytes = Buffer.from(
  ["email,company", "a@one.example,One Alpha", "b@one.example,One Bravo", ""].join("\n"),
  "utf8"
);
const fileTwoBytes = Buffer.from(
  [
    "email,company",
    "x@two.example,Two Xray",
    "y@two.example,Two Yankee",
    "x@two.example,Two Xray Duplicate",
    "",
  ].join("\n"),
  "utf8"
);

async function createTaskWithFiles() {
  const client = await createClient();
  const task = await prisma.task.create({
    data: {
      clientId: client.id,
      title: "Clean the supplier list",
      description: "Dedupe the second attached CSV.",
      status: "ai_processing" as never,
      clientPriceCents: 10_000,
      vaPayoutCents: 2_000,
      estimatedMinutes: 60,
    },
    select: { id: true, clientId: true },
  });
  await prisma.payment.create({
    data: { taskId: task.id, amountCents: 10_000, method: "card", status: "authorized" },
  });
  await prisma.taskAiClassification.create({
    data: {
      taskId: task.id,
      objective: "Deduplicate the attached supplier CSV",
      deliverableFormat: "csv",
      requiredFields: ["email"],
      quantityInterpreted: 3,
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

  const mkFile = async (bytes: Buffer, createdAt: Date) => {
    const storageKey = `it/file-path/${uid()}.csv`;
    const file = await prisma.file.create({
      data: {
        taskId: task.id,
        kind: "input",
        uploaderId: task.clientId,
        storageKey,
        fileName: "suppliers.csv", // SAME name on purpose
        mime: "text/csv",
        sizeBytes: bytes.byteLength,
        scanStatus: "clean",
        detectedMime: "text/csv",
        sha256: sha256Hex(bytes),
        scannedAt: new Date("2026-08-10T00:00:00.000Z"),
        createdAt,
      },
      select: { id: true, fileName: true, sizeBytes: true },
    });
    await putObject(storageKey, bytes);
    return file;
  };
  const fileOne = await mkFile(fileOneBytes, new Date("2026-08-11T10:00:00.000Z"));
  const fileTwo = await mkFile(fileTwoBytes, new Date("2026-08-11T11:00:00.000Z"));
  return { task, fileOne, fileTwo };
}

/** Freeze a 3-step plan + snapshot exactly as the acceptance path does. */
async function freezePlan(
  taskId: string,
  clientId: string,
  stepParams: { ingest: unknown },
  files: { id: string; fileName: string; sizeBytes: number; sha256: string }[]
) {
  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId,
      version: 1,
      source: "ai_generated",
      deliverableDescription: "The deduplicated supplier list",
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
  const stepBase = {
    planVersionId: planVersion.id,
    estimatedMinutesOptimistic: 0,
    estimatedMinutesLikely: 0,
    estimatedMinutesConservative: 0,
    verificationMethod: "operator check",
    acceptanceCriteria: [] as string[],
    riskLevel: "low" as const,
  };
  await prisma.taskExecutionPlanStep.create({
    data: {
      ...stepBase,
      order: 1,
      title: "Read the accepted CSV",
      description: "Ingest the chosen attachment.",
      executor: "deterministic_code",
      dependsOnOrder: [],
      primitiveId: "ingest.csv",
      primitiveVersion: 1,
      params: stepParams.ingest as never,
    },
  });
  await prisma.taskExecutionPlanStep.create({
    data: {
      ...stepBase,
      order: 2,
      title: "Remove duplicates",
      description: "Exact-key dedupe on email.",
      executor: "deterministic_code",
      dependsOnOrder: [1],
      primitiveId: "data.dedupe",
      primitiveVersion: 1,
      params: { dataset: "main", keyFields: ["email"], strategy: "exact", keep: "first" } as never,
    },
  });
  await prisma.taskExecutionPlanStep.create({
    data: {
      ...stepBase,
      order: 3,
      title: "Build the candidate file",
      description: "Write the cleaned CSV.",
      executor: "deterministic_code",
      dependsOnOrder: [2],
      primitiveId: "build.csv",
      primitiveVersion: 2,
      params: {} as never,
    },
  });
  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId,
      planVersionId: planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "Clean the supplier list",
      description: "contract copy",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: clientId,
      dataClass: "business_confidential",
    },
    select: { id: true },
  });
  for (const f of files) {
    await prisma.taskAcceptanceSnapshotFile.create({
      data: {
        snapshotId: snapshot.id,
        fileId: f.id,
        sha256: f.sha256,
        fileName: f.fileName,
        sizeBytes: f.sizeBytes,
      },
    });
  }
  return { planVersionId: planVersion.id, snapshotId: snapshot.id };
}

const ITERATION_CAP = 10;
async function driveToRest(taskId: string): Promise<string> {
  for (let i = 1; i <= ITERATION_CAP; i++) {
    await advanceWorkflow(taskId);
    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId },
      select: { id: true, status: true },
    });
    if (run.status !== "running") return run.status;
    await prisma.taskWorkflowStepRun.updateMany({
      where: {
        runId: run.id,
        executionMode: "automated",
        status: { notIn: ["done", "handed_to_human"] },
      },
      data: { nextAttemptAt: new Date(0), leaseExpiresAt: new Date(0) },
    });
  }
  return (
    await prisma.taskWorkflowRun.findUniqueOrThrow({ where: { taskId }, select: { status: true } })
  ).status;
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset();
  vi.mocked(requireRole).mockReset();
});

describe("the planner's reference becomes real bytes: the commercial-activation proof", () => {
  it("ref params resolve to the RIGHT same-named file, run the real chain, and the artifact holds its rows", async () => {
    const { task, fileOne, fileTwo } = await createTaskWithFiles();

    /**
     * The planner-side half, run through the REAL resolver: the model chose
     * file_2 — the second of two identically named attachments — exactly as
     * the manifest presented them.
     */
    const manifest = buildAttachmentManifest([fileOne, fileTwo]);
    const resolution = resolveFileParams(manifest, "ingest.csv", {
      fileId: "file_2",
      datasetName: "main",
    });
    expect(resolution.outcome).toBe("resolved");
    if (resolution.outcome !== "resolved") return;
    expect(resolution.params.fileId).toBe(fileTwo.id);

    const { snapshotId } = await freezePlan(task.id, task.clientId, { ingest: resolution.params }, [
      { ...fileOne, sha256: sha256Hex(fileOneBytes) },
      { ...fileTwo, sha256: sha256Hex(fileTwoBytes) },
    ]);

    const compiled = await compileWorkflowForTask(task.id);
    expect(compiled?.fullyHuman).toBe(false);
    const automatedCount = await prisma.taskWorkflowStepRun.count({
      where: { run: { taskId: task.id }, executionMode: "automated" },
    });
    expect(automatedCount).toBe(3);

    const finalStatus = await driveToRest(task.id);
    expect(finalStatus).toBe("awaiting_human");

    // Every automated step really ran.
    const steps = await prisma.taskWorkflowStepRun.findMany({
      where: { run: { taskId: task.id } },
      orderBy: { order: "asc" },
      select: { status: true, outputSummary: true },
    });
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "done"]);

    // The candidate artifact exists in real storage and carries FILE TWO's
    // rows, deduplicated: the duplicate x@two.example collapsed, file one's
    // rows nowhere (right-file proof), the marker rows present.
    const candidateKey = artifactStorageKey({
      snapshotId,
      order: 3,
      name: "candidate",
      outputVersion: 1,
      extension: "csv",
    });
    const bytes = await readObject(candidateKey);
    expect(bytes).not.toBe(null);
    const csv = bytes!.toString("utf8");
    expect(csv).toContain("x@two.example");
    expect(csv).toContain("y@two.example");
    expect(csv.match(/x@two\.example/g)).toHaveLength(1);
    expect(csv).not.toContain("a@one.example");

    // And the frozen contract survived untouched: same snapshot files, same
    // hashes, exactly as accepted.
    const frozen = await prisma.taskAcceptanceSnapshotFile.findMany({
      where: { snapshotId },
      select: { fileId: true, sha256: true },
    });
    expect(frozen).toHaveLength(2);
    expect(frozen.find((f) => f.fileId === fileTwo.id)?.sha256).toBe(sha256Hex(fileTwoBytes));
  });

  it("a replayed ingest re-reads the SAME frozen bytes: the retry is byte-stable", async () => {
    const { task, fileOne, fileTwo } = await createTaskWithFiles();
    const manifest = buildAttachmentManifest([fileOne, fileTwo]);
    const resolution = resolveFileParams(manifest, "ingest.csv", { fileId: "file_1" });
    expect(resolution.outcome).toBe("resolved");
    if (resolution.outcome !== "resolved") return;

    const { snapshotId } = await freezePlan(task.id, task.clientId, { ingest: resolution.params }, [
      { ...fileOne, sha256: sha256Hex(fileOneBytes) },
      { ...fileTwo, sha256: sha256Hex(fileTwoBytes) },
    ]);
    await compileWorkflowForTask(task.id);
    await advanceWorkflow(task.id);

    // Force a replay of step 1 by resetting its status — the runner will
    // claim it again and must land on identical output.
    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: task.id },
      select: { id: true },
    });
    const payloadKey = artifactStorageKey({
      snapshotId,
      order: 1,
      name: "payload",
      outputVersion: 1,
      extension: "json",
    });
    const firstBytes = await readObject(payloadKey);
    expect(firstBytes).not.toBe(null);
    await prisma.taskWorkflowStepRun.updateMany({
      where: { runId: run.id, order: 1 },
      data: {
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(0),
        leaseExpiresAt: new Date(0),
      },
    });
    await driveToRest(task.id);
    const secondBytes = await readObject(payloadKey);
    expect(secondBytes).not.toBe(null);
    expect(secondBytes!.equals(firstBytes!)).toBe(true);
  });
});

describe("hostile: references and ids that must never reach bytes", () => {
  it("an invented reference is a QUOTE-TIME human plan: zero automated file steps exist", async () => {
    const { task, fileOne, fileTwo } = await createTaskWithFiles();
    const manifest = buildAttachmentManifest([fileOne, fileTwo]);

    // The planner hallucinated file_7. Resolution strips it; the frozen
    // params fail the schema; the compiler refuses the step.
    const resolution = resolveFileParams(manifest, "ingest.csv", { fileId: "file_7" });
    expect(resolution.outcome).toBe("unresolved");
    if (resolution.outcome !== "unresolved") return;
    expect(parsePrimitiveParams("ingest.csv", resolution.params)).toBe(null);

    await freezePlan(task.id, task.clientId, { ingest: resolution.params }, [
      { ...fileOne, sha256: sha256Hex(fileOneBytes) },
      { ...fileTwo, sha256: sha256Hex(fileTwoBytes) },
    ]);
    const compiled = await compileWorkflowForTask(task.id);

    // The ingest step is a person's; its dependents cascade human with it
    // (topology rule 3), so NOTHING automated exists to run.
    expect(compiled?.fullyHuman).toBe(true);
    const stepRuns = await prisma.taskWorkflowStepRun.count({
      where: { run: { taskId: task.id }, executionMode: "automated" },
    });
    expect(stepRuns).toBe(0);
  });

  it("a FOREIGN fileId frozen into a plan is refused at runtime with zero foreign bytes read", async () => {
    // Task A with its own files; task B the victim whose file A's plan names.
    const a = await createTaskWithFiles();
    const b = await createTaskWithFiles();

    /**
     * Simulates the pre-LOT-A disaster shape (or a deliberate DB-level
     * attack): B's REAL id sits in A's frozen params, bypassing resolution
     * entirely. The third wall — the acceptance snapshot's frozen file set —
     * must refuse it: B's file is not among A's snapshot files.
     */
    await freezePlan(
      a.task.id,
      a.task.clientId,
      { ingest: { fileId: b.fileOne.id, datasetName: "main" } },
      [
        { ...a.fileOne, sha256: sha256Hex(fileOneBytes) },
        { ...a.fileTwo, sha256: sha256Hex(fileTwoBytes) },
      ]
    );
    const compiled = await compileWorkflowForTask(a.task.id);
    // The params PARSE (a cuid is a valid string), so the step compiles
    // automated — which is exactly why the runtime wall must exist.
    expect(compiled?.fullyHuman).toBe(false);

    const finalStatus = await driveToRest(a.task.id);
    expect(finalStatus).toBe("paused");

    const step = await prisma.taskWorkflowStepRun.findFirstOrThrow({
      where: { run: { taskId: a.task.id }, order: 1 },
      select: { status: true, lastError: true },
    });
    expect(step.status).toBe("failed");
    // The primitive's own refusal for a file outside the frozen set.
    expect(step.lastError ?? "").toContain("not among the files frozen on the contract");

    // Zero foreign content anywhere: no payload artifact was written for the
    // ingest step, so B's rows exist nowhere under A's snapshot.
    const aSnapshot = await prisma.taskAcceptanceSnapshot.findFirstOrThrow({
      where: { taskId: a.task.id },
      select: { id: true },
    });
    const payloadKey = artifactStorageKey({
      snapshotId: aSnapshot.id,
      order: 1,
      name: "payload",
      outputVersion: 1,
      extension: "json",
    });
    expect(await objectExists(payloadKey)).toBe(false);
  });

  it("the admin edit door refuses a foreign fileId before anything freezes", async () => {
    const a = await createTaskWithFiles();
    const b = await createTaskWithFiles();
    // The edit door only opens pre-quote; the shared fixture parks tasks in
    // ai_processing for the runtime scenarios, so rewind this one.
    await prisma.task.update({
      where: { id: a.task.id },
      data: { status: "pricing_review" as never },
    });
    vi.mocked(requireRole).mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      email: "admin@it.local",
      name: "Admin",
    } as never);

    // A real, editable (unaccepted) plan for task A.
    const planVersion = await prisma.taskExecutionPlanVersion.create({
      data: {
        taskId: a.task.id,
        version: 1,
        source: "ai_generated",
        deliverableDescription: "The deduplicated supplier list",
        internalCostLikelyCents: 3_000,
        internalCostConservativeCents: 4_000,
        suggestedPriceCents: 10_000,
        suggestedVaPayoutCents: 2_000,
        calibration: "uncalibrated",
      },
      select: { id: true },
    });

    const stepInput = (fileId: string) => ({
      taskId: a.task.id,
      baseVersionId: planVersion.id,
      deliverableDescription: "The deduplicated supplier list",
      assumptions: [],
      exclusions: [],
      steps: [
        {
          title: "Read the accepted CSV",
          description: "Ingest the chosen attachment.",
          executor: "deterministic_code",
          humanRole: null,
          tool: null,
          primitiveId: "ingest.csv",
          params: { fileId, datasetName: "main" },
          fixedMinutes: null,
          secondsPerUnit: null,
          estimatedMinutesOptimistic: 0,
          estimatedMinutesLikely: 0,
          estimatedMinutesConservative: 0,
          estimatedAiCostCents: 0,
          estimatedToolUnits: 0,
          verificationMethod: "operator check",
          acceptanceCriteria: [],
          riskLevel: "low",
          riskNote: null,
          dependsOnOrder: [],
        },
      ],
    });

    // Hostile: B's file — refused with the ownership message, no new version.
    const refused = await editPlanVersion(stepInput(b.fileOne.id));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("does not own");
    expect(await prisma.taskExecutionPlanVersion.count({ where: { taskId: a.task.id } })).toBe(1);

    // Non-vacuity: A's own file saves as version N+1 through the same door.
    const accepted = await editPlanVersion(stepInput(a.fileOne.id));
    expect(accepted.ok, accepted.ok ? "" : `editPlanVersion refused: ${accepted.error}`).toBe(true);
    expect(await prisma.taskExecutionPlanVersion.count({ where: { taskId: a.task.id } })).toBe(2);
  });
});
