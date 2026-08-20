import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEV_BENCH_V1 } from "@/lib/engineering-factory/catalog";
import type { DevBenchRun } from "@/lib/engineering-factory/devbench-run";
import {
  assertRunMatchesDryRunTrial,
  captureDryRunTrialSlot,
  createDryRunTrialPlan,
  persistDryRunTrialSlot,
  type DryRunTrialCandidate,
} from "@/lib/engineering-factory/measured-trial-v2";
import { readPersistedMeasuredRun } from "@/lib/engineering-factory/measured-run";

const CASE_SEEDS: Readonly<Record<string, string>> = {
  "EF-001": "651a41949c0461a7331e4c41395e9a4c2cd0add2",
  "EF-002": "749f3585ed3f1ce929375a351ff850d0a639a185",
  "EF-003": "b0e9d4355baf36b7d088f4f1149a634434b7ef73",
  "EF-004": "7e2571ae463a28f6adb28f977211b0606a7ddfed",
  "EF-005": "715ed11b83512e6ef819d2c36be0de5940dbeb41",
  "EF-006": "949d78172e6d5a747ed09096afec04dea97db7a7",
  "EF-007": "eb85b209b1b1e76693b0bc512bb7eb8e95ed833f",
  "EF-008": "265063c2c8eea4b4cd6f7ad10f4d8197ec6d7a84",
} as const;

const CANDIDATES: readonly DryRunTrialCandidate[] = [
  {
    participant: "Codex",
    label: "codex-terra-high",
    modelLabel: "gpt-5.6-terra",
    harnessLabel: "codex-cli-minimal",
    reasoningEffort: "high",
    costSource: "unavailable",
  },
  {
    participant: "Claude",
    label: "claude-sonnet-high",
    modelLabel: "sonnet",
    harnessLabel: "claude-cli-minimal",
    reasoningEffort: "high",
    costSource: "unavailable",
  },
];

function acceptedRun(slot: ReturnType<typeof createDryRunTrialPlan>["schedule"][number]): DevBenchRun {
  const benchCase = DEV_BENCH_V1.cases.find((candidate) => candidate.id === slot.caseId)!;
  const candidate = CANDIDATES.find((candidate) => candidate.participant === slot.participant)!;
  return {
    schemaVersion: 1,
    runId: `v2-${slot.pass}-${slot.caseId}-${slot.participant}`,
    catalogVersion: 1,
    startingCommit: slot.startingCommit,
    candidate: {
      label: candidate.label,
      modelLabel: candidate.modelLabel,
      harnessLabel: candidate.harnessLabel,
      reasoningEffort: candidate.reasoningEffort,
      contextMode: "sanitized-frozen-checkout",
      networkAccess: "none",
    },
    measurements: {
      elapsedSeconds: 45,
      elapsedSource: "harness-monotonic",
      costCents: null,
      costSource: "unavailable",
      humanInterventions: 0,
    },
    outcomes: [
      {
        caseId: benchCase.id,
        oracle: "pass",
        mutation: "caught-and-restored",
        scope: "pass",
        commands: benchCase.commands.map((command) => ({ command, exitCode: 0 })),
      },
    ],
    reviewerVerdict: "accepted",
  };
}

