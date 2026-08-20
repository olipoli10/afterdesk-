import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEV_BENCH_V1 } from "@/lib/engineering-factory/catalog";
import {
  createApprovedDryRunTrialPlanFromManifest,
  createDryRunTrialManifestTemplate,
  preflightApprovedDryRunTrialManifest,
  writeDryRunTrialManifestTemplate,
} from "@/lib/engineering-factory/trial-manifest-v2";

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
const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function approvedManifest() {
  return {
    schemaVersion: 2 as const,
    status: "APPROVED" as const,
    caseSeeds: CASE_SEEDS,
    candidates: [
      {
        participant: "Codex" as const,
        label: "codex-terra-high",
        modelLabel: "gpt-5.6-terra",
        harnessLabel: "codex-cli-minimal",
        reasoningEffort: "high" as const,
        costSource: "unavailable" as const,
      },
      {
        participant: "Claude" as const,
        label: "claude-sonnet-high",
        modelLabel: "sonnet",
        harnessLabel: "claude-cli-minimal",
        reasoningEffort: "high" as const,
        costSource: "unavailable" as const,
      },
    ],
  };
}

describe("Engineering Factory per-case dry-run manifest", () => {
  it("keeps the local template in DRAFT and emits 32 slots only after explicit approval", () => {
    const template = createDryRunTrialManifestTemplate(CASE_SEEDS);
    expect(template.status).toBe("DRAFT");
    expect(() => createApprovedDryRunTrialPlanFromManifest({ manifest: template, catalog: DEV_BENCH_V1 })).toThrow(
      "dry-run trial configuration manifest is not approved"
    );
    const plan = createApprovedDryRunTrialPlanFromManifest({ manifest: approvedManifest(), catalog: DEV_BENCH_V1 });
    expect(plan.schedule).toHaveLength(32);
    expect(plan.costComparison).toBe("unavailable-by-design");
  });

  it("refuses sensitive input and any claimed cost meter", () => {
    expect(() =>
      createApprovedDryRunTrialPlanFromManifest({
        manifest: { ...approvedManifest(), apiKey: "redacted" },
        catalog: DEV_BENCH_V1,
      })
    ).toThrow("sensitive field is forbidden: apiKey");
    expect(() =>
      createApprovedDryRunTrialPlanFromManifest({
        manifest: {
          ...approvedManifest(),
          candidates: [{ ...approvedManifest().candidates[0], costSource: "harness-meter" }, approvedManifest().candidates[1]],
        },
        catalog: DEV_BENCH_V1,
      })
    ).toThrow("dry-run costSource must be unavailable");
  });

  it("writes a create-only local template and preflights an approved plan without launching a candidate", async () => {
    const directory = await mkdtemp(join(tmpdir(), "endvera-dry-run-manifest-"));
    scratchDirectories.push(directory);
    const file = await writeDryRunTrialManifestTemplate({ caseSeeds: CASE_SEEDS, directory });
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ schemaVersion: 2, status: "DRAFT" });
    await expect(writeDryRunTrialManifestTemplate({ caseSeeds: CASE_SEEDS, directory })).rejects.toThrow(
      "dry-run trial configuration manifest already exists"
    );
    await expect(preflightApprovedDryRunTrialManifest({ file, catalog: DEV_BENCH_V1 })).rejects.toThrow(
      "dry-run trial configuration manifest is not approved"
    );
    await writeFile(file, JSON.stringify(approvedManifest()), "utf8");
    await expect(preflightApprovedDryRunTrialManifest({ file, catalog: DEV_BENCH_V1 })).resolves.toMatchObject({
      manifest: { status: "APPROVED" },
      plan: { schedule: expect.any(Array), costComparison: "unavailable-by-design" },
    });
  });
});
