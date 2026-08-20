import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type { DevBenchCatalog } from "@/lib/engineering-factory/devbench";
import {
  validateDevBenchRun,
  type CostMeasurementSource,
  type DevBenchRun,
  type DevBenchRunOutcome,
} from "@/lib/engineering-factory/devbench-run";

const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export const MEASURED_RUN_LOCAL_DIRECTORY = ".scratch/engineering-factory/measured-runs";

export type MeasuredRunDeclaration = Pick<DevBenchRun, "schemaVersion" | "runId" | "catalogVersion" | "startingCommit" | "candidate"> & {
  measurements: Pick<DevBenchRun["measurements"], "costCents" | "costSource" | "humanInterventions">;
};

export type MeasuredRunEvidence = {
  outcomes: readonly DevBenchRunOutcome[];
  reviewerVerdict: DevBenchRun["reviewerVerdict"];
};

type PersistedMeasuredRun = {
  schemaVersion: 1;
  integritySha256: string;
  run: DevBenchRun;
};

export class MeasuredRunRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeasuredRunRefusal";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function serializeRun(run: DevBenchRun): string {
  return JSON.stringify(run);
}

function validateOrRefuse(run: DevBenchRun, catalog: DevBenchCatalog, expectedCaseIds?: readonly string[]): void {
  const report = validateDevBenchRun(run, catalog, expectedCaseIds);
  if (!report.ok) {
    throw new MeasuredRunRefusal(report.errors.join("; "));
  }
}

function elapsedSeconds(start: bigint, end: bigint): number {
  if (end < start) {
    throw new MeasuredRunRefusal("monotonic evaluator clock moved backwards");
  }

  const seconds = (end - start) / NANOSECONDS_PER_SECOND;
  if (seconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MeasuredRunRefusal("elapsed evaluator time exceeds the safe integer range");
  }

  return Number(seconds);
}

function safeRunFileName(runId: string): string {
  if (!SAFE_RUN_ID.test(runId)) {
    throw new MeasuredRunRefusal("runId is unsafe for a local artifact path");
  }
  return `${runId}.json`;
}

function assertedArtifact(value: unknown): PersistedMeasuredRun {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MeasuredRunRefusal("persisted run evidence is malformed");
  }

  const artifact = value as Partial<PersistedMeasuredRun>;
  if (artifact.schemaVersion !== 1 || typeof artifact.integritySha256 !== "string" || !artifact.run) {
    throw new MeasuredRunRefusal("persisted run evidence is malformed");
  }
  return artifact as PersistedMeasuredRun;
}

/**
 * Captures evaluator-owned metadata around a candidate run. The supplied
 * callback returns result metadata only; any extra fields are intentionally
 * discarded so it cannot replace declared candidate identity or measurements.
 */
export async function captureMeasuredRun({
  declaration,
  catalog,
  capture,
  expectedCaseIds,
  monotonicNow = process.hrtime.bigint,
}: {
  declaration: MeasuredRunDeclaration;
  catalog: DevBenchCatalog;
  capture: () => Promise<MeasuredRunEvidence & Record<string, unknown>>;
  /** Defaults to the complete catalog; focused plans must declare their one case explicitly. */
  expectedCaseIds?: readonly string[];
  monotonicNow?: () => bigint;
}): Promise<DevBenchRun> {
  const startedAt = monotonicNow();
  const evidence = await capture();
  const finishedAt = monotonicNow();

  const run: DevBenchRun = {
    schemaVersion: declaration.schemaVersion,
    runId: declaration.runId,
    catalogVersion: declaration.catalogVersion,
    startingCommit: declaration.startingCommit,
    candidate: { ...declaration.candidate },
    measurements: {
      elapsedSeconds: elapsedSeconds(startedAt, finishedAt),
      elapsedSource: "harness-monotonic",
      costCents: declaration.measurements.costCents,
      costSource: declaration.measurements.costSource as CostMeasurementSource,
      humanInterventions: declaration.measurements.humanInterventions,
    },
    outcomes: evidence.outcomes,
    reviewerVerdict: evidence.reviewerVerdict,
  };

  validateOrRefuse(run, catalog, expectedCaseIds);
  return run;
}

/**
 * Stores validated metadata locally with create-only semantics. This function
 * deliberately persists no provider traffic, prompts, outputs, secrets or
 * customer content because validateDevBenchRun rejects those fields.
 */
export async function persistMeasuredRun({
  run,
  catalog,
  directory = MEASURED_RUN_LOCAL_DIRECTORY,
  expectedCaseIds,
}: {
  run: DevBenchRun;
  catalog: DevBenchCatalog;
  directory?: string;
  expectedCaseIds?: readonly string[];
}): Promise<string> {
  validateOrRefuse(run, catalog, expectedCaseIds);

  const root = resolve(directory);
  const fileName = safeRunFileName(run.runId);
  const file = resolve(root, fileName);
  if (basename(file) !== fileName || !file.startsWith(`${root}\\`)) {
    throw new MeasuredRunRefusal("run evidence path escapes its local directory");
  }

  const serializedRun = serializeRun(run);
  const artifact: PersistedMeasuredRun = {
    schemaVersion: 1,
    integritySha256: sha256(serializedRun),
    run,
  };

  await mkdir(root, { recursive: true });
  try {
    await writeFile(file, `${JSON.stringify(artifact)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      throw new MeasuredRunRefusal("run evidence already exists");
    }
    throw error;
  }
  return file;
}

export async function readPersistedMeasuredRun({
  file,
  catalog,
  expectedCaseIds,
}: {
  file: string;
  catalog: DevBenchCatalog;
  expectedCaseIds?: readonly string[];
}): Promise<DevBenchRun> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new MeasuredRunRefusal("persisted run evidence is malformed");
  }

  const artifact = assertedArtifact(parsed);
  const serializedRun = serializeRun(artifact.run);
  if (artifact.integritySha256 !== sha256(serializedRun)) {
    throw new MeasuredRunRefusal("run evidence integrity check failed");
  }
  validateOrRefuse(artifact.run, catalog, expectedCaseIds);
  return artifact.run;
}
