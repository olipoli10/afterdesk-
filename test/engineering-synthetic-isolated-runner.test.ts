import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildSyntheticNodeInvocation,
  persistSyntheticIsolationEvidence,
  readSyntheticIsolationEvidence,
  runSyntheticIsolationTrial,
  type SyntheticIsolationEvidence,
} from "../tools/engineering-factory/synthetic-runner/synthetic-runner";

const scratchDirectories: string[] = [];
const INPUT_CANARY = "EF_SYNTHETIC_INPUT_CANARY_71d28c";
const INHERITED_CANARY_NAME = "EF_INHERITED_SECRET_CANARY";
const INHERITED_CANARY_VALUE = "must-not-enter-child";

afterEach(async () => {
  delete process.env[INHERITED_CANARY_NAME];
  await Promise.all(
    scratchDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

function expectCompleteProof(evidence: SyntheticIsolationEvidence): void {
  expect(evidence).toMatchObject({
    schemaVersion: 1,
    status: "SYNTHETIC_BOUNDARY_PROVED",
    backend: "node-v26-permission-model",
    realCandidateInvocations: 0,
    providerCalls: 0,
    syntheticCandidateInvocations: 2,
    rawStreamsDiscarded: true,
    ephemeralWorkspaceRemoved: true,
    parity: true,
    controls: {
      allowlistedEnvironmentOnly: true,
      inputViaStdinOnly: true,
      parentReadDenied: true,
      alternateFilesystemReadDenied: true,
      outsideWriteDenied: true,
      networkDenied: true,
      childProcessDenied: true,
      workerDenied: true,
      bundleHasNoGitMetadata: true,
    },
  });
  expect(evidence.profiles).toHaveLength(2);
  expect(evidence.runnerSourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(evidence.candidateSourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(new Set(evidence.profiles.map((profile) => profile.capabilityFingerprint)).size).toBe(1);
}

describe("Engineering Factory provider-free synthetic isolated runner", () => {
  it("proves the same deny-by-default boundary for both synthetic candidates", async () => {
    process.env[INHERITED_CANARY_NAME] = INHERITED_CANARY_VALUE;
    const evidence = await runSyntheticIsolationTrial({ input: INPUT_CANARY });

    expectCompleteProof(evidence);
    expect(JSON.stringify(evidence)).not.toContain(INPUT_CANARY);
    expect(JSON.stringify(evidence)).not.toContain(INHERITED_CANARY_VALUE);
  });

  it("projects only allowlisted environment names into the child", async () => {
    process.env[INHERITED_CANARY_NAME] = INHERITED_CANARY_VALUE;
    const evidence = await runSyntheticIsolationTrial({ input: INPUT_CANARY });

    for (const profile of evidence.profiles) {
      expect(profile.environmentNames).toEqual([
        "EF_SYNTHETIC_PARTICIPANT",
        "EF_SYNTHETIC_PROTOCOL",
        "HOMEDRIVE",
        "HOMEPATH",
        "LOGONSERVER",
        "NODE_ENV",
        "PATH",
        "SYSTEMDRIVE",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "USERDOMAIN",
        "USERNAME",
        "USERPROFILE",
        "WINDIR",
      ]);
    }
  });

  it("keeps the complete input out of process arguments", async () => {
    const invocation = buildSyntheticNodeInvocation({
      participant: "Codex",
      bundleDirectory: "C:\\isolated\\bundle",
      evidenceFile: "C:\\isolated\\result\\candidate.json",
      parentCanaryFile: "C:\\isolated\\parent-canary.txt",
      outsideWriteFile: "C:\\isolated\\escape.txt",
    });

    expect(invocation.inputTransport).toBe("stdin");
    expect(invocation.executable).toBe(process.execPath);
    expect(invocation.args.join(" ")).toContain("synthetic-candidate.mjs");
    expect(invocation.args.join(" ")).not.toContain(INPUT_CANARY);
    expect(invocation.args).toContain("--permission");
    expect(invocation.args).toContain("--no-addons");
    expect(invocation.args).toContain("--no-experimental-sqlite");
    expect(invocation.args).toContain("--no-global-search-paths");
    expect(invocation.args).not.toContain("--allow-net");
    expect(invocation.args).not.toContain("--allow-child-process");
    expect(invocation.args).not.toContain("--allow-worker");
    expect(invocation.args).not.toContain("--allow-addons");
    expect(invocation.args).not.toContain("--allow-wasi");
    expect(invocation.args).not.toContain("--allow-ffi");

    await expect(runSyntheticIsolationTrial({ input: INPUT_CANARY })).resolves.toMatchObject({
      controls: { inputViaStdinOnly: true },
    });
  });

  it("denies parent filesystem reads through fs and node:sqlite", async () => {
    await expect(runSyntheticIsolationTrial({ input: INPUT_CANARY })).resolves.toMatchObject({
      controls: { parentReadDenied: true, alternateFilesystemReadDenied: true },
    });
  });

  it("denies loopback networking without an allow-net capability", async () => {
    await expect(runSyntheticIsolationTrial({ input: INPUT_CANARY })).resolves.toMatchObject({
      controls: { networkDenied: true },
    });
  });

  it("denies child-process and worker creation", async () => {
    await expect(runSyntheticIsolationTrial({ input: INPUT_CANARY })).resolves.toMatchObject({
      controls: { childProcessDenied: true, workerDenied: true },
    });
  });

  it("keeps Codex and Claude synthetic profiles capability-identical", async () => {
    const evidence = await runSyntheticIsolationTrial({ input: INPUT_CANARY });
    expect(evidence.parity).toBe(true);
    expect(new Set(evidence.profiles.map((profile) => profile.capabilityFingerprint)).size).toBe(1);
  });

  it("destroys the ephemeral bundle and raw streams before returning durable evidence", async () => {
    const observedRoots: string[] = [];
    const evidence = await runSyntheticIsolationTrial({
      input: INPUT_CANARY,
      observeEphemeralRoot: (directory) => observedRoots.push(directory),
    });

    expectCompleteProof(evidence);
    expect(observedRoots).toHaveLength(1);
    await expect(access(observedRoots[0]!)).rejects.toThrow();
    expect(JSON.stringify(evidence)).not.toContain(INPUT_CANARY);
    expect(JSON.stringify(evidence)).not.toContain("RAW_SYNTHETIC_STREAM");
  });

  it("persists only integrity-checked metadata with create-only semantics", async () => {
    const directory = await mkdtemp(join(tmpdir(), "endvera-synthetic-evidence-"));
    scratchDirectories.push(directory);
    const evidence = await runSyntheticIsolationTrial({ input: INPUT_CANARY });
    const file = await persistSyntheticIsolationEvidence({ evidence, directory });
    const stored = await readFile(file, "utf8");

    expect(stored).not.toContain(INPUT_CANARY);
    expect(stored).not.toContain(INHERITED_CANARY_VALUE);
    expect(JSON.parse(stored)).toMatchObject({ schemaVersion: 1, evidence });
    await expect(readSyntheticIsolationEvidence(file)).resolves.toEqual(evidence);
    await expect(persistSyntheticIsolationEvidence({ evidence, directory })).rejects.toThrow(
      "synthetic isolation evidence already exists"
    );

    await writeFile(file, stored.replace('"providerCalls":0', '"providerCalls":1'), "utf8");
    await expect(readSyntheticIsolationEvidence(file)).rejects.toThrow(
      "synthetic isolation evidence integrity check failed"
    );
  });
});
