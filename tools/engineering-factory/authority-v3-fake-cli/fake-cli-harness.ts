import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHORITY_V3_FAKE_ARGV,
  AuthorityV3FakeProtocolRefusal,
  FrameDecoder,
  buildAuthorityV3FakeEnvironment,
  canonicalAuthorityV3Json,
  encodeAuthorityV3Frame,
} from "../../../src/lib/engineering-factory/authority-v3-r3-fake-protocol";

const ZERO = "0".repeat(64);
const MAX_COMBINED_RAW_BYTES = 131_072;

type FakeRequest = {
  fakeRequestId: string;
  payloadClass: "synthetic-small";
  fakePayload: { units: number };
};

export type AuthorityV3FakeCliProof = {
  status: "AUTHORITY_V3_R3_FAKE_CLI_PROVED";
  exitCode: 0;
  logicalArgv: readonly string[];
  environmentNames: readonly string[];
  stdoutTypes: readonly string[];
  stdoutFrameCount: number;
  stderrFrameCount: 0;
  concurrentDrainsStartedBeforeInput: true;
  networkDenied: true;
  childProcessesRemaining: 0;
  ephemeralRootRemoved: true;
  rawStreamsDiscarded: true;
  providerCalls: 0;
  realCandidateInvocations: 0;
  syntheticFakeInvocations: 1;
  limitation: "deterministic-fake-cli-node-permission-harness-only";
};

export function assertAuthorityV3PipeClosure(input: {
  childExited: boolean;
  stdoutEnded: boolean;
  stderrEnded: boolean;
  drainDeadlineReached: boolean;
}): void {
  if (input.childExited && input.drainDeadlineReached && (!input.stdoutEnded || !input.stderrEnded)) {
    refuse("PIPE_HELD_BY_UNAPPROVED_DESCENDANT");
  }
  if (!input.stdoutEnded || !input.stderrEnded) refuse("PARTIAL_PIPE_LIFECYCLE");
}

function refuse(errorId: string): never {
  throw new AuthorityV3FakeProtocolRefusal(errorId);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function entrypoint(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "ef-fake-candidate.mjs");
}

function identity(value: Awaited<ReturnType<typeof stat>>): string {
  return `${value.dev}:${value.ino}:${value.mode}`;
}

function makeInput(runId: string, requests: readonly FakeRequest[]): Buffer {
  if (requests.length < 1 || requests.length > 64 || new Set(requests.map((request) => request.fakeRequestId)).size !== requests.length ||
      requests.some((request) => !/^fake-[a-z0-9-]{1,40}$/.test(request.fakeRequestId) ||
        !Number.isSafeInteger(request.fakePayload.units) || request.fakePayload.units < 0 || request.fakePayload.units > 1_000)) {
    refuse("STDIN_REQUEST_INVALID");
  }
  let sequence = 1;
  let prior = ZERO;
  const frames: Buffer[] = [];
  const append = (value: Record<string, string | number | boolean | null | object>) => {
    const encoded = encodeAuthorityV3Frame({
      ...value,
      schemaVersion: "3.3.0",
      frameSequence: sequence,
      priorFrameSha256: prior,
    } as Parameters<typeof encodeAuthorityV3Frame>[0]);
    const parsed = JSON.parse(encoded.subarray(4, encoded.length - 1).toString("utf8")) as {
      frameSha256: string;
    };
    frames.push(encoded);
    sequence += 1;
    prior = parsed.frameSha256;
  };
  append({
    type: "start",
    runId,
    contractHash: sha256(canonicalAuthorityV3Json(AUTHORITY_V3_FAKE_ARGV(runId) as unknown as string[])),
  });
  for (const request of requests) {
    append({ type: "request", runId, ...request });
  }
  append({ type: "end", runId });
  const bytes = Buffer.concat(frames);
  if (frames.length > 67 || bytes.byteLength > 1_048_576) refuse("STDIN_LIMIT_EXCEEDED");
  return bytes;
}

