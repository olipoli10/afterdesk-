import { describe, expect, it, vi } from "vitest";

import { DEV_BENCH_V1 } from "@/lib/engineering-factory/catalog";
import {
  DEV_BENCH_V1_FROZEN_CHALLENGE_PATHS,
  DryRunExecutorRefusal,
  rehearseDryRunExecutor,
  type DryRunGitWorktreePort,
} from "@/lib/engineering-factory/dry-run-executor";
import { createDryRunTrialPlan, type DryRunTrialCandidate } from "@/lib/engineering-factory/measured-trial-v2";

const CASE_SEEDS: Readonly<Record<string, string>> = {
  "EF-001": "651a41949c0461a7331e4c41395e9a4c2cd0add2",
  "EF-002": "749f3585ed3f1ce929375a351ff850d0a639a185",
  "EF-003": "b0e9d4355baf36b7d088f4f1149a634434b7ef73",
  "EF-004": "7e2571ae463a28f6adb28f977211b0606a7ddfed",
  "EF-005": "715ed11b83512e6ef819d2c36be0de5940dbeb41",
  "EF-006": "949d78172e6d5a747ed09096afec04dea97db7a7",
  "EF-007": "eb85b209b1b1e76693b0bc512bb7eb8e95ed833f",
  "EF-008": "265063c2c8eea4b4cd6f7ad10f4d8197ec6d7a84",
};

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

function plan() {
  return createDryRunTrialPlan({ catalog: DEV_BENCH_V1, caseSeeds: CASE_SEEDS, candidates: CANDIDATES });
}

function port({ head, status = "", challenge = "frozen evaluator-owned challenge" }: { head?: string; status?: string; challenge?: string } = {}) {
  const addDetached = vi.fn(async () => undefined);
  const inspect = vi.fn(async ({ expectedCommit }: { expectedCommit: string }) => ({
    head: head ?? expectedCommit,
    trackedChanges: status,
    challenge,
  }));
  const removeClean = vi.fn(async () => undefined);
  return {
    value: { addDetached, inspect, removeClean } satisfies DryRunGitWorktreePort,
    addDetached,
    inspect,
    removeClean,
  };
}

describe("Engineering Factory local executor rehearsal", () => {
  it("rehearses a fresh detached slot and emits only a challenge fingerprint, never challenge text", async () => {
    const trial = plan();
    const fake = port({ challenge: "do not expose this frozen challenge body" });

    const result = await rehearseDryRunExecutor({
      plan: trial,
      catalog: DEV_BENCH_V1,
      repositoryDirectory: "C:\\repo",
      scratchDirectory: "C:\\repo\\.scratch\\engineering-factory\\executor-rehearsal",
      worktreePort: fake.value,
      maxSlots: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      caseId: "EF-001",
      startingCommit: CASE_SEEDS["EF-001"],
      challengePath: DEV_BENCH_V1_FROZEN_CHALLENGE_PATHS["EF-001"],
      cleanup: "removed",
    });
    expect(JSON.stringify(result)).not.toContain("do not expose this frozen challenge body");
    expect(fake.addDetached).toHaveBeenCalledTimes(1);
    expect(fake.removeClean).toHaveBeenCalledTimes(1);
  });

  it("fails closed before cleanup when a fresh worktree does not resolve to its frozen seed", async () => {
    const trial = plan();
    const fake = port({ head: CASE_SEEDS["EF-002"] });

    await expect(
      rehearseDryRunExecutor({
        plan: trial,
        catalog: DEV_BENCH_V1,
        repositoryDirectory: "C:\\repo",
        scratchDirectory: "C:\\repo\\.scratch\\engineering-factory\\executor-rehearsal",
        worktreePort: fake.value,
        maxSlots: 1,
      })
    ).rejects.toThrow("worktree HEAD differs from the frozen slot seed");
    expect(fake.removeClean).not.toHaveBeenCalled();
  });

  it("refuses a worktree with tracked changes before it can emit a packet", async () => {
    const trial = plan();
    const fake = port({ status: " M src/lib/ai-work-engine/compile.ts" });

    await expect(
      rehearseDryRunExecutor({
        plan: trial,
        catalog: DEV_BENCH_V1,
        repositoryDirectory: "C:\\repo",
        scratchDirectory: "C:\\repo\\.scratch\\engineering-factory\\executor-rehearsal",
        worktreePort: fake.value,
        maxSlots: 1,
      })
    ).rejects.toThrow("fresh worktree has tracked changes");
    expect(fake.removeClean).not.toHaveBeenCalled();
  });

  it("rejects any challenge map that is incomplete or points outside the frozen checkout", async () => {
    const trial = plan();
    const fake = port();
    const incomplete = { ...DEV_BENCH_V1_FROZEN_CHALLENGE_PATHS } as Record<string, string>;
    delete incomplete["EF-008"];

    await expect(
      rehearseDryRunExecutor({
        plan: trial,
        catalog: DEV_BENCH_V1,
        repositoryDirectory: "C:\\repo",
        scratchDirectory: "C:\\repo\\.scratch\\engineering-factory\\executor-rehearsal",
        challengePaths: incomplete,
        worktreePort: fake.value,
        maxSlots: 1,
      })
    ).rejects.toBeInstanceOf(DryRunExecutorRefusal);

    await expect(
      rehearseDryRunExecutor({
        plan: trial,
        catalog: DEV_BENCH_V1,
        repositoryDirectory: "C:\\repo",
        scratchDirectory: "C:\\repo\\.scratch\\engineering-factory\\executor-rehearsal",
        challengePaths: { ...DEV_BENCH_V1_FROZEN_CHALLENGE_PATHS, "EF-001": "../escape.md" },
        worktreePort: fake.value,
        maxSlots: 1,
      })
    ).rejects.toThrow("challenge path must stay inside the frozen checkout");
  });
});
