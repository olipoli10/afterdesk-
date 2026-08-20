import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

const [bundleDirectory, evidenceFile, parentCanaryFile, outsideWriteFile] = process.argv.slice(2);

if (!bundleDirectory || !evidenceFile || !parentCanaryFile || !outsideWriteFile) {
  process.exitCode = 64;
  throw new Error("synthetic candidate arguments are incomplete");
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const input = Buffer.concat(chunks).toString("utf8");

function denied(error, permission) {
  const candidates = [error, error?.cause, error?.errno, error?.cause?.errno];
  return candidates.some(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      candidate.code === "ERR_ACCESS_DENIED" &&
      (permission === undefined || candidate.permission === permission)
  );
}

async function readIsDenied() {
  try {
    await readFile(parentCanaryFile, "utf8");
    return false;
  } catch (error) {
    return denied(error, "FileSystemRead");
  }
}

async function writeIsDenied() {
  try {
    await writeFile(outsideWriteFile, "escape", "utf8");
    return false;
  } catch (error) {
    return denied(error, "FileSystemWrite");
  }
}

async function alternateFilesystemReadIsDenied() {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(parentCanaryFile, { readOnly: true });
    try {
      database.exec("PRAGMA schema_version");
    } finally {
      database.close();
    }
    return false;
  } catch (error) {
    return error?.code === "ERR_UNKNOWN_BUILTIN_MODULE" || denied(error, "FileSystemRead");
  }
}

async function networkIsDenied() {
  try {
    await fetch("http://127.0.0.1:43127/synthetic-network-probe");
    return false;
  } catch (error) {
    return denied(error, "Net");
  }
}

function childProcessIsDenied() {
  try {
    spawnSync(process.execPath, ["--version"], { encoding: "utf8" });
    return false;
  } catch (error) {
    return denied(error, "ChildProcess");
  }
}

function workerIsDenied() {
  try {
    const worker = new Worker("", { eval: true });
    void worker.terminate();
    return false;
  } catch (error) {
    return denied(error, "WorkerThreads");
  }
}

const fixture = await readFile(join(bundleDirectory, "fixture.txt"), "utf8");
const inputDigest = createHash("sha256").update(input, "utf8").digest("hex");
const syntheticProviderDigest = createHash("sha256")
  .update(`local-deterministic-fake\u0000${input}\u0000${fixture}`, "utf8")
  .digest("hex");

const result = {
  schemaVersion: 1,
  participant: process.env.EF_SYNTHETIC_PARTICIPANT,
  protocol: process.env.EF_SYNTHETIC_PROTOCOL,
  environmentNames: Object.keys(process.env).sort(),
  inputDigest,
  syntheticProviderDigest,
  controls: {
    parentReadDenied: await readIsDenied(),
    alternateFilesystemReadDenied: await alternateFilesystemReadIsDenied(),
    outsideWriteDenied: await writeIsDenied(),
    networkDenied: await networkIsDenied(),
    childProcessDenied: childProcessIsDenied(),
    workerDenied: workerIsDenied(),
  },
};

await writeFile(evidenceFile, `${JSON.stringify(result)}\n`, { encoding: "utf8", flag: "wx" });

// The supervisor deliberately captures and destroys this raw stream. Keeping a
// canary here proves that durable evidence is not a transcript by accident.
process.stdout.write(`RAW_SYNTHETIC_STREAM:${input}\n`);