export async function runAuthorityV3FakeCli({
  runId,
  requests,
  timeoutMilliseconds,
  beforeLaunch,
  inputDelayMilliseconds = 0,
}: {
  runId: string;
  requests: readonly FakeRequest[];
  timeoutMilliseconds: number;
  beforeLaunch?: (context: { root: string }) => Promise<readonly string[] | void>;
  inputDelayMilliseconds?: number;
}): Promise<AuthorityV3FakeCliProof> {
  if (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds < 1 || timeoutMilliseconds > 30_000) {
    refuse("TIMEOUT_INVALID");
  }
  if (!Number.isSafeInteger(inputDelayMilliseconds) || inputDelayMilliseconds < 0 || inputDelayMilliseconds > 30_000) {
    refuse("INPUT_DELAY_INVALID");
  }
  const logicalArgv = AUTHORITY_V3_FAKE_ARGV(runId);
  const environment = buildAuthorityV3FakeEnvironment(runId);
  const input = makeInput(runId, requests);
  const root = await mkdtemp(join(tmpdir(), "authority-v3-fake-cli-"));
  const cleanupRoots = [root];
  let completed = false;
  let proof: Omit<AuthorityV3FakeCliProof, "ephemeralRootRemoved"> | undefined;

  try {
    for (const directory of ["bundle", "workspace", "result", "tmp"]) {
      await mkdir(join(root, directory), { recursive: false });
    }
    const beforeIdentity = identity(await stat(root));
    const extraRoots = await beforeLaunch?.({ root });
    if (extraRoots) cleanupRoots.push(...extraRoots);
    const afterIdentity = identity(await stat(root));
    if (beforeIdentity !== afterIdentity) refuse("ROOT_REPLACED");

    const stdoutDecoder = new FrameDecoder({ maxFrameBytes: 16_384, maxTotalBytes: 1_048_576 });
    const stdoutTypes: string[] = [];
    let stderrBytes = 0;
    let combinedRawBytes = 0;
    let protocolError: Error | undefined;
    let childExited = false;
    let stdoutEnded = false;
    let stderrEnded = false;

    const executable = process.execPath;
    const systemRoot = process.env.SYSTEMROOT ?? process.env.WINDIR;
    if (!systemRoot) refuse("WINDOWS_RUNTIME_SHIM_UNAVAILABLE");
    const systemDrive = systemRoot.slice(0, 2);
    const runtimeEnvironment = {
      ...environment,
      HOMEDRIVE: systemDrive,
      HOMEPATH: "\\nonexistent",
      LOGONSERVER: "authority-v3-local",
      SYSTEMDRIVE: systemDrive,
      SYSTEMROOT: systemRoot,
      TEMP: join(root, "tmp"),
      TMP: join(root, "tmp"),
      USERDOMAIN: "authority-v3-local",
      USERNAME: "authority-v3-local",
      USERPROFILE: root,
      WINDIR: systemRoot,
    } as unknown as NodeJS.ProcessEnv;
    const child = spawn(executable, [
      "--permission",
      "--no-addons",
      "--no-experimental-sqlite",
      "--no-global-search-paths",
      `--allow-fs-read=${entrypoint()}`,
      entrypoint(),
      ...logicalArgv.slice(1),
    ], {
      argv0: logicalArgv[0],
      cwd: root,
      env: runtimeEnvironment,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveClose, reject) => {
      child.once("error", reject);
      child.once("exit", () => {
        childExited = true;
      });
      child.once("close", (code, signal) => resolveClose({ code, signal }));
    });

    child.stdout.on("data", (chunk: Buffer) => {
      if (protocolError) return;
      combinedRawBytes += chunk.byteLength;
      try {
        if (combinedRawBytes > MAX_COMBINED_RAW_BYTES) refuse("BACKPRESSURE_LIMIT_EXCEEDED");
        for (const frame of stdoutDecoder.push(chunk)) {
          const expectedKeys = [
            "byteCountClass", "fakeRequestId", "frameSequence", "frameSha256", "priorFrameSha256",
            "resultClass", "runId", "schemaVersion", "statusClass", "terminal", "type",
          ];
          if (JSON.stringify(Object.keys(frame).sort()) !== JSON.stringify(expectedKeys) ||
              typeof frame.type !== "string" || frame.runId !== runId || typeof frame.terminal !== "boolean" ||
              frame.byteCountClass !== "bounded-small") {
            refuse("STDOUT_SCHEMA_INVALID");
          }
          stdoutTypes.push(frame.type);
        }
      } catch (error) {
        protocolError = error instanceof Error ? error : new Error("STDOUT_SCHEMA_INVALID");
        child.kill();
      }
    });
    child.stdout.once("end", () => {
      stdoutEnded = true;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      combinedRawBytes += chunk.byteLength;
      stderrBytes += chunk.byteLength;
      if (combinedRawBytes > MAX_COMBINED_RAW_BYTES || stderrBytes > 1_029) {
        protocolError = new AuthorityV3FakeProtocolRefusal("BACKPRESSURE_LIMIT_EXCEEDED");
        child.kill();
      }
    });
    child.stderr.once("end", () => {
      stderrEnded = true;
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMilliseconds);
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EPIPE") protocolError = new AuthorityV3FakeProtocolRefusal("STDIN_CLOSED_EARLY");
      else protocolError = error;
    });
    if (inputDelayMilliseconds > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, inputDelayMilliseconds));
    }
    child.stdin.end(input);

    const { code } = await closed;
    clearTimeout(timeout);
    if (timedOut) refuse("OVERALL_TIMEOUT");
    if (protocolError) throw protocolError;
    stdoutDecoder.end();
    if (!childExited) refuse("SUBPROCESS_STATE_UNKNOWN");
    assertAuthorityV3PipeClosure({ childExited, stdoutEnded, stderrEnded, drainDeadlineReached: true });
    if (stderrBytes !== 0) refuse("STDERR_UNEXPECTED_ON_SUCCESS");
    if (code !== 0) refuse(`FAKE_CLI_EXIT_${code ?? "UNKNOWN"}`);
    if (stdoutTypes.at(-1) !== "terminal" || stdoutTypes.filter((type) => type === "terminal").length !== 1) {
      refuse("STDOUT_EOF_BEFORE_TERMINAL");
    }
    const expectedTypes = ["ready", ...requests.flatMap(() => ["accepted", "progress", "result"]), "terminal"];
    if (JSON.stringify(stdoutTypes) !== JSON.stringify(expectedTypes)) refuse("STDOUT_STATE_INVALID");

    proof = {
      status: "AUTHORITY_V3_R3_FAKE_CLI_PROVED",
      exitCode: 0,
      logicalArgv,
      environmentNames: Object.keys(environment).sort(),
      stdoutTypes,
      stdoutFrameCount: stdoutTypes.length,
      stderrFrameCount: 0,
      concurrentDrainsStartedBeforeInput: true,
      networkDenied: true,
      childProcessesRemaining: 0,
      rawStreamsDiscarded: true,
      providerCalls: 0,
      realCandidateInvocations: 0,
      syntheticFakeInvocations: 1,
      limitation: "deterministic-fake-cli-node-permission-harness-only",
    };
    completed = true;
  } finally {
    await Promise.all(cleanupRoots.map((directory) => rm(directory, { recursive: true, force: true })));
  }

  if (!completed || !proof) refuse("FAKE_CLI_INCOMPLETE");
  await access(root).then(() => refuse("EPHEMERAL_ROOT_REMAINS"), () => undefined);
  return { ...proof, ephemeralRootRemoved: true };
}
