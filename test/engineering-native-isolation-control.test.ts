import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  NativeIsolationControlRefusal,
  assessNativeIsolationControlEvidence,
  buildNativeSyntheticContainerInvocation,
  type NativeIsolationControlObservation,
} from "../src/lib/engineering-factory/native-isolation-control";
import {
  persistNativeIsolationEvidence,
  readNativeIsolationEvidence,
} from "../tools/engineering-factory/native-runner/native-runner";

const IMAGE = "docker.io/library/alpine@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BUNDLE = "/home/efrunner/.local/share/endvera-native-isolation/run-001/bundle";

const PASSING_OBSERVATION: NativeIsolationControlObservation = {
  schemaVersion: 1,
  backend: "wsl2-rootless-podman",
  distribution: "Debian GNU/Linux 13 (trixie)",
  runtimeVersion: "5.4.2",
  imageReference: IMAGE,
  rootless: true,
  wslAutomountDisabled: true,
  windowsInteropDisabled: true,
  windowsPathAbsent: true,
  runtimeSocketAbsent: true,
  bundlePath: BUNDLE,
  bundleHasNoGitMetadata: true,
  bundleReadOnly: true,
  rootFilesystemReadOnly: true,
  tmpfsWritable: true,
  tmpfsNoExec: true,
  runningUid: 65532,
  effectiveCapabilitiesHex: "0000000000000000",
  noNewPrivileges: true,
  seccompMode: 2,
  networkInterfaces: ["lo"],
  memoryLimitBytes: 268435456,
  pidsLimit: 64,
  cpuQuotaMicros: 50000,
  cpuPeriodMicros: 100000,
  environmentNames: [
    "EF_NATIVE_PARTICIPANT",
    "EF_NATIVE_PROTOCOL",
    "HOME",
    "HOSTNAME",
    "PATH",
    "PWD",
    "SHLVL",
    "container",
  ],
  inputTransport: "stdin",
  inputDigest: "b".repeat(64),
  rawStdoutBytes: 1200,
  rawStderrBytes: 0,
  rawStreamsDiscarded: true,
  ephemeralWorkspaceRemoved: true,
  wallClockLimitMs: 10000,
  realCandidateInvocations: 0,
  syntheticCandidateInvocations: 1,
  providerCalls: 0,
};

