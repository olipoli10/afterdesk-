import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  NativeIsolationControlRefusal,
  assessNativeIsolationControlEvidence,
  buildNativeSyntheticContainerInvocation,
  type NativeIsolationControlEvidence,
  type NativeIsolationControlObservation,
} from "../../../src/lib/engineering-factory/native-isolation-control";

const IMAGE_REFERENCE =
  "docker.io/library/alpine@sha256:f27cad9117495d32d067133afff942cb2dc745dfe9163e949f6bfe8a6a245339";
const BUNDLE_ROOT = "/home/efrunner/.local/share/endvera-native-isolation";
const EVIDENCE_FILE_NAME = "native-isolation-evidence-v1.json";
const SHA256 = /^[0-9a-f]{64}$/;

type CommandResult = { stdout: string; stderr: string; stdoutBytes: number; stderrBytes: number };

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function windowsWslEnvironment(): NodeJS.ProcessEnv {
  const keys = ["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA"];
  return {
    NODE_ENV: "production",
    ...Object.fromEntries(keys.flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : []))),
  };
}

async function runBoundedCommand({
  executable,
  args,
  stdin = "",
  timeoutMs = 10_000,
  rawLimitBytes = 64 * 1024,
}: {
  executable: string;
  args: readonly string[];
  stdin?: string;
  timeoutMs?: number;
  rawLimitBytes?: number;
}): Promise<CommandResult> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(executable, [...args], {
      env: windowsWslEnvironment(),
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let overflow = false;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new NativeIsolationControlRefusal("native synthetic control exceeded its wall-clock limit"));
    }, timeoutMs);
    const collect = (target: Buffer[], stream: "stdout" | "stderr", chunk: Buffer) => {
      if (stream === "stdout") stdoutBytes += chunk.byteLength;
      else stderrBytes += chunk.byteLength;
      if (stdoutBytes + stderrBytes > rawLimitBytes) {
        overflow = true;
        child.kill();
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, "stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, "stderr", chunk));
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (overflow) {
        reject(new NativeIsolationControlRefusal("native synthetic control exceeded its raw-stream limit"));
        return;
      }
      const output = Buffer.concat(stdout).toString("utf8");
      const errors = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new NativeIsolationControlRefusal(`native synthetic control command failed closed (${code}): ${errors.trim()}`));
        return;
      }
      resolveCommand({ stdout: output, stderr: errors, stdoutBytes, stderrBytes });
    });
    child.stdin.end(stdin, "utf8");
  });
}

function parseKeyValueOutput(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.trim().split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) throw new NativeIsolationControlRefusal("native control output is malformed");
    const key = line.slice(0, separator);
    if (values[key] !== undefined) throw new NativeIsolationControlRefusal("native control output repeats a key");
    values[key] = line.slice(separator + 1);
  }
  return values;
}

function required(values: Record<string, string>, key: string): string {
  const value = values[key];
  if (value === undefined || value === "") {
    throw new NativeIsolationControlRefusal(`native control output is missing ${key}`);
  }
  return value;
}

function integer(values: Record<string, string>, key: string): number {
  const parsed = Number(required(values, key));
  if (!Number.isSafeInteger(parsed)) throw new NativeIsolationControlRefusal(`native control ${key} is malformed`);
  return parsed;
}

async function wslText(args: readonly string[]): Promise<string> {
  return (await runBoundedCommand({ executable: "wsl.exe", args })).stdout.trim();
}

async function stageBundle(bundlePath: string, source: string): Promise<void> {
  const scriptPath = `${bundlePath}/synthetic-control.sh`;
  await runBoundedCommand({
    executable: "wsl.exe",
    args: [
      "-d",
      "Debian",
      "--exec",
      "sh",
      "-c",
      "umask 077; mkdir -p -- \"$1\"; chmod 0711 /home/efrunner/.local/share/endvera-native-isolation \"${1%/bundle}\"; chmod 0755 \"$1\"; cat > \"$2\"; chmod 0555 \"$2\"",
      "sh",
      bundlePath,
      scriptPath,
    ],
    stdin: source,
  });
}

