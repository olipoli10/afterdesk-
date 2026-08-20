import { describe, expect, it } from "vitest";

import { DEV_BENCH_V1 } from "@/lib/engineering-factory/catalog";
import {
  validateDevBenchRun,
  type DevBenchRun,
} from "@/lib/engineering-factory/devbench-run";

const VALID_RUN: DevBenchRun = {
  schemaVersion: 1,
  runId: "devbench-local-001",
  catalogVersion: 1,
  startingCommit: "053f5614f2ce2530e3f0f1a52f68202e1f058d4b",
  candidate: {
    label: "candidate-a",
    modelLabel: "declared by evaluator",
    harnessLabel: "declared by evaluator",
    reasoningEffort: "medium",
    contextMode: "sanitized-frozen-checkout",
    networkAccess: "none",
  },
  measurements: {
    elapsedSeconds: 420,
    elapsedSource: "harness-monotonic",
    costCents: 73,
    costSource: "harness-meter",
    humanInterventions: 0,
  },
  outcomes: DEV_BENCH_V1.cases.map((benchCase) => ({
    caseId: benchCase.id,
    oracle: "pass",
    mutation: "caught-and-restored",
    scope: "pass",
    commands: benchCase.commands.map((command) => ({ command, exitCode: 0 })),
  })),
  reviewerVerdict: "accepted",
};

describe("Engineering Factory DevBench run evidence", () => {
  it("accepts a complete, measurable local candidate record", () => {
    const report = validateDevBenchRun(VALID_RUN, DEV_BENCH_V1);

    expect(report.ok, report.errors.join("\n")).toBe(true);
    expect(report.acceptedCaseCount).toBe(8);
  });

  it("mutation run-missing-cost is caught", () => {
    const report = validateDevBenchRun(
      { ...VALID_RUN, measurements: { ...VALID_RUN.measurements, costCents: null } },
      DEV_BENCH_V1
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("costCents must be a non-negative integer");
  });

  it("accepts explicitly unavailable cost without making it comparable", () => {
    const report = validateDevBenchRun(
      {
        ...VALID_RUN,
        measurements: {
          ...VALID_RUN.measurements,
          elapsedSource: "harness-monotonic",
          costCents: null,
          costSource: "unavailable",
        },
      },
      DEV_BENCH_V1
    );

    expect(report.ok, report.errors.join("\n")).toBe(true);
    expect(report.measurementReadiness).toEqual({ elapsedComparable: true, costComparable: false });
  });

  it("mutation run-unavailable-cost-with-number is caught", () => {
    const report = validateDevBenchRun(
      {
        ...VALID_RUN,
        measurements: {
          ...VALID_RUN.measurements,
          elapsedSource: "harness-monotonic",
          costCents: 0,
          costSource: "unavailable",
        },
      },
      DEV_BENCH_V1
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("costCents must be null when costSource is unavailable");
  });

  it("mutation run-unproven-mutation is caught", () => {
    const report = validateDevBenchRun(
      {
        ...VALID_RUN,
        outcomes: [
          { ...VALID_RUN.outcomes[0], mutation: "not-run" },
          ...VALID_RUN.outcomes.slice(1),
        ],
      },
      DEV_BENCH_V1
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("EF-001: mutation must be caught-and-restored");
  });

  it("mutation run-sensitive-field is caught before a record can be accepted", () => {
    const withSecret = {
      ...VALID_RUN,
      rawPrompt: "do not persist this",
    };
    const report = validateDevBenchRun(withSecret, DEV_BENCH_V1);

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("sensitive field is forbidden: rawPrompt");
  });
});