describe("Engineering Factory native isolation controls", () => {
  it("builds a fixed provider-free Podman invocation with every mandatory kernel control", () => {
    const invocation = buildNativeSyntheticContainerInvocation({
      participant: "Synthetic",
      imageReference: IMAGE,
      bundlePath: BUNDLE,
    });
    const command = invocation.args.join(" ");

    expect(invocation).toMatchObject({ executable: "wsl.exe", inputTransport: "stdin" });
    expect(command).toContain("--network=none");
    expect(command).toContain("--interactive");
    expect(command).toContain("--read-only");
    expect(command).toContain("--user=65532:65532");
    expect(command).toContain("--cap-drop=ALL");
    expect(command).toContain("--security-opt=no-new-privileges");
    expect(command).toContain("--memory=256m");
    expect(command).toContain("--cpus=0.5");
    expect(command).toContain("--pids-limit=64");
    expect(command).toContain("--http-proxy=false");
    expect(command).toContain("/bundle:ro,nodev,nosuid,noexec");
    expect(command).toContain("/tmp:rw,noexec,nosuid,nodev,size=16777216");
    expect(command).not.toMatch(/podman\.sock|docker\.sock/);
    expect(command).not.toMatch(/codex|claude|api\.anthropic\.com|api\.openai\.com/i);
  });

  it("keeps complete task input out of process arguments", () => {
    const input = "EF_NATIVE_PRIVATE_INPUT_CANARY_6e9181";
    const invocation = buildNativeSyntheticContainerInvocation({
      participant: "Synthetic",
      imageReference: IMAGE,
      bundlePath: BUNDLE,
    });

    expect(invocation.args.join(" ")).not.toContain(input);
    expect(invocation.inputTransport).toBe("stdin");
  });

  it("refuses a repository, profile, git metadata or runtime socket mount", () => {
    for (const bundlePath of [
      "/mnt/c/dev/nightlexicon",
      "/home/efrunner/project/.git",
      "/home/efrunner",
      "/run/user/1000/podman/podman.sock",
    ]) {
      expect(() =>
        buildNativeSyntheticContainerInvocation({
          participant: "Synthetic",
          imageReference: IMAGE,
          bundlePath,
        })
      ).toThrow(NativeIsolationControlRefusal);
    }
  });

  it("requires every observed isolation control before recording synthetic proof", () => {
    const evidence = assessNativeIsolationControlEvidence(PASSING_OBSERVATION);

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      status: "NATIVE_SYNTHETIC_CONTROL_PROVED",
      backend: "wsl2-rootless-podman",
      executionAuthority: "DRAFT",
      executionAuthorized: false,
      realCandidateInvocations: 0,
      syntheticCandidateInvocations: 1,
      providerCalls: 0,
      limitation: "synthetic-control-only-real-candidates-remain-blocked",
    });
    expect(evidence.controls).toEqual(
      expect.objectContaining({
        windowsHostPathsUnavailable: true,
        runtimeSocketAbsent: true,
        bundleOnlyReadOnlyMount: true,
        readOnlyRootAndBoundedTmpfs: true,
        nonRootCapabilitiesDropped: true,
        noNewPrivilegesAndSeccomp: true,
        resourceLimitsEnforced: true,
        networkNone: true,
        stdinOnly: true,
        allowlistedEnvironmentOnly: true,
        rawStreamsDestroyedBeforePersistence: true,
        ephemeralWorkspaceRemoved: true,
      })
    );
  });

  it("fails closed when network, privilege, socket, resource or cleanup evidence is weakened", () => {
    const mutations: Partial<NativeIsolationControlObservation>[] = [
      { networkInterfaces: ["eth0", "lo"] },
      { runningUid: 0 },
      { effectiveCapabilitiesHex: "0000000000000400" },
      { noNewPrivileges: false },
      { seccompMode: 0 },
      { runtimeSocketAbsent: false },
      { rootFilesystemReadOnly: false },
      { memoryLimitBytes: 0 },
      { pidsLimit: 0 },
      { cpuQuotaMicros: 0 },
      { inputTransport: "argument" as never },
      { rawStreamsDiscarded: false },
      { ephemeralWorkspaceRemoved: false },
      { realCandidateInvocations: 1 as never },
      { providerCalls: 1 as never },
    ];

    for (const mutation of mutations) {
      expect(() =>
        assessNativeIsolationControlEvidence({ ...PASSING_OBSERVATION, ...mutation })
      ).toThrow(NativeIsolationControlRefusal);
    }
  });

  it("persists only integrity-checked metadata with create-only semantics", async () => {
    const directory = await mkdtemp(join(tmpdir(), "endvera-native-evidence-"));
    try {
      const evidence = assessNativeIsolationControlEvidence(PASSING_OBSERVATION);
      const file = await persistNativeIsolationEvidence({ evidence, directory });
      const stored = await readFile(file, "utf8");

      expect(stored).not.toContain("EF_NATIVE_PRIVATE_INPUT_CANARY");
      await expect(readNativeIsolationEvidence(file)).resolves.toEqual(evidence);
      await expect(persistNativeIsolationEvidence({ evidence, directory })).rejects.toThrow();
      await writeFile(file, stored.replace('"providerCalls":0', '"providerCalls":1'), "utf8");
      await expect(readNativeIsolationEvidence(file)).rejects.toThrow(
        "persisted native isolation evidence integrity check failed"
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps the native rehearsal source free of real candidate and provider launch commands", async () => {
    const source = await readFile(
      join(process.cwd(), "scripts", "rehearse-engineering-native-isolation.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/codex\s+exec|claude\s+-p/i);
    expect(source).not.toMatch(/api\.anthropic\.com|api\.openai\.com/i);
    expect(source).not.toMatch(/ANTHROPIC_API_KEY|OPENAI_API_KEY/i);
  });
});
