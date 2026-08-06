import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { putObject, readObject } from "@/lib/storage";
import type { ArtifactSpec, WorkflowPayload } from "@/lib/ai-work-engine/primitives/types";

/**
 * ARTIFACTS PRODUCED BY THE MACHINE.
 *
 * They live in the existing `File` table rather than a parallel one, so they
 * inherit the download route's authorisation ladder, FileAccessLog, the
 * filename anonymisation and the retention purge. Duplicating that security
 * surface for a second kind of file would be the worst available choice.
 *
 * STORAGE KEYS ARE DETERMINISTIC per (snapshot, step, output name, output
 * version). A replayed step overwrites its own object and updates its own row
 * instead of accumulating near-identical files that an operator then has to
 * tell apart. The snapshot id is in the key because the snapshot IS the
 * contract: two runs of two contracts can never collide.
 */

export function artifactStorageKey(input: {
  snapshotId: string;
  order: number;
  name: string;
  outputVersion: number;
  extension: string;
}): string {
  const safeName = input.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `artifact/${input.snapshotId}/step-${input.order}/v${input.outputVersion}/${safeName}.${input.extension}`;
}

/**
 * Writes (or rewrites) one artifact. `uploaderId` is the literal string
 * "system": the column has no foreign key, and naming a real person as the
 * uploader of a machine-generated file would be a lie in an audit trail.
 *
 * scanStatus is "clean" because we produced the bytes. The HTTP upload route
 * stays closed to this path — it requires a CLIENT or VA session by design.
 */
export async function writeArtifact(input: {
  taskId: string;
  runId: string;
  stepRunId: string;
  snapshotId: string;
  order: number;
  spec: ArtifactSpec;
}): Promise<{ fileId: string; storageKey: string }> {
  const storageKey = artifactStorageKey({
    snapshotId: input.snapshotId,
    order: input.order,
    name: input.spec.name,
    outputVersion: input.spec.outputVersion,
    extension: input.spec.extension,
  });

  await putObject(storageKey, input.spec.body);

  const sha256 = createHash("sha256").update(input.spec.body).digest("hex");
  const fileName = `${input.spec.name}.${input.spec.extension}`;

  const file = await prisma.file.upsert({
    where: { storageKey },
    create: {
      taskId: input.taskId,
      kind: "artifact",
      uploaderId: "system",
      storageKey,
      fileName,
      mime: input.spec.mime,
      sizeBytes: input.spec.body.byteLength,
      scanStatus: "clean",
      detectedMime: input.spec.mime,
      sha256,
      scannedAt: new Date(),
      workflowRunId: input.runId,
      workflowStepRunId: input.stepRunId,
      artifactVisibility: input.spec.visibility,
    },
    update: {
      sizeBytes: input.spec.body.byteLength,
      sha256,
      scannedAt: new Date(),
      workflowStepRunId: input.stepRunId,
      artifactVisibility: input.spec.visibility,
      // A rewrite clears a previous purge: the object is on disk again.
      purgedAt: null,
    },
    select: { id: true },
  });

  return { fileId: file.id, storageKey };
}

/** The name the run's inter-step payload is always stored under. */
const PAYLOAD_ARTIFACT = "payload";

/**
 * The payload handed from one step to the next is itself an artifact. That is
 * what makes the run resumable across process restarts: a step reclaimed after
 * a crash reads its predecessor's output from storage, not from memory.
 */
export async function persistPayload(input: {
  taskId: string;
  runId: string;
  stepRunId: string;
  snapshotId: string;
  order: number;
  payload: WorkflowPayload;
}): Promise<void> {
  await writeArtifact({
    ...input,
    spec: {
      name: PAYLOAD_ARTIFACT,
      outputVersion: 1,
      extension: "json",
      mime: "application/json",
      body: Buffer.from(JSON.stringify(input.payload), "utf8"),
      // Internal machine state. Never a worker's business, never a client's.
      visibility: "admin_only",
    },
  });
}

/**
 * Reads the payload left by the highest-ordered step of this run that wrote
 * one. Returns null when there is none, which is the ordinary case for the
 * first step of a run.
 */
export async function loadLatestPayload(
  runId: string,
  /**
   * The order of the step ABOUT TO RUN. Only payloads written by strictly
   * earlier steps are eligible.
   *
   * Without this bound a replayed step read its OWN output back as its input.
   * The window is not hypothetical: persistPayload and the `status: "done"`
   * update are two separate writes, so a transient failure on the second one
   * marks the step `failed` with its payload already on disk, and the retry
   * would feed extract.structured_rows the rows it had just produced instead
   * of the evidence it was supposed to read. Idempotence, which lease-based
   * recovery depends on entirely, only holds with this bound in place.
   */
  beforeOrder?: number
): Promise<WorkflowPayload | null> {
  const rows = await prisma.file.findMany({
    where: {
      workflowRunId: runId,
      kind: "artifact",
      fileName: `${PAYLOAD_ARTIFACT}.json`,
      purgedAt: null,
      ...(beforeOrder === undefined
        ? {}
        : { workflowStepRun: { order: { lt: beforeOrder } } }),
    },
    select: { storageKey: true, workflowStepRun: { select: { order: true } } },
  });
  if (rows.length === 0) return null;

  const latest = rows.sort(
    (a, b) => (b.workflowStepRun?.order ?? 0) - (a.workflowStepRun?.order ?? 0)
  )[0];

  /**
   * A FAILED READ IS NOT AN EMPTY PAYLOAD.
   *
   * This used to swallow the error and return null, on the reasoning that a
   * shorter result beats a run that cannot advance. That reasoning is wrong,
   * and the cost is total: null makes the caller substitute `emptyPayload`,
   * the primitive then SUCCEEDS on empty input (split.exceptions returns no
   * rows, build.csv writes a header-only file), and both write to the same
   * deterministic storage keys as the good run. One transient object-store
   * hiccup on a replayed step therefore destroys the real payload and the
   * real candidate CSV, marks the step done, and finishes the run — with the
   * client billed for searches whose output no longer exists.
   *
   * Throwing instead routes into the ordinary retry path: the step fails,
   * backs off, and tries again with the data still intact. A genuinely absent
   * payload (the first step of a run) still returns null above, which is the
   * only case that legitimately means "there is nothing to read".
   */
  const buffer = await readObject(latest.storageKey);
  const parsed: unknown = JSON.parse(buffer.toString("utf8"));
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as WorkflowPayload).rows)
  ) {
    throw new Error(`Stored payload at ${latest.storageKey} is not a workflow payload.`);
  }
  return parsed as WorkflowPayload;
}
