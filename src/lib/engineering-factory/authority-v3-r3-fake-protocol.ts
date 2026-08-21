import { createHash } from "node:crypto";

const HASH = /^[0-9a-f]{64}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type JsonScalar = string | number | boolean | null;
export type AuthorityV3Json = JsonScalar | AuthorityV3Json[] | { [key: string]: AuthorityV3Json };
export type AuthorityV3Frame = Record<string, AuthorityV3Json> & {
  schemaVersion: "3.3.0";
  frameSequence: number;
  priorFrameSha256: string;
  frameSha256: string;
};

export class AuthorityV3FakeProtocolRefusal extends Error {
  constructor(errorId: string) {
    super(errorId);
    this.name = "AuthorityV3FakeProtocolRefusal";
  }
}

function refuse(errorId: string): never {
  throw new AuthorityV3FakeProtocolRefusal(errorId);
}

function assertJson(value: unknown): asserts value is AuthorityV3Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) refuse("JSON_NOT_IJSON_INT53");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertJson(item);
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof key !== "string" || item === undefined) refuse("JSON_NOT_IJSON_INT53");
      assertJson(item);
    }
    return;
  }
  refuse("JSON_NOT_IJSON_INT53");
}

export function canonicalAuthorityV3Json(value: AuthorityV3Json): string {
  assertJson(value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalAuthorityV3Json).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalAuthorityV3Json(value[key]!)}`
  ).join(",")}}`;
}

function sha256Frame(payload: Buffer): string {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(payload.byteLength, 0);
  return createHash("sha256").update(prefix).update(payload).update(Buffer.from([0x0a])).digest("hex");
}

function rejectDuplicateKeys(raw: string): void {
  if (raw.startsWith("\uFEFF")) refuse("BOM_FORBIDDEN");
  let offset = 0;
  const whitespace = () => {
    while (/\s/.test(raw[offset] ?? "")) offset += 1;
  };
  const parseString = (): string => {
    const start = offset;
    if (raw[offset] !== '"') refuse("JSON_INVALID");
    offset += 1;
    while (offset < raw.length) {
      const char = raw[offset++];
      if (char === '"') {
        try {
          return JSON.parse(raw.slice(start, offset)) as string;
        } catch {
          refuse("JSON_INVALID");
        }
      }
      if (char === "\\") {
        if (raw[offset] === "u") offset += 5;
        else offset += 1;
      } else if ((char?.charCodeAt(0) ?? 0) < 0x20) {
        refuse("JSON_INVALID");
      }
    }
    refuse("JSON_INVALID");
  };
  const parseLiteral = () => {
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(offset));
    if (!match) refuse("JSON_INVALID");
    offset += match[0].length;
  };
  const parseValue = (): void => {
    whitespace();
    if (raw[offset] === '"') {
      parseString();
      return;
    }
    if (raw[offset] === "[") {
      offset += 1;
      whitespace();
      if (raw[offset] === "]") {
        offset += 1;
        return;
      }
      while (true) {
        parseValue();
        whitespace();
        if (raw[offset] === "]") {
          offset += 1;
          return;
        }
        if (raw[offset++] !== ",") refuse("JSON_INVALID");
      }
    }
    if (raw[offset] === "{") {
      offset += 1;
      const keys = new Set<string>();
      whitespace();
      if (raw[offset] === "}") {
        offset += 1;
        return;
      }
      while (true) {
        whitespace();
        const key = parseString();
        if (keys.has(key)) refuse("DUPLICATE_JSON_KEY");
        keys.add(key);
        whitespace();
        if (raw[offset++] !== ":") refuse("JSON_INVALID");
        parseValue();
        whitespace();
        if (raw[offset] === "}") {
          offset += 1;
          return;
        }
        if (raw[offset++] !== ",") refuse("JSON_INVALID");
      }
    }
    parseLiteral();
  };
  parseValue();
  whitespace();
  if (offset !== raw.length) refuse("JSON_INVALID");
}

function decodeCanonicalJson(bytes: Buffer): Record<string, AuthorityV3Json> {
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    refuse("UTF8_INVALID");
  }
  rejectDuplicateKeys(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    refuse("JSON_INVALID");
  }
  assertJson(parsed);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) refuse("FRAME_OBJECT_REQUIRED");
  if (canonicalAuthorityV3Json(parsed) !== raw) refuse("JSON_NOT_CANONICAL");
  return parsed as Record<string, AuthorityV3Json>;
}

