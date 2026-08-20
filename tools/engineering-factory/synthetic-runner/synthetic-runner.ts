import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PARTICIPANTS = ["Codex", "Claude"] as const;
const ENVIRONMENT_NAMES = [
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
] as const;
const MAX_RAW_STREAM_BYTES = 64 * 1024;
const RUN_TIMEOUT_MS = 10_000;
const EVIDENCE_FILE_NAME = "synthetic-isolation-evidence-v1.json";
const SHA256 = /^[0-9a-f]{64}$/;

type SyntheticParticipant = (typeof PARTICIPANTS)[number];
type SyntheticChildEnvironment = NodeJS.ProcessEnv & { NODE_ENV: "test" };

type SyntheticCandidateResult = {
  schemaVersion: 1;
  participant: SyntheticParticipant;
  protocol: "1";
  environmentNames: string[];
  inputDigest: string;
  syntheticProviderDigest: string;
  controls: {
    parentReadDenied: boolean;
    alternateFilesystemReadDenied: boolean;
    outsideWriteDenied: boolean;
    networkDenied: boolean;
    childProcessDenied: boolean;
    workerDenied: boolean;
  };
};

export type SyntheticNodeInvocation = {
  executable: string;
  args: readonly string[];
  environment: SyntheticChildEnvironment;
  inputTransport: "stdin";
  capabilityFingerprint: string;
};

export type SyntheticIsolationEvidence = {
  schemaVersion: 1;
  status: "SYNTHETIC_BOUNDARY_PROVED";
  backend: "node-v26-permission-model";
  runtimeVersion: string;
  realCandidateInvocations: 0;
  syntheticCandidateInvocations: 2;
  providerCalls: 0;
  syntheticProviderCalls: 2;
  rawStreamsDiscarded: true;
  ephemeralWorkspaceRemoved: true;
  parity: boolean;
  runnerSourceFingerprint: string;
  candidateSourceFingerprint: string;
  bundleManifestFingerprint: string;
  profiles: readonly {
    participant: SyntheticParticipant;
    capabilityFingerprint: string;
    environmentNames: readonly string[];
  }[];
  controls: {
    allowlistedEnvironmentOnly: boolean;
    inputViaStdinOnly: boolean;
    parentReadDenied: boolean;
    alternateFilesystemReadDenied: boolean;
    outsideWriteDenied: boolean;
    networkDenied: boolean;
    childProcessDenied: boolean;
    workerDenied: boolean;
    bundleHasNoGitMetadata: boolean;
  };
  limitation: "synthetic-node-candidate-only-native-cli-not-approved";
};

export class SyntheticRunnerRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyntheticRunnerRefusal";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function candidateEntrypoint(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "synthetic-candidate.mjs");
}

function runtimeMajor(): number {
  return Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
}

function capabilityFingerprint(): string {
  return sha256(
    JSON.stringify({
      runtime: "node-v26-permission-model",
      read: "bundle-only",
      write: "result-only",
      network: "denied",
      childProcess: "denied",
      worker: "denied",
      addons: "denied",
      sqlite: "disabled",
      globalModuleSearch: "disabled",
      wasi: "denied",
      ffi: "denied",
      environmentNames: ENVIRONMENT_NAMES,
      inputTransport: "stdin",
      timeLimitMs: RUN_TIMEOUT_MS,
      rawStreamLimitBytes: MAX_RAW_STREAM_BYTES,
    })
  );
}

