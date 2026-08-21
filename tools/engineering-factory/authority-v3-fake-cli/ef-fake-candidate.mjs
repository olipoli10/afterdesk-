import { createHash } from "node:crypto";

const ZERO = "0".repeat(64);
const HASH = /^[0-9a-f]{64}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function canonical(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("JSON_NOT_IJSON_INT53");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function frameHash(body) {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(body.byteLength, 0);
  return createHash("sha256").update(prefix).update(body).update(Buffer.from([0x0a])).digest("hex");
}

function encode(value) {
  const bodyWithoutHash = Buffer.from(canonical(value), "utf8");
  const body = Buffer.from(canonical({ ...value, frameSha256: frameHash(bodyWithoutHash) }), "utf8");
  const output = Buffer.alloc(body.byteLength + 5);
  output.writeUInt32BE(body.byteLength, 0);
  body.copy(output, 4);
  output[output.length - 1] = 0x0a;
  return output;
}

function parseFrames(bytes) {
  const frames = [];
  let offset = 0;
  let sequence = 1;
  let prior = ZERO;
  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 4) throw new Error("PARTIAL_FRAME_AT_EOF");
    const length = bytes.readUInt32BE(offset);
    if (length < 2 || length > 65_536 || offset + length + 5 > bytes.byteLength) throw new Error("PARTIAL_FRAME_AT_EOF");
    if (bytes[offset + length + 4] !== 0x0a) throw new Error("FRAME_LF_INVALID");
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset + 4, offset + 4 + length));
    const duplicate = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:[\s\S]*"\1"\s*:/.test(raw);
    if (duplicate) throw new Error("DUPLICATE_JSON_KEY");
    const parsed = JSON.parse(raw);
    if (canonical(parsed) !== raw || parsed.schemaVersion !== "3.3.0" ||
        parsed.frameSequence !== sequence || parsed.priorFrameSha256 !== prior ||
        typeof parsed.frameSha256 !== "string" || !HASH.test(parsed.frameSha256)) {
      throw new Error("FRAME_INVALID");
    }
    const withoutHash = { ...parsed };
    delete withoutHash.frameSha256;
    if (frameHash(Buffer.from(canonical(withoutHash), "utf8")) !== parsed.frameSha256) throw new Error("FRAME_HASH_INVALID");
    frames.push(parsed);
    sequence += 1;
    prior = parsed.frameSha256;
    offset += length + 5;
  }
  return frames;
}

const args = [process.argv0, ...process.argv.slice(2)];
const expected = [
  "ef-fake-candidate", "compatibility-rehearsal", "--contract-version", "3.3.0",
  "--stdin-framing", "u32be-jcs-json-lf-v1", "--stdout-framing", "u32be-jcs-json-lf-v1",
  "--run-id", args[9],
];

if (args.length !== 10 || !UUID_V4.test(args[9] ?? "") || JSON.stringify(args) !== JSON.stringify(expected)) {
  process.exit(20);
}

const runId = args[9];
const expectedEnvironment = {
  EF_AUTHORITY_SCHEMA_VERSION: "3.3.0",
  EF_COMPATIBILITY_CONTRACT_VERSION: "3.3.0",
  EF_FAKE_RELAY_HOST: "198.18.0.2",
  EF_FAKE_RELAY_PORT: "47001",
  EF_RUN_ID: runId,
  HOME: "/nonexistent",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  PATH: "/ef/bin",
  TMPDIR: "/ef/tmp",
};

// Windows injects a fixed set of runtime bootstrap variables even when
// CreateProcess receives an otherwise empty environment block. The supervisor
// supplies synthetic values for those names; the pinned runtime shim removes
// them before the fake candidate validates or observes its logical contract.
for (const name of [
  "HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "SYSTEMDRIVE", "SYSTEMROOT",
  "TEMP", "TMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR",
]) delete process.env[name];

if (canonical(process.env) !== canonical(expectedEnvironment)) process.exit(22);

let networkDenied = false;
try {
  await fetch("http://127.0.0.1:43127/authority-v3-network-probe");
} catch (error) {
  networkDenied = error?.cause?.code === "ERR_ACCESS_DENIED" || error?.code === "ERR_ACCESS_DENIED";
}
if (!networkDenied) process.exit(22);

const chunks = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));

let inputFrames;
try {
  inputFrames = parseFrames(Buffer.concat(chunks));
} catch {
  process.exit(21);
}

if (inputFrames.length < 2 || inputFrames[0]?.type !== "start" || inputFrames.at(-1)?.type !== "end" ||
    inputFrames[0]?.runId !== runId || inputFrames.some((frame) => frame.runId !== runId)) {
  process.exit(21);
}

const requests = inputFrames.slice(1, -1);
const exactKeys = (value, keys) => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
if (!exactKeys(inputFrames[0], [
  "contractHash", "frameSequence", "frameSha256", "priorFrameSha256", "runId", "schemaVersion", "type",
]) || !exactKeys(inputFrames.at(-1), [
  "frameSequence", "frameSha256", "priorFrameSha256", "runId", "schemaVersion", "type",
]) || requests.length < 1 || requests.length > 64 || new Set(requests.map((frame) => frame.fakeRequestId)).size !== requests.length ||
    requests.some((frame) => frame.type !== "request" || !exactKeys(frame, [
      "fakePayload", "fakeRequestId", "frameSequence", "frameSha256", "payloadClass",
      "priorFrameSha256", "runId", "schemaVersion", "type",
    ]) || frame.payloadClass !== "synthetic-small" || typeof frame.fakeRequestId !== "string" ||
      !/^fake-[a-z0-9-]{1,40}$/.test(frame.fakeRequestId) || !exactKeys(frame.fakePayload, ["units"]) ||
      !Number.isSafeInteger(frame.fakePayload.units) || frame.fakePayload.units < 0 || frame.fakePayload.units > 1_000)) {
  process.exit(21);
}

let outputSequence = 1;
let outputPrior = ZERO;
function emit(type, fakeRequestId, statusClass, resultClass, terminal, extra = {}) {
  const frame = {
    schemaVersion: "3.3.0",
    type,
    frameSequence: outputSequence,
    priorFrameSha256: outputPrior,
    runId,
    fakeRequestId,
    statusClass,
    resultClass,
    byteCountClass: "bounded-small",
    terminal,
    ...extra,
  };
  const bytes = encode(frame);
  const parsed = JSON.parse(bytes.subarray(4, bytes.length - 1).toString("utf8"));
  outputSequence += 1;
  outputPrior = parsed.frameSha256;
  process.stdout.write(bytes);
}

emit("ready", null, "ready", null, false);
for (const request of requests) {
  const requestId = request.fakeRequestId;
  emit("accepted", requestId, "accepted", null, false);
  emit("progress", requestId, "working", null, false);
  emit("result", requestId, "complete", "synthetic-result", false);
}
emit("terminal", null, "success", "all-complete", true);