async function removeWorkspace(runRoot: string): Promise<void> {
  if (!runRoot.startsWith(`${BUNDLE_ROOT}/run-`) || runRoot.includes("..")) {
    throw new NativeIsolationControlRefusal("native cleanup target escaped its disposable root");
  }
  await runBoundedCommand({
    executable: "wsl.exe",
    args: ["-d", "Debian", "--exec", "rm", "-rf", "--", runRoot],
  });
  const status = await runBoundedCommand({
    executable: "wsl.exe",
    args: ["-d", "Debian", "--exec", "sh", "-c", "test ! -e \"$1\"", "sh", runRoot],
  });
  if (status.stdout || status.stderr) throw new NativeIsolationControlRefusal("native cleanup verification was noisy");
}

export async function runNativeIsolationSyntheticTrial({
  input,
}: {
  input: string;
}): Promise<NativeIsolationControlEvidence> {
  if (!input || Buffer.byteLength(input, "utf8") > 16 * 1024) {
    throw new NativeIsolationControlRefusal("native synthetic input must be non-empty and at most 16 KiB");
  }
  const runRoot = `${BUNDLE_ROOT}/run-${randomUUID()}`;
  const bundlePath = `${runRoot}/bundle`;
  const sourcePath = resolve(
    process.cwd(),
    "tools",
    "engineering-factory",
    "native-runner",
    "synthetic-control.sh"
  );
  const source = await readFile(sourcePath, "utf8");
  let ephemeralWorkspaceRemoved = false;
  let rawStdoutBytes = 0;
  let rawStderrBytes = 0;
  let parsed: Record<string, string> | undefined;

  try {
    await stageBundle(bundlePath, source);
    const invocation = buildNativeSyntheticContainerInvocation({
      participant: "Synthetic",
      imageReference: IMAGE_REFERENCE,
      bundlePath,
    });
    const result = await runBoundedCommand({
      executable: invocation.executable,
      args: invocation.args,
      stdin: input,
      timeoutMs: invocation.wallClockLimitMs,
      rawLimitBytes: invocation.rawStreamLimitBytes,
    });
    rawStdoutBytes = result.stdoutBytes;
    rawStderrBytes = result.stderrBytes;
    parsed = parseKeyValueOutput(result.stdout);
  } finally {
    await removeWorkspace(runRoot);
    ephemeralWorkspaceRemoved = true;
  }

  if (!parsed) throw new NativeIsolationControlRefusal("native synthetic control did not return evidence");
  const cpu = required(parsed, "CPU_MAX").split(" ");
  if (cpu.length !== 2) throw new NativeIsolationControlRefusal("native CPU evidence is malformed");
  const osRelease = await wslText(["-d", "Debian", "--exec", "sh", "-c", ". /etc/os-release; printf '%s' \"$PRETTY_NAME\""]);
  const runtimeVersion = await wslText(["-d", "Debian", "--exec", "podman", "version", "--format", "{{.Client.Version}}"]).catch(() =>
    wslText(["-d", "Debian", "--exec", "podman", "version", "--format", "{{.Version}}"])
  );
  const rootless = await wslText(["-d", "Debian", "--exec", "podman", "info", "--format", "{{.Host.Security.Rootless}}"]);
  const wslControls = parseKeyValueOutput(
    await wslText([
      "-d",
      "Debian",
      "--exec",
      "sh",
      "-c",
      "printf 'AUTOMOUNT=%s\\nINTEROP=%s\\nWINPATH=%s\\nSOCKET=%s\\n' \"$(awk -F= '/^enabled=/{print $2; exit}' /etc/wsl.conf)\" \"$(awk -F= '/^enabled=/{n++; if(n==2){print $2; exit}}' /etc/wsl.conf)\" \"$(printf '%s' \"$PATH\" | grep -q /mnt/c/ && echo exposed || echo absent)\" \"$(test -S /run/user/1000/podman/podman.sock && echo present || echo absent)\"",
    ])
  );

  const observation: NativeIsolationControlObservation = {
    schemaVersion: 1,
    backend: "wsl2-rootless-podman",
    distribution: osRelease,
    runtimeVersion,
    imageReference: IMAGE_REFERENCE,
    rootless: rootless === "true",
    wslAutomountDisabled: required(wslControls, "AUTOMOUNT") === "false",
    windowsInteropDisabled: required(wslControls, "INTEROP") === "false",
    windowsPathAbsent: required(wslControls, "WINPATH") === "absent",
    runtimeSocketAbsent: required(wslControls, "SOCKET") === "absent" && required(parsed, "SOCKET_ABSENT") === "true",
    bundlePath,
    bundleHasNoGitMetadata: required(parsed, "BUNDLE_NO_GIT") === "true",
    bundleReadOnly: required(parsed, "BUNDLE_READ_ONLY") === "true",
    rootFilesystemReadOnly: required(parsed, "ROOT_READ_ONLY") === "true",
    tmpfsWritable: required(parsed, "TMPFS_WRITABLE") === "true",
    tmpfsNoExec: required(parsed, "TMPFS_NOEXEC") === "true",
    runningUid: integer(parsed, "RUNNING_UID"),
    effectiveCapabilitiesHex: required(parsed, "CAP_EFF"),
    noNewPrivileges: required(parsed, "NO_NEW_PRIVS") === "1",
    seccompMode: integer(parsed, "SECCOMP"),
    networkInterfaces: required(parsed, "NETWORK_INTERFACES").split(","),
    memoryLimitBytes: integer(parsed, "MEMORY_LIMIT"),
    pidsLimit: integer(parsed, "PIDS_LIMIT"),
    cpuQuotaMicros: Number(cpu[0]),
    cpuPeriodMicros: Number(cpu[1]),
    environmentNames: required(parsed, "ENVIRONMENT_NAMES").split(","),
    inputTransport: "stdin",
    inputDigest: required(parsed, "INPUT_DIGEST"),
    rawStdoutBytes,
    rawStderrBytes,
    rawStreamsDiscarded: true,
    ephemeralWorkspaceRemoved,
    wallClockLimitMs: 10_000,
    realCandidateInvocations: 0,
    syntheticCandidateInvocations: 1,
    providerCalls: 0,
  };
  if (observation.inputDigest !== sha256(input)) {
    throw new NativeIsolationControlRefusal("native container did not receive the stdin input");
  }
  return assessNativeIsolationControlEvidence(observation);
}