export function buildSyntheticNodeInvocation({
  participant,
  bundleDirectory,
  evidenceFile,
  parentCanaryFile,
  outsideWriteFile,
}: {
  participant: SyntheticParticipant;
  bundleDirectory: string;
  evidenceFile: string;
  parentCanaryFile: string;
  outsideWriteFile: string;
}): SyntheticNodeInvocation {
  const resolvedBundle = resolve(bundleDirectory);
  const resolvedEvidence = resolve(evidenceFile);
  const ephemeralRoot = resolve(resolvedBundle, "..");
  const systemRoot = process.env.SYSTEMROOT ?? process.env.WINDIR;
  if (!systemRoot) {
    throw new SyntheticRunnerRefusal("the reviewed Windows system root is unavailable");
  }
  const systemDrive = systemRoot.slice(0, 2);
  const homePath = ephemeralRoot.startsWith(systemDrive)
    ? ephemeralRoot.slice(systemDrive.length)
    : "\\synthetic-runner";
  return {
    executable: process.execPath,
    args: [
      "--permission",
      "--no-addons",
      "--no-experimental-sqlite",
      "--no-global-search-paths",
      `--allow-fs-read=${resolvedBundle}`,
      `--allow-fs-write=${resolve(dirname(resolvedEvidence))}`,
      candidateEntrypoint(),
      resolvedBundle,
      resolvedEvidence,
      resolve(parentCanaryFile),
      resolve(outsideWriteFile),
    ],
    environment: {
      EF_SYNTHETIC_PARTICIPANT: participant,
      EF_SYNTHETIC_PROTOCOL: "1",
      HOMEDRIVE: systemDrive,
      HOMEPATH: homePath,
      LOGONSERVER: "synthetic-runner",
      NODE_ENV: "test",
      PATH: "",
      SYSTEMDRIVE: systemDrive,
      SYSTEMROOT: systemRoot,
      TEMP: ephemeralRoot,
      TMP: ephemeralRoot,
      USERDOMAIN: "synthetic-runner",
      USERNAME: "synthetic-runner",
      USERPROFILE: ephemeralRoot,
      WINDIR: systemRoot,
    },
    inputTransport: "stdin",
    capabilityFingerprint: capabilityFingerprint(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCandidateResult(value: unknown, participant: SyntheticParticipant): SyntheticCandidateResult {
  if (!isRecord(value) || !isRecord(value.controls)) {
    throw new SyntheticRunnerRefusal("synthetic candidate result is malformed");
  }
  const result = value as Partial<SyntheticCandidateResult>;
  if (
    result.schemaVersion !== 1 ||
    result.participant !== participant ||
    result.protocol !== "1" ||
    !Array.isArray(result.environmentNames) ||
    typeof result.inputDigest !== "string" ||
    !SHA256.test(result.inputDigest) ||
    typeof result.syntheticProviderDigest !== "string" ||
    !SHA256.test(result.syntheticProviderDigest)
  ) {
    throw new SyntheticRunnerRefusal("synthetic candidate result is malformed");
  }
  for (const control of [
    "parentReadDenied",
    "alternateFilesystemReadDenied",
    "outsideWriteDenied",
    "networkDenied",
    "childProcessDenied",
    "workerDenied",
  ] as const) {
    if (result.controls?.[control] !== true) {
      throw new SyntheticRunnerRefusal(`synthetic isolation control failed: ${control}`);
    }
  }
  return result as SyntheticCandidateResult;
}

async function runCandidate({
  participant,
  input,
  bundleDirectory,
  evidenceFile,
  parentCanaryFile,
  outsideWriteFile,
}: {
  participant: SyntheticParticipant;
  input: string;
  bundleDirectory: string;
  evidenceFile: string;
  parentCanaryFile: string;
  outsideWriteFile: string;
}): Promise<{ result: SyntheticCandidateResult; invocation: SyntheticNodeInvocation }> {
  const invocation = buildSyntheticNodeInvocation({
    participant,
    bundleDirectory,
    evidenceFile,
    parentCanaryFile,
    outsideWriteFile,
  });
  const processArgs = [...invocation.args];

  let stdoutBytes = 0;
  let stderrBytes = 0;
  let overflow = false;

  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(invocation.executable, processArgs, {
      cwd: bundleDirectory,
      env: invocation.environment,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new SyntheticRunnerRefusal("synthetic candidate exceeded its time limit"));
    }, RUN_TIMEOUT_MS);

    const count = (stream: "stdout" | "stderr", chunk: Buffer) => {
      if (stream === "stdout") stdoutBytes += chunk.byteLength;
      else stderrBytes += chunk.byteLength;
      if (stdoutBytes + stderrBytes > MAX_RAW_STREAM_BYTES) {
        overflow = true;
        child.kill();
      }
    };
    child.stdout.on("data", (chunk: Buffer) => count("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => count("stderr", chunk));
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolveExit(code ?? -1);
    });
    child.stdin.end(input, "utf8");
  });

  if (overflow) throw new SyntheticRunnerRefusal("synthetic candidate exceeded its raw stream limit");
  if (exitCode !== 0) throw new SyntheticRunnerRefusal(`synthetic candidate exited with code ${exitCode}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(evidenceFile, "utf8"));
  } catch {
    throw new SyntheticRunnerRefusal("synthetic candidate result is malformed");
  }
  const result = parseCandidateResult(parsed, participant);
  if (result.inputDigest !== sha256(input)) {
    throw new SyntheticRunnerRefusal("synthetic candidate did not receive the stdin input");
  }
  if (processArgs.some((argument) => argument.includes(input))) {
    throw new SyntheticRunnerRefusal("synthetic input appeared in process arguments");
  }
  return { result, invocation };
}

function assertEvidence(evidence: SyntheticIsolationEvidence): void {
  const failedControls = Object.entries(evidence.controls)
    .filter(([, passed]) => !passed)
    .map(([control]) => control);
  if (
    evidence.status !== "SYNTHETIC_BOUNDARY_PROVED" ||
    evidence.realCandidateInvocations !== 0 ||
    evidence.providerCalls !== 0 ||
    evidence.syntheticCandidateInvocations !== 2 ||
    evidence.syntheticProviderCalls !== 2 ||
    !evidence.rawStreamsDiscarded ||
    !evidence.ephemeralWorkspaceRemoved ||
    !evidence.parity ||
    failedControls.length > 0
  ) {
    throw new SyntheticRunnerRefusal(
      `synthetic isolation evidence is incomplete${
        failedControls.length > 0 ? `: ${failedControls.join(", ")}` : ""
      }`
    );
  }
}

export async function runSyntheticIsolationTrial({
  input,
  observeEphemeralRoot,
}: {
  input: string;
  observeEphemeralRoot?: (directory: string) => void;
}): Promise<SyntheticIsolationEvidence> {
  if (runtimeMajor() < 26) {
    throw new SyntheticRunnerRefusal("Node.js 26 or newer is required for deny-by-default network permissions");
  }
  if (!input || Buffer.byteLength(input, "utf8") > 16 * 1024) {
    throw new SyntheticRunnerRefusal("synthetic input must be non-empty and at most 16 KiB");
  }

  const root = await mkdtemp(join(tmpdir(), "endvera-synthetic-runner-"));
  observeEphemeralRoot?.(root);
  const bundleDirectory = join(root, "bundle");
  const resultDirectory = join(root, "result");
  const parentCanaryFile = join(root, "parent-canary.txt");
  const outsideWriteFile = join(root, "escape.txt");
  const fixture = "provider-free synthetic fixture v1\n";
  let provisional: Omit<SyntheticIsolationEvidence, "ephemeralWorkspaceRemoved"> | undefined;

  try {
    await mkdir(bundleDirectory, { recursive: false });
    await mkdir(resultDirectory, { recursive: false });
    await writeFile(join(bundleDirectory, "fixture.txt"), fixture, { encoding: "utf8", flag: "wx" });
    await writeFile(parentCanaryFile, "parent filesystem canary", { encoding: "utf8", flag: "wx" });

    const profiles = [];
    for (const participant of PARTICIPANTS) {
      const evidenceFile = join(resultDirectory, `${participant.toLowerCase()}.json`);
      const { result, invocation } = await runCandidate({
        participant,
        input,
        bundleDirectory,
        evidenceFile,
        parentCanaryFile,
        outsideWriteFile,
      });
      profiles.push({
        participant,
        capabilityFingerprint: invocation.capabilityFingerprint,
        environmentNames: [...result.environmentNames],
      });
    }

    const bundleHasNoGitMetadata = await access(join(bundleDirectory, ".git")).then(
      () => false,
      () => true
    );
    const expectedEnvironmentNames = [...ENVIRONMENT_NAMES].sort();
    const allowlistedEnvironmentOnly = profiles.every(
      (profile) => JSON.stringify(profile.environmentNames) === JSON.stringify(expectedEnvironmentNames)
    );
    const parity = new Set(profiles.map((profile) => profile.capabilityFingerprint)).size === 1;
    const [runnerSource, candidateSource] = await Promise.all([
      readFile(fileURLToPath(import.meta.url), "utf8"),
      readFile(candidateEntrypoint(), "utf8"),
    ]);

    provisional = {
      schemaVersion: 1,
      status: "SYNTHETIC_BOUNDARY_PROVED",
      backend: "node-v26-permission-model",
      runtimeVersion: process.versions.node,
      realCandidateInvocations: 0,
      syntheticCandidateInvocations: 2,
      providerCalls: 0,
      syntheticProviderCalls: 2,
      rawStreamsDiscarded: true,
      parity,
      runnerSourceFingerprint: sha256(runnerSource),
      candidateSourceFingerprint: sha256(candidateSource),
      bundleManifestFingerprint: sha256(JSON.stringify({ "fixture.txt": sha256(fixture) })),
      profiles,
      controls: {
        allowlistedEnvironmentOnly,
        inputViaStdinOnly: true,
        parentReadDenied: true,
        alternateFilesystemReadDenied: true,
        outsideWriteDenied: true,
        networkDenied: true,
        childProcessDenied: true,
        workerDenied: true,
        bundleHasNoGitMetadata,
      },
      limitation: "synthetic-node-candidate-only-native-cli-not-approved",
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  if (!provisional) throw new SyntheticRunnerRefusal("synthetic isolation trial did not complete");
  await access(root).then(
    () => {
      throw new SyntheticRunnerRefusal("ephemeral synthetic workspace was not removed");
    },
    () => undefined
  );
  const evidence: SyntheticIsolationEvidence = { ...provisional, ephemeralWorkspaceRemoved: true };
  assertEvidence(evidence);
  return evidence;
}

export async function persistSyntheticIsolationEvidence({
  evidence,
  directory,
}: {
  evidence: SyntheticIsolationEvidence;
  directory: string;
}): Promise<string> {
  assertEvidence(evidence);
  const root = resolve(directory);
  const file = resolve(root, EVIDENCE_FILE_NAME);
  if (dirname(file) !== root) {
    throw new SyntheticRunnerRefusal("synthetic isolation evidence path escapes its directory");
  }
  const serialized = JSON.stringify(evidence);
  const artifact = {
    schemaVersion: 1,
    integritySha256: sha256(serialized),
    evidence,
  };
  await mkdir(root, { recursive: true });
  try {
    await writeFile(file, `${JSON.stringify(artifact)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (isRecord(error) && error.code === "EEXIST") {
      throw new SyntheticRunnerRefusal("synthetic isolation evidence already exists");
    }
    throw error;
  }
  return file;
}

export async function readSyntheticIsolationEvidence(file: string): Promise<SyntheticIsolationEvidence> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new SyntheticRunnerRefusal("persisted synthetic isolation evidence is malformed");
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.evidence)) {
    throw new SyntheticRunnerRefusal("persisted synthetic isolation evidence is malformed");
  }
  if (typeof parsed.integritySha256 !== "string" || !SHA256.test(parsed.integritySha256)) {
    throw new SyntheticRunnerRefusal("persisted synthetic isolation evidence is malformed");
  }
  const evidence = parsed.evidence as SyntheticIsolationEvidence;
  if (parsed.integritySha256 !== sha256(JSON.stringify(evidence))) {
    throw new SyntheticRunnerRefusal("synthetic isolation evidence integrity check failed");
  }
  assertEvidence(evidence);
  return evidence;
}
