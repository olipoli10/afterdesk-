import { createHash } from "node:crypto";

const PINNED_IMAGE = /^[a-z0-9./_-]+@sha256:[0-9a-f]{64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BUNDLE_ROOT = "/home/efrunner/.local/share/endvera-native-isolation/";
const EXPECTED_ENVIRONMENT_NAMES = [
  "EF_NATIVE_PARTICIPANT",
  "EF_NATIVE_PROTOCOL",
  "HOME",
  "HOSTNAME",
  "PATH",
  "PWD",
  "SHLVL",
  "container",
] as const;

const MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;
const PIDS_LIMIT = 64;
const CPU_QUOTA_MICROS = 50_000;
const CPU_PERIOD_MICROS = 100_000;
const WALL_CLOCK_LIMIT_MS = 10_000;
const RAW_STREAM_LIMIT_BYTES = 65_536 as const;

export class NativeIsolationControlRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativeIsolationControlRefusal";
  }
}

export type NativeSyntheticContainerInvocation = {
  executable: "wsl.exe";
  args: readonly string[];
  inputTransport: "stdin";
  wallClockLimitMs: 10_000;
  rawStreamLimitBytes: 65_536;
  capabilityFingerprint: string;
};

export type NativeIsolationControlObservation = {
  schemaVersion: 1;
  backend: "wsl2-rootless-podman";
  distribution: string;
  runtimeVersion: string;
  imageReference: string;
  rootless: boolean;
  wslAutomountDisabled: boolean;
  windowsInteropDisabled: boolean;
  windowsPathAbsent: boolean;
  runtimeSocketAbsent: boolean;
  bundlePath: string;
  bundleHasNoGitMetadata: boolean;
  bundleReadOnly: boolean;
  rootFilesystemReadOnly: boolean;
  tmpfsWritable: boolean;
  tmpfsNoExec: boolean;
  runningUid: number;
  effectiveCapabilitiesHex: string;
  noNewPrivileges: boolean;
  seccompMode: number;
  networkInterfaces: string[];
  memoryLimitBytes: number;
  pidsLimit: number;
  cpuQuotaMicros: number;
  cpuPeriodMicros: number;
  environmentNames: string[];
  inputTransport: "stdin";
  inputDigest: string;
  rawStdoutBytes: number;
  rawStderrBytes: number;
  rawStreamsDiscarded: boolean;
  ephemeralWorkspaceRemoved: boolean;
  wallClockLimitMs: number;
  realCandidateInvocations: 0;
  syntheticCandidateInvocations: 1;
  providerCalls: 0;
};