export function encodeAuthorityV3Frame(
  value: Record<string, AuthorityV3Json> & {
    schemaVersion: "3.3.0";
    frameSequence: number;
    priorFrameSha256: string;
  }
): Buffer {
  if ("frameSha256" in value || value.schemaVersion !== "3.3.0" ||
      !Number.isSafeInteger(value.frameSequence) || value.frameSequence < 1 ||
      !HASH.test(value.priorFrameSha256)) {
    refuse("FRAME_COMMON_FIELDS_INVALID");
  }
  const bodyWithoutHash = Buffer.from(canonicalAuthorityV3Json(value), "utf8");
  const frameSha256 = sha256Frame(bodyWithoutHash);
  const body = Buffer.from(canonicalAuthorityV3Json({ ...value, frameSha256 }), "utf8");
  const output = Buffer.alloc(body.byteLength + 5);
  output.writeUInt32BE(body.byteLength, 0);
  body.copy(output, 4);
  output[output.length - 1] = 0x0a;
  return output;
}

export class FrameDecoder {
  private buffered = Buffer.alloc(0);
  private totalBytes = 0;
  private nextSequence = 1;
  private priorHash = "0".repeat(64);

  constructor(private readonly limits: { maxFrameBytes: number; maxTotalBytes: number }) {}

  push(chunk: Buffer): AuthorityV3Frame[] {
    this.totalBytes += chunk.byteLength;
    if (this.totalBytes > this.limits.maxTotalBytes) refuse("OUTPUT_LIMIT_EXCEEDED");
    this.buffered = Buffer.concat([this.buffered, chunk]);
    const frames: AuthorityV3Frame[] = [];
    while (this.buffered.byteLength >= 4) {
      const length = this.buffered.readUInt32BE(0);
      if (length < 2 || length > this.limits.maxFrameBytes) refuse("FRAME_LENGTH_INVALID");
      const completeLength = length + 5;
      if (this.buffered.byteLength < completeLength) break;
      if (this.buffered[completeLength - 1] !== 0x0a) refuse("FRAME_LF_INVALID");
      const body = this.buffered.subarray(4, 4 + length);
      const parsed = decodeCanonicalJson(body);
      const frameHash = parsed.frameSha256;
      if (typeof frameHash !== "string" || !HASH.test(frameHash)) refuse("FRAME_HASH_INVALID");
      const withoutHash = { ...parsed };
      delete withoutHash.frameSha256;
      const expectedHash = sha256Frame(Buffer.from(canonicalAuthorityV3Json(withoutHash), "utf8"));
      if (frameHash !== expectedHash) refuse("FRAME_HASH_INVALID");
      if (parsed.schemaVersion !== "3.3.0" || parsed.frameSequence !== this.nextSequence ||
          parsed.priorFrameSha256 !== this.priorHash) {
        refuse("FRAME_CHAIN_INVALID");
      }
      frames.push(parsed as AuthorityV3Frame);
      this.nextSequence += 1;
      this.priorHash = frameHash;
      this.buffered = this.buffered.subarray(completeLength);
    }
    return frames;
  }

  end(): AuthorityV3Frame[] {
    if (this.buffered.byteLength !== 0) refuse("PARTIAL_FRAME_AT_EOF");
    return [];
  }
}

export const AUTHORITY_V3_FAKE_ARGV = (runId: string): readonly string[] => [
  "ef-fake-candidate",
  "compatibility-rehearsal",
  "--contract-version",
  "3.3.0",
  "--stdin-framing",
  "u32be-jcs-json-lf-v1",
  "--stdout-framing",
  "u32be-jcs-json-lf-v1",
  "--run-id",
  runId,
] as const;

export function validateAuthorityV3FakeArgv(argv: readonly string[]): { runId: string } {
  if (argv.length !== 10 || !UUID_V4.test(argv[9] ?? "") ||
      JSON.stringify(argv) !== JSON.stringify(AUTHORITY_V3_FAKE_ARGV(argv[9]!))) {
    refuse("ARGV_REFUSED");
  }
  return { runId: argv[9]! };
}

export function buildAuthorityV3FakeEnvironment(runId: string): Record<string, string> {
  if (!UUID_V4.test(runId)) refuse("RUN_ID_INVALID");
  return {
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
}

const TERMINAL_PRECEDENCE = ["violation", "cancel", "timeout", "exit", "frame"] as const;
export type AuthorityV3TerminalCause = (typeof TERMINAL_PRECEDENCE)[number];

export function chooseAuthorityV3TerminalCause(events: readonly AuthorityV3TerminalCause[]): AuthorityV3TerminalCause {
  for (const cause of TERMINAL_PRECEDENCE) if (events.includes(cause)) return cause;
  refuse("TERMINAL_CAUSE_MISSING");
}
