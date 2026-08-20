import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assessCandidateExecutionReadiness,
  createCandidateExecutionAuthorityTemplate,
  createCandidateExecutionPlanFingerprint,
  preflightCandidateExecutionAuthority,
  writeCandidateExecutionAuthorityTemplate,
} from "@/lib/engineering-factory/candidate-execution-readiness";
import { DEV_BENCH_V1 } from "@/lib/engineering-factory/catalog";
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

const plan = createDryRunTrialPlan({ catalog: DEV_BENCH_V1, caseSeeds: CASE_SEEDS, candidates: CANDIDATES });
const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function approvedAuthority() {
  return {
    schemaVersion: 1 as const,
    status: "APPROVED" as const,
    planFingerprint: createCandidateExecutionPlanFingerprint(plan),
    executionMode: "external-isolated-runner" as const,
    workspaceMode: "detached-frozen-worktree" as const,
    candidateInputBoundary: "frozen-devbench-only" as const,
    environmentProjection: "allowlist-names-only" as const,
    resultProjection: "privacy-checked-measured-run-only" as const,
    networkPolicyEvidenceId: "review:network-policy:v1",
    providerDataBoundaryEvidenceId: "review:provider-data-boundary:v1",
    independentReviewId: "review:independent-approval:v1",
    runners: [
      {
        participant: "Codex" as const,
        candidateLabel: "codex-terra-high",
        modelLabel: "gpt-5.6-terra",
        harnessLabel: "codex-cli-minimal",
        reasoningEffort: "high" as const,
        executableSha256: "1".repeat(64),
        wrapperSha256: "2".repeat(64),
      },
      {
        participant: "Claude" as const,
        candidateLabel: "claude-sonnet-high",
        modelLabel: "sonnet",
        harnessLabel: "claude-cli-minimal",
        reasoningEffort: "high" as const,
        executableSha256: "3".repeat(64),
        wrapperSha256: "4".repeat(64),
      },
    ],
  };
}

describe("Engineering Factory candidate execution admission", () => {
  it("keeps the template blocked until independent isolation evidence is approved", () => {
    const template = createCandidateExecutionAuthorityTemplate(plan);
    expect(template).toMatchObject({
      schemaVersion: 1,
      status: "DRAFT",
      planFingerprint: createCandidateExecutionPlanFingerprint(plan),
      runners: [{ participant: "Codex" }, { participant: "Claude" }],
    });
    expect(() => assessCandidateExecutionReadiness({ plan, authority: template })).toThrow(
      "candidate execution authority is not approved"
    );
  });

  it("admits only an exact runner set backed by all four independent evidence classes", () => {
    expect(assessCandidateExecutionReadiness({ plan, authority: approvedAuthority() })).toMatchObject({
      status: "EXECUTION_REVIEW_READY",
      planFingerprint: createCandidateExecutionPlanFingerprint(plan),
      runnerFingerprints: [
        { participant: "Codex", executableSha256: "1".repeat(64), wrapperSha256: "2".repeat(64) },
        { participant: "Claude", executableSha256: "3".repeat(64), wrapperSha256: "4".repeat(64) },
      ],
    });

    expect(() =>
      assessCandidateExecutionReadiness({
        plan,
        authority: { ...approvedAuthority(), networkPolicyEvidenceId: "" },
      })
    ).toThrow("networkPolicyEvidenceId is required");
    expect(() =>
      assessCandidateExecutionReadiness({
        plan,
        authority: { ...approvedAuthority(), providerDataBoundaryEvidenceId: "TODO" },
      })
    ).toThrow("providerDataBoundaryEvidenceId contains a placeholder");
    expect(() =>
      assessCandidateExecutionReadiness({
        plan,
        authority: { ...approvedAuthority(), independentReviewId: "" },
      })
    ).toThrow("independentReviewId is required");
    expect(() =>
      assessCandidateExecutionReadiness({
        plan,
        authority: { ...approvedAuthority(), runners: [approvedAuthority().runners[0]] },
      })
    ).toThrow("runner declarations must match the frozen candidates exactly");
  });

  it("fails closed on plan drift, runner drift and any content-bearing or secret-bearing field", () => {
    expect(() =>
      assessCandidateExecutionReadiness({
        plan,
        authority: { ...approvedAuthority(), planFingerprint: "f".repeat(64) },
      })
    ).toThrow("planFingerprint differs from the frozen dry-run plan");
    expect(() =>
      assessCandidateExecutionReadiness({
        plan,
        authority: {
          ...approvedAuthority(),
          runners: [
            { ...approvedAuthority().runners[0], modelLabel: "another-model" },
            approvedAuthority().runners[1],
          ],
        },
      })
    ).toThrow("runner declaration differs from the frozen candidate: Codex");
    expect(() =>
      assessCandidateExecutionReadiness({
        plan,
        authority: { ...approvedAuthority(), apiKey: "must-not-enter-this-file" },
      })
    ).toThrow("sensitive field is forbidden: apiKey");
    expect(() =>
      assessCandidateExecutionReadiness({
        plan,
        authority: { ...approvedAuthority(), rawPrompt: "must-not-enter-this-file" },
      })
    ).toThrow("sensitive field is forbidden: rawPrompt");
    expect(() =>
      assessCandidateExecutionReadiness({
        plan,
        authority: { ...approvedAuthority(), notes: "an unbounded field can carry sensitive content" },
      })
    ).toThrow("unknown field is forbidden: notes");
  });

  it("writes a create-only local template and preflights without importing a process launcher", async () => {
    const directory = await mkdtemp(join(tmpdir(), "endvera-candidate-execution-"));
    scratchDirectories.push(directory);
    const file = await writeCandidateExecutionAuthorityTemplate({ plan, directory });
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ status: "DRAFT" });
    await expect(writeCandidateExecutionAuthorityTemplate({ plan, directory })).rejects.toThrow(
      "candidate execution authority already exists"
    );
    await expect(preflightCandidateExecutionAuthority({ plan, file })).rejects.toThrow(
      "candidate execution authority is not approved"
    );
    await writeFile(file, JSON.stringify(approvedAuthority()), "utf8");
    await expect(preflightCandidateExecutionAuthority({ plan, file })).resolves.toMatchObject({
      status: "EXECUTION_REVIEW_READY",
    });

    const source = (
      await Promise.all([
        readFile(
          join(process.cwd(), "src", "lib", "engineering-factory", "candidate-execution-readiness.ts"),
          "utf8"
        ),
        readFile(join(process.cwd(), "scripts", "preflight-engineering-candidate-execution.ts"), "utf8"),
        readFile(join(process.cwd(), "scripts", "create-engineering-candidate-execution-authority.ts"), "utf8"),
      ])
    ).join("\n");
    expect(source).not.toMatch(/node:child_process|\bspawn\s*\(|\bexecFile\s*\(|\bexec\s*\(/);
  });
});
