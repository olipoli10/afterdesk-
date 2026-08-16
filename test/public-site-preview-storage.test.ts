/* Phase 1.4B.4 guards, DEFECT 1 - storage must have an explicit, testable
   mode: preview-disabled | r2 | local-dev. Written RED against 833c35b,
   where preview fell through to the forbidden local-disk backend and a
   partial R2 configuration silently degraded to disk. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["VERCEL_ENV", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
/* NODE_ENV is readonly in the Next types; the production test uses vi.stubEnv. */
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const load = () => import("../src/lib/storage");

describe("preview storage is explicitly disabled", () => {
  it("preview imports WITHOUT R2 and reports mode preview-disabled", async () => {
    process.env.VERCEL_ENV = "preview";
    const mod = await load();
    expect(mod.STORAGE_MODE).toBe("preview-disabled");
  });
  it("every storage operation fails by the named error in preview", async () => {
    process.env.VERCEL_ENV = "preview";
    const mod = await load();
    await expect(mod.putObject("k", Buffer.from("x"))).rejects.toThrow(/StoragePreviewDisabled/);
    await expect(mod.readObject("k")).rejects.toThrow(/StoragePreviewDisabled/);
    await expect(mod.objectExists("k")).rejects.toThrow(/StoragePreviewDisabled/);
    await expect(mod.deleteObject("k")).rejects.toThrow(/StoragePreviewDisabled/);
  });
  it("objectStream fails SYNCHRONOUSLY in preview, before any stream exists", async () => {
    process.env.VERCEL_ENV = "preview";
    const mod = await load();
    expect(() => mod.objectStream("k")).toThrow(/StoragePreviewDisabled/);
  });
  it("preview builds no S3 client even when all four R2 values are present", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.R2_ACCOUNT_ID = "a"; process.env.R2_ACCESS_KEY_ID = "b";
    process.env.R2_SECRET_ACCESS_KEY = "c"; process.env.R2_BUCKET = "d";
    const mod = await load();
    expect(mod.STORAGE_MODE).toBe("preview-disabled");
    expect(() => mod.objectStream("k")).toThrow(/StoragePreviewDisabled/);
  });
});

describe("partial R2 configuration always fails explicitly", () => {
  it("1-3 R2 values throw at import instead of degrading to disk or disabled", async () => {
    process.env.R2_ACCOUNT_ID = "a";
    await expect(load()).rejects.toThrow(/partial R2 configuration/i);
    vi.resetModules();
    process.env.R2_ACCESS_KEY_ID = "b";
    process.env.R2_SECRET_ACCESS_KEY = "c";
    await expect(load()).rejects.toThrow(/partial R2 configuration/i);
  });
});

describe("production and local-dev contracts are unchanged", () => {
  it("production without full R2 still fails at import with the existing message", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(load()).rejects.toThrow(/must all be set in\s+.?production/);
    vi.unstubAllEnvs();
  });
  it("local dev without R2 still uses the disk backend", async () => {
    const mod = await load();
    expect(mod.STORAGE_MODE).toBe("local-dev");
    /* objectStream on a missing key must NOT throw the preview error -
       it reaches the disk path (createReadStream is lazy) */
    expect(() => mod.objectStream("__no_such_key__")).not.toThrow(/StoragePreviewDisabled/);
  });
});