describe("Engineering Factory per-case measured dry-run plan", () => {
  it("freezes every case to its own seed and counterbalances four full passes", () => {
    const plan = createDryRunTrialPlan({ catalog: DEV_BENCH_V1, caseSeeds: CASE_SEEDS, candidates: CANDIDATES });

    expect(plan.schedule).toHaveLength(32);
    expect(plan.schedule.filter((slot) => slot.pass === 1).map((slot) => slot.participant)).toEqual([
      ...Array(DEV_BENCH_V1.cases.length).fill("Codex"),
    ]);
    expect(plan.schedule.filter((slot) => slot.pass === 2).map((slot) => slot.participant)).toEqual([
      ...Array(DEV_BENCH_V1.cases.length).fill("Claude"),
    ]);
    expect(plan.schedule.filter((slot) => slot.pass === 3).map((slot) => slot.participant)).toEqual([
      ...Array(DEV_BENCH_V1.cases.length).fill("Claude"),
    ]);
    expect(plan.schedule.filter((slot) => slot.pass === 4).map((slot) => slot.participant)).toEqual([
      ...Array(DEV_BENCH_V1.cases.length).fill("Codex"),
    ]);
    for (const slot of plan.schedule) expect(slot.startingCommit).toBe(CASE_SEEDS[slot.caseId]);
    expect(plan.costComparison).toBe("unavailable-by-design");
  });

  it("refuses an incomplete or swapped seed map before any candidate can run", () => {
    expect(() =>
      createDryRunTrialPlan({
        catalog: DEV_BENCH_V1,
        caseSeeds: { ...CASE_SEEDS, "EF-003": CASE_SEEDS["EF-004"] },
        candidates: CANDIDATES,
      })
    ).toThrow("caseSeeds must contain one distinct frozen commit per catalog case");

    const incomplete = { ...CASE_SEEDS };
    delete incomplete["EF-008"];
    expect(() => createDryRunTrialPlan({ catalog: DEV_BENCH_V1, caseSeeds: incomplete, candidates: CANDIDATES })).toThrow(
      "caseSeeds must contain one distinct frozen commit per catalog case"
    );
  });

  it("accepts time-only evidence but refuses a run against another case seed or a cost claim", () => {
    const plan = createDryRunTrialPlan({ catalog: DEV_BENCH_V1, caseSeeds: CASE_SEEDS, candidates: CANDIDATES });
    const slot = plan.schedule[0]!;
    expect(() => assertRunMatchesDryRunTrial({ plan, slot, run: acceptedRun(slot), catalog: DEV_BENCH_V1 })).not.toThrow();
    expect(() =>
      assertRunMatchesDryRunTrial({
        plan,
        slot,
        run: { ...acceptedRun(slot), startingCommit: CASE_SEEDS["EF-002"] },
        catalog: DEV_BENCH_V1,
      })
    ).toThrow("startingCommit differs from the frozen case seed");
    expect(() =>
      assertRunMatchesDryRunTrial({
        plan,
        slot,
        run: {
          ...acceptedRun(slot),
          measurements: { ...acceptedRun(slot).measurements, costCents: 1, costSource: "harness-meter" },
        },
        catalog: DEV_BENCH_V1,
      })
    ).toThrow("dry-run cost must remain explicitly unavailable");
  });

  it("captures exactly one declared case with an evaluator-owned clock", async () => {
    const plan = createDryRunTrialPlan({ catalog: DEV_BENCH_V1, caseSeeds: CASE_SEEDS, candidates: CANDIDATES });
    const slot = plan.schedule[0]!;
    const values = [0n, 12_000_000_000n];
    const run = await captureDryRunTrialSlot({
      plan,
      slot,
      runId: "v2-focused-slot",
      humanInterventions: 0,
      catalog: DEV_BENCH_V1,
      monotonicNow: () => values.shift() ?? 12_000_000_000n,
      capture: async () => ({
        outcomes: acceptedRun(slot).outcomes,
        reviewerVerdict: "accepted",
        rawPrompt: "must be discarded by the capture envelope",
      }),
    });
    expect(run.outcomes).toHaveLength(1);
    expect(run.measurements.elapsedSeconds).toBe(12);
    expect(run.measurements.costCents).toBeNull();
  });

  it("persists and reads a focused slot without requiring the other seven cases", async () => {
    const plan = createDryRunTrialPlan({ catalog: DEV_BENCH_V1, caseSeeds: CASE_SEEDS, candidates: CANDIDATES });
    const slot = plan.schedule[0]!;
    const run = acceptedRun(slot);
    const directory = await mkdtemp(join(tmpdir(), "endvera-dry-run-slot-"));
    try {
      const file = await persistDryRunTrialSlot({ plan, slot, run, catalog: DEV_BENCH_V1, directory });
      await expect(readPersistedMeasuredRun({ file, catalog: DEV_BENCH_V1, expectedCaseIds: [slot.caseId] })).resolves.toMatchObject({
        runId: run.runId,
        outcomes: [{ caseId: slot.caseId }],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