export async function persistNativeIsolationEvidence({
  evidence,
  directory,
}: {
  evidence: NativeIsolationControlEvidence;
  directory: string;
}): Promise<string> {
  assessNativeIsolationControlEvidence(evidence);
  const root = resolve(directory);
  const file = resolve(root, EVIDENCE_FILE_NAME);
  if (dirname(file) !== root) throw new NativeIsolationControlRefusal("native evidence path escapes its directory");
  const serialized = JSON.stringify(evidence);
  await mkdir(root, { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify({ schemaVersion: 1, integritySha256: sha256(serialized), evidence })}\n`,
    { encoding: "utf8", flag: "wx" }
  );
  return file;
}

export async function readNativeIsolationEvidence(file: string): Promise<NativeIsolationControlEvidence> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new NativeIsolationControlRefusal("persisted native isolation evidence is malformed");
  }
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.integritySha256 !== "string" ||
    !SHA256.test(parsed.integritySha256) ||
    !isRecord(parsed.evidence)
  ) {
    throw new NativeIsolationControlRefusal("persisted native isolation evidence is malformed");
  }
  const evidence = parsed.evidence as NativeIsolationControlEvidence;
  if (parsed.integritySha256 !== sha256(JSON.stringify(evidence))) {
    throw new NativeIsolationControlRefusal("persisted native isolation evidence integrity check failed");
  }
  return assessNativeIsolationControlEvidence(evidence);
}
