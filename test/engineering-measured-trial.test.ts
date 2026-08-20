import { describe, expect, it } from "vitest";

import { DEV_BENCH_V1 } from "@/lib/engineering-factory/catalog";
import type { DevBenchRun } from "@/lib/engineering-factory/devbench-run";
import {
  assertRunMatchesMeasuredTrial,
  createMeasuredTrialPlan,
  type MeasuredTrialCandidate,
} from "@/lib/engineering-factory/measured-trial";

const STARTING_COMMIT = "053f5614f2ce2530e3f0f1a52f68202e1f058d4b";

const CANDIDATES: readonly MeasuredTrialCandidate[] = [
  {
    participant: "Codex",
    label: "candidate-a",
    modelLabel: "declared-model-a",
    harnessLabel: "approved-harness-a",
    reasoningEffort: "high",
    costSource: "harness-meter",
  },
  {
    participant: "Claude",
    label: "candidate-b",
    modelLabel: "declared-model-b",
    harnessLabel: "approved-harness-b",
    reasoningEffort: "high",
    costSource: "provider-billing-export",
  },
];

function acceptedRun(candidate: MeasuredTrialCandidate): DevBenchRun {
  return {
    schemaVersion: 1,
    runId: `${candidate.label}-round-1`,
    catalogVersion: 1,
    startingCommit: STARTING_COMMIT,
    candidate: {
      label: candidate.label,
      modelLabel: candidate.modelLabel,
      harnessLabel: candidate.harnessLabel,
      reasoningEffort: candidate.reasoningEffort,
      contextMode: "sanitized-frozen-checkout",
      networkAccess: "none",
    },
    measurements: {
      elapsedSeconds: 51,
      elapsedSource: "harness-monotonic",
      costCents: 36,
      costSource: candidate.costSource,
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
}

describe("Engineering Factory measured trial plan", () => {
  it("freezes equal packets and counterbalances candidate order", () => {
    const plan = createMeasuredTrialPlan({
      catalog: DEV_BENCH_V1,
      startingCommit: STARTING_COMMIT,
      candidates: CANDIDATES,
    });

    expect(plan.packetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.caseIds).toEqual(DEV_BENCH_V1.cases.map((benchCase) => benchCase.id));
    expect(plan.schedule.map((slot) => `${slot.round}:${slot.position}:${slot.participant}`)).toEqual([
      "1:1:Codex",
      "1:2:Claude",
      "2:1:Claude",
      "2:2:Codex",
    ]);
    expect(plan.interventionRule).toContain("changes candidate input, scope, environment or result");
  });

  it("fails closed when a trial has no supported cost meter or distinct candidate configuration", () => {
    expect(() =>
      createMeasuredTrialPlan({
        catalog: DEV_BENCH_V1,
        startingCommit: STARTING_COMMIT,
        candidates: [
          CANDIDATES[0],
          { ...CANDIDATES[1], costSource: "unavailable" as never },
        ],
      })
    ).toThrow("must declare a supported cost source");

    expect(() =>
      createMeasuredTrialPlan({
        catalog: DEV_BENCH_V1,
        startingCommit: STARTING_COMMIT,
        candidates: [CANDIDATES[0], { ...CANDIDATES[0], participant: "Claude" }],
      })
    ).toThrow("must differ in at least one declared configuration field");
  });

  it("rejects an otherwise accepted run when a frozen candidate field drifts", () => {
    const plan = createMeasuredTrialPlan({
      catalog: DEV_BENCH_V1,
      startingCommit: STARTING_COMMIT,
      candidates: CANDIDATES,
    });

    expect(() => assertRunMatchesMeasuredTrial({ plan, slot: plan.schedule[0]!, run: acceptedRun(CANDIDATES[0]), catalog: DEV_BENCH_V1 })).not.toThrow();
    expect(() =>
      assertRunMatchesMeasuredTrial({
        plan,
        slot: plan.schedule[0]!,
        run: {
          ...acceptedRun(CANDIDATES[0]),
          candidate: { ...acceptedRun(CANDIDATES[0]).candidate, reasoningEffort: "medium" },
        },
        catalog: DEV_BENCH_V1,
      })
    ).toThrow("candidate.reasoningEffort differs from the frozen trial plan");
  });
});
