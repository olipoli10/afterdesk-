import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEV_BENCH_V1 } from "@/lib/engineering-factory/catalog";
import {
  createApprovedTrialPlanFromManifest,
  createTrialManifestTemplate,
  readApprovedTrialManifest,
  writeTrialManifestTemplate,
} from "@/lib/engineering-factory/trial-manifest";

const STARTING_COMMIT = "053f5614f2ce2530e3f0f1a52f68202e1f058d4b";
const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function approvedManifest() {
  return {
    schemaVersion: 1 as const,
    status: "APPROVED" as const,
    startingCommit: STARTING_COMMIT,
    candidates: [
      {
        participant: "Codex" as const,
        label: "candidate-a",
        modelLabel: "declared-model-a",
        harnessLabel: "approved-harness-a",
        reasoningEffort: "high" as const,
        costSource: "harness-meter" as const,
      },
      {
        participant: "Claude" as const,
        label: "candidate-b",
        modelLabel: "declared-model-b",
        harnessLabel: "approved-harness-b",
        reasoningEffort: "high" as const,
        costSource: "provider-billing-export" as const,
      },
    ],
  };
}

describe("Engineering Factory trial configuration manifest", () => {
  it("keeps the generated manifest in DRAFT until two real configurations are approved", () => {
    const template = createTrialManifestTemplate(STARTING_COMMIT);

    expect(template.status).toBe("DRAFT");
    expect(() => createApprovedTrialPlanFromManifest({ manifest: template, catalog: DEV_BENCH_V1 })).toThrow(
      "trial configuration manifest is not approved"
    );

    const plan = createApprovedTrialPlanFromManifest({ manifest: approvedManifest(), catalog: DEV_BENCH_V1 });
    expect(plan.schedule).toHaveLength(4);
    expect(plan.candidates.map((candidate) => candidate.label)).toEqual(["candidate-a", "candidate-b"]);
  });

  it("rejects a sensitive field before local manifest approval", () => {
    expect(() =>
      createApprovedTrialPlanFromManifest({
        manifest: { ...approvedManifest(), apiKey: "redacted-value" },
        catalog: DEV_BENCH_V1,
      })
    ).toThrow("sensitive field is forbidden: apiKey");
  });

  it("writes a create-only local template and refuses a modified approved file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "endvera-trial-manifest-"));
    scratchDirectories.push(directory);

    const file = await writeTrialManifestTemplate({ startingCommit: STARTING_COMMIT, directory });
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ schemaVersion: 1, status: "DRAFT" });
    await expect(writeTrialManifestTemplate({ startingCommit: STARTING_COMMIT, directory })).rejects.toThrow(
      "trial configuration manifest already exists"
    );

    await writeFile(file, JSON.stringify(approvedManifest()), "utf8");
    await expect(readApprovedTrialManifest({ file, catalog: DEV_BENCH_V1 })).resolves.toMatchObject({ status: "APPROVED" });
    await writeFile(file, JSON.stringify({ ...approvedManifest(), secret: "redacted-value" }), "utf8");
    await expect(readApprovedTrialManifest({ file, catalog: DEV_BENCH_V1 })).rejects.toThrow(
      "sensitive field is forbidden: secret"
    );
  });
});
