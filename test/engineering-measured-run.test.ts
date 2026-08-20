import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { scoreDevBenchRun } from "@/lib/engineering-factory/bakeoff";
import { DEV_BENCH_V1 } from "@/lib/engineering-factory/catalog";
import {
  captureMeasuredRun,
  persistMeasuredRun,
  readPersistedMeasuredRun,
  type MeasuredRunDeclaration,
} from "@/lib/engineering-factory/measured-run";

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function declaration(overrides: Partial<MeasuredRunDeclaration> = {}): MeasuredRunDeclaration {
  return {
    schemaVersion: 1,
    runId: "candidate-a-20260820-001",
    catalogVersion: 1,
    startingCommit: "053f5614f2ce2530e3f0f1a52f68202e1f058d4b",
    candidate: {
      label: "candidate-a",
      modelLabel: "declared-model",
      harnessLabel: "local-measured-run-v1",
      reasoningEffort: "high",
      contextMode: "sanitized-frozen-checkout",
      networkAccess: "none",
    },
    measurements: {
      costCents: 73,
      costSource: "harness-meter",
      humanInterventions: 0,
    },
    ...overrides,
  };
}

function acceptedEvidence() {
  return {
    outcomes: DEV_BENCH_V1.cases.map((benchCase) => ({
      caseId: benchCase.id,
      oracle: "pass" as const,
      mutation: "caught-and-restored" as const,
      scope: "pass" as const,
      commands: benchCase.commands.map((command) => ({ command, exitCode: 0 })),
    })),
    reviewerVerdict: "accepted" as const,
  };
}

function sequenceClock(...values: bigint[]) {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0n;
}

describe("Engineering Factory measured-run harness", () => {
  it("records elapsed time from the evaluator clock, not candidate evidence", async () => {
    const run = await captureMeasuredRun({
      declaration: declaration(),
      catalog: DEV_BENCH_V1,
      monotonicNow: sequenceClock(10_000_000_000n, 13_900_000_000n),
      capture: async () => ({
        ...acceptedEvidence(),
        candidate: { label: "candidate-controlled-by-evidence" },
        measurements: { elapsedSeconds: 0, elapsedSource: "unavailable" },
      }),
    });

    expect(run.candidate).toEqual(declaration().candidate);
    expect(run.measurements).toEqual({
      elapsedSeconds: 3,
      elapsedSource: "harness-monotonic",
      costCents: 73,
      costSource: "harness-meter",
      humanInterventions: 0,
    });
  });

  it("persists one integrity-checked local record and refuses a changed record", async () => {
    const directory = await mkdtemp(join(tmpdir(), "endvera-devbench-"));
    scratchDirectories.push(directory);
    const run = await captureMeasuredRun({
      declaration: declaration(),
      catalog: DEV_BENCH_V1,
      monotonicNow: sequenceClock(0n, 1_000_000_000n),
      capture: async () => acceptedEvidence(),
    });

    const file = await persistMeasuredRun({ run, catalog: DEV_BENCH_V1, directory });
    await expect(readPersistedMeasuredRun({ file, catalog: DEV_BENCH_V1 })).resolves.toEqual(run);
    await expect(persistMeasuredRun({ run, catalog: DEV_BENCH_V1, directory })).rejects.toThrow(
      "run evidence already exists"
    );

    const stored = await readFile(file, "utf8");
    await writeFile(file, stored.replace('"costCents":73', '"costCents":74'), "utf8");
    await expect(readPersistedMeasuredRun({ file, catalog: DEV_BENCH_V1 })).rejects.toThrow(
      "run evidence integrity check failed"
    );
  });

  it("rejects a numeric value paired with an unavailable cost source before capture", async () => {
    await expect(
      captureMeasuredRun({
        declaration: declaration({
          measurements: { costCents: 0, costSource: "unavailable", humanInterventions: 0 },
        }),
        catalog: DEV_BENCH_V1,
        monotonicNow: sequenceClock(0n, 1n),
        capture: async () => acceptedEvidence(),
      })
    ).rejects.toThrow("costCents must be null when costSource is unavailable");
  });

  it("records unavailable cost honestly but blocks a cost or speed ranking", async () => {
    const run = await captureMeasuredRun({
      declaration: declaration({
        measurements: { costCents: null, costSource: "unavailable", humanInterventions: 2 },
      }),
      catalog: DEV_BENCH_V1,
      monotonicNow: sequenceClock(0n, 2_000_000_000n),
      capture: async () => acceptedEvidence(),
    });

    const scorecard = scoreDevBenchRun(run, DEV_BENCH_V1);
    expect(scorecard.comparable).toBe(false);
    expect(scorecard.blockers).toContain("cost measurement is unavailable");
    expect(scorecard.costPerAcceptedCaseCents).toBeNull();
  });

  it("rejects an unsafe run identifier before it can become a local artifact path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "endvera-devbench-"));
    scratchDirectories.push(directory);
    const run = await captureMeasuredRun({
      declaration: declaration({ runId: "../../escape" }),
      catalog: DEV_BENCH_V1,
      monotonicNow: sequenceClock(0n, 1n),
      capture: async () => acceptedEvidence(),
    });

    await expect(persistMeasuredRun({ run, catalog: DEV_BENCH_V1, directory })).rejects.toThrow(
      "runId is unsafe for a local artifact path"
    );
  });
});
