/* Phase 1.4B.4 guards, hardened in 1.4B.4.1 - storage must have an
   explicit, testable mode (preview-disabled | r2 | local-dev), and the
   preview claims are now PROVEN by instrumentation, not asserted:
   the S3Client constructor and every filesystem primitive the module can
   reach are spied, so "no client, no disk, no network" is a counted fact.
   The partial-R2 matrix covers exactly 1, exactly 2 and exactly 3 values
   in isolated cases. Test-only file: src/lib/storage.ts is untouched. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

/* ---- instrumentation: spy the S3 SDK and both fs modules ------------- */
const s3Constructed = vi.fn();
const s3Sent = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(...args: unknown[]) { s3Constructed(...args); }
    send(...args: unknown[]) { s3Sent(...args); return Promise.resolve({}); }
  },
  PutObjectCommand: class {},
  GetObjectCommand: class {},
  HeadObjectCommand: class {},
  DeleteObjectCommand: class {},
}));

const fsCalls = {
  /* a REAL but inert Readable: type-compatible with Readable.toWeb, opens
     no file, emits nothing after the test */
  createReadStream: vi.fn(() => Readable.from([])),
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async () => Buffer.from("")),
  stat: vi.fn(async () => ({})),
  unlink: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
};
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real, createReadStream: fsCalls.createReadStream };
});
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    mkdir: fsCalls.mkdir, readFile: fsCalls.readFile, stat: fsCalls.stat,
    unlink: fsCalls.unlink, writeFile: fsCalls.writeFile,
  };
});

const FS_SPIES = Object.entries(fsCalls) as [string, ReturnType<typeof vi.fn>][];
function expectZeroSideEffects(context: string) {
  expect(s3Constructed, `${context}: S3Client constructed`).not.toHaveBeenCalled();
  expect(s3Sent, `${context}: S3 network send`).not.toHaveBeenCalled();
  for (const [name, spy] of FS_SPIES) expect(spy, `${context}: fs.${name}`).not.toHaveBeenCalled();
}

/* ---- clean environment per case -------------------------------------- */
const ENV_KEYS = ["VERCEL_ENV", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
/* NODE_ENV is readonly in the Next types; the production case uses vi.stubEnv. */
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  /* runs even when an assertion threw: stubs, env and mocks always reset */
  vi.unstubAllEnvs();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.clearAllMocks();
});

const load = () => import("../src/lib/storage");

describe("preview storage is explicitly disabled", () => {
  it("preview imports WITHOUT R2 and reports mode preview-disabled", async () => {
    process.env.VERCEL_ENV = "preview";
    const mod = await load();
    expect(mod.STORAGE_MODE).toBe("preview-disabled");
    expectZeroSideEffects("preview import, no creds");
  });
  it("every storage operation fails by the named error in preview", async () => {
    process.env.VERCEL_ENV = "preview";
    const mod = await load();
    await expect(mod.putObject("k", Buffer.from("x"))).rejects.toThrow(/StoragePreviewDisabled/);
    await expect(mod.readObject("k")).rejects.toThrow(/StoragePreviewDisabled/);
    await expect(mod.objectExists("k")).rejects.toThrow(/StoragePreviewDisabled/);
    await expect(mod.deleteObject("k")).rejects.toThrow(/StoragePreviewDisabled/);
    expectZeroSideEffects("preview operations");
  });
  it("objectStream fails SYNCHRONOUSLY in preview, before any stream exists", async () => {
    process.env.VERCEL_ENV = "preview";
    const mod = await load();
    expect(() => mod.objectStream("k")).toThrow(/StoragePreviewDisabled/);
    expect(fsCalls.createReadStream).not.toHaveBeenCalled();
  });
  it("zero S3 construction in Preview - even with four accidental R2 values", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.R2_ACCOUNT_ID = "a"; process.env.R2_ACCESS_KEY_ID = "b";
    process.env.R2_SECRET_ACCESS_KEY = "c"; process.env.R2_BUCKET = "d";
    const mod = await load();
    expect(mod.STORAGE_MODE).toBe("preview-disabled");
    expect(() => mod.objectStream("k")).toThrow(/StoragePreviewDisabled/);
    expect(s3Constructed, "S3Client must never be constructed in preview").not.toHaveBeenCalled();
    expect(s3Sent).not.toHaveBeenCalled();
  });
  it("zero filesystem activity in Preview across all five operations", async () => {
    process.env.VERCEL_ENV = "preview";
    const mod = await load();
    for (const op of [
      () => mod.putObject("k", Buffer.from("x")),
      () => mod.readObject("k"),
      () => mod.objectExists("k"),
      () => mod.deleteObject("k"),
    ]) await expect(op()).rejects.toThrow();
    expect(() => mod.objectStream("k")).toThrow();
    for (const [name, spy] of FS_SPIES) expect(spy, `fs.${name} touched in preview`).not.toHaveBeenCalled();
  });
});

describe("partial R2 configuration always fails explicitly", () => {
  it("exactly 1 partial R2 value fails closed at import, touching nothing", async () => {
    process.env.R2_ACCOUNT_ID = "a";
    await expect(load()).rejects.toThrow(/partial R2 configuration/i);
    expectZeroSideEffects("partial=1");
  });
  it("exactly 2 partial R2 values fail closed at import, touching nothing", async () => {
    process.env.R2_ACCOUNT_ID = "a";
    process.env.R2_ACCESS_KEY_ID = "b";
    await expect(load()).rejects.toThrow(/partial R2 configuration/i);
    expectZeroSideEffects("partial=2");
  });
  it("exactly 3 partial R2 values fail closed at import, touching nothing", async () => {
    process.env.R2_ACCOUNT_ID = "a";
    process.env.R2_ACCESS_KEY_ID = "b";
    process.env.R2_SECRET_ACCESS_KEY = "c";
    await expect(load()).rejects.toThrow(/partial R2 configuration/i);
    expectZeroSideEffects("partial=3");
  });
});

describe("production and local-dev contracts are unchanged", () => {
  it("production without full R2 still fails at import with the existing message", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(load()).rejects.toThrow(/must all be set in\s+.?production/);
    expectZeroSideEffects("production without R2");
  });
  it("local dev without R2 still uses the disk backend (spied, no real file opened)", async () => {
    const mod = await load();
    expect(mod.STORAGE_MODE).toBe("local-dev");
    /* the spied createReadStream returns an inert stub, so no async error
       can escape the test; the DISK PATH being taken is the counted fact */
    mod.objectStream("some-key");
    expect(fsCalls.createReadStream).toHaveBeenCalledTimes(1);
  });
  it("full R2 outside preview constructs exactly one client (spied, no network)", async () => {
    process.env.R2_ACCOUNT_ID = "a"; process.env.R2_ACCESS_KEY_ID = "b";
    process.env.R2_SECRET_ACCESS_KEY = "c"; process.env.R2_BUCKET = "d";
    const mod = await load();
    expect(mod.STORAGE_MODE).toBe("r2");
    expect(s3Constructed).toHaveBeenCalledTimes(1);
    expect(s3Sent).not.toHaveBeenCalled();
  });
});