export type NativeIsolationControlEvidence = NativeIsolationControlObservation & {
  status: "NATIVE_SYNTHETIC_CONTROL_PROVED";
  executionAuthority: "DRAFT";
  executionAuthorized: false;
  controls: {
    windowsHostPathsUnavailable: true;
    runtimeSocketAbsent: true;
    bundleOnlyReadOnlyMount: true;
    readOnlyRootAndBoundedTmpfs: true;
    nonRootCapabilitiesDropped: true;
    noNewPrivilegesAndSeccomp: true;
    resourceLimitsEnforced: true;
    networkNone: true;
    stdinOnly: true;
    allowlistedEnvironmentOnly: true;
    rawStreamsDestroyedBeforePersistence: true;
    ephemeralWorkspaceRemoved: true;
  };
  limitation: "synthetic-control-only-real-candidates-remain-blocked";
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isApprovedBundlePath(bundlePath: string): boolean {
  if (!bundlePath.startsWith(BUNDLE_ROOT) || !bundlePath.endsWith("/bundle")) return false;
  if (bundlePath === `${BUNDLE_ROOT}bundle`) return false;
  const lower = bundlePath.toLowerCase();
  return (
    !lower.includes("/.git") &&
    !lower.includes("/podman.sock") &&
    !lower.includes("/docker.sock") &&
    !lower.startsWith("/mnt/") &&
    !lower.includes("..")
  );
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export function buildNativeSyntheticContainerInvocation({
  participant,
  imageReference,
  bundlePath,
}: {
  participant: "Synthetic";
  imageReference: string;
  bundlePath: string;
}): NativeSyntheticContainerInvocation {
  if (!PINNED_IMAGE.test(imageReference)) {
    throw new NativeIsolationControlRefusal("native synthetic image must be pinned by SHA-256 digest");
  }
  if (!isApprovedBundlePath(bundlePath)) {
    throw new NativeIsolationControlRefusal("native bundle path must be an isolated copied bundle");
  }

  const podmanArgs = [
    "podman",
    "run",
    "--rm",
    "--interactive",
    "--pull=never",
    "--network=none",
    "--read-only",
    "--user=65532:65532",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--memory=256m",
    "--cpus=0.5",
    "--pids-limit=64",
    "--http-proxy=false",
    "--log-driver=none",
    "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16777216",
    `--volume=${bundlePath}:/bundle:ro,nodev,nosuid,noexec`,
    "--workdir=/tmp",
    "--env=EF_NATIVE_PARTICIPANT=Synthetic",
    "--env=EF_NATIVE_PROTOCOL=1",
    "--env=HOME=/tmp",
    "--entrypoint=/bin/sh",
    imageReference,
    "/bundle/synthetic-control.sh",
  ] as const;

  return {
    executable: "wsl.exe",
    args: ["-d", "Debian", "--exec", ...podmanArgs],
    inputTransport: "stdin",
    wallClockLimitMs: WALL_CLOCK_LIMIT_MS,
    rawStreamLimitBytes: RAW_STREAM_LIMIT_BYTES,
    capabilityFingerprint: sha256(
      JSON.stringify({
        participant,
        imageReference,
        network: "none",
        root: "read-only",
        tmpfs: "16m-noexec-nosuid-nodev",
        user: "65532:65532",
        capabilities: "none",
        noNewPrivileges: true,
        seccomp: "runtime-default",
        memoryBytes: MEMORY_LIMIT_BYTES,
        cpus: 0.5,
        pids: PIDS_LIMIT,
        input: "stdin",
        rawStreamBytes: RAW_STREAM_LIMIT_BYTES,
        wallClockMs: WALL_CLOCK_LIMIT_MS,
      })
    ),
  };
}

export function assessNativeIsolationControlEvidence(
  observation: NativeIsolationControlObservation
): NativeIsolationControlEvidence {
  const controls = {
    windowsHostPathsUnavailable:
      observation.wslAutomountDisabled &&
      observation.windowsInteropDisabled &&
      observation.windowsPathAbsent,
    runtimeSocketAbsent: observation.runtimeSocketAbsent,
    bundleOnlyReadOnlyMount:
      isApprovedBundlePath(observation.bundlePath) &&
      observation.bundleHasNoGitMetadata &&
      observation.bundleReadOnly,
    readOnlyRootAndBoundedTmpfs:
      observation.rootFilesystemReadOnly &&
      observation.tmpfsWritable &&
      observation.tmpfsNoExec,
    nonRootCapabilitiesDropped:
      Number.isInteger(observation.runningUid) &&
      observation.runningUid > 0 &&
      /^0+$/.test(observation.effectiveCapabilitiesHex),
    noNewPrivilegesAndSeccomp:
      observation.noNewPrivileges && observation.seccompMode === 2,
    resourceLimitsEnforced:
      observation.memoryLimitBytes === MEMORY_LIMIT_BYTES &&
      observation.pidsLimit === PIDS_LIMIT &&
      observation.cpuQuotaMicros === CPU_QUOTA_MICROS &&
      observation.cpuPeriodMicros === CPU_PERIOD_MICROS &&
      observation.wallClockLimitMs === WALL_CLOCK_LIMIT_MS &&
      observation.rawStdoutBytes + observation.rawStderrBytes <= RAW_STREAM_LIMIT_BYTES,
    networkNone:
      observation.networkInterfaces.length === 1 &&
      observation.networkInterfaces[0] === "lo",
    stdinOnly:
      observation.inputTransport === "stdin" && SHA256.test(observation.inputDigest),
    allowlistedEnvironmentOnly: sameStringSet(
      observation.environmentNames,
      EXPECTED_ENVIRONMENT_NAMES
    ),
    rawStreamsDestroyedBeforePersistence: observation.rawStreamsDiscarded,
    ephemeralWorkspaceRemoved: observation.ephemeralWorkspaceRemoved,
  } as const;

  const failed = Object.entries(controls)
    .filter(([, passed]) => !passed)
    .map(([control]) => control);
  if (
    observation.schemaVersion !== 1 ||
    observation.backend !== "wsl2-rootless-podman" ||
    !PINNED_IMAGE.test(observation.imageReference) ||
    !observation.rootless ||
    observation.realCandidateInvocations !== 0 ||
    observation.syntheticCandidateInvocations !== 1 ||
    observation.providerCalls !== 0 ||
    failed.length > 0
  ) {
    throw new NativeIsolationControlRefusal(
      `native isolation control evidence failed closed${failed.length ? `: ${failed.join(", ")}` : ""}`
    );
  }

  return {
    ...observation,
    status: "NATIVE_SYNTHETIC_CONTROL_PROVED",
    executionAuthority: "DRAFT",
    executionAuthorized: false,
    controls: controls as NativeIsolationControlEvidence["controls"],
    limitation: "synthetic-control-only-real-candidates-remain-blocked",
  };
}
