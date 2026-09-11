import { describe, expect, it, vi } from "vitest";

// Independently authored controller checks. Merely importing the pure inspector
// must not initialize the application database or consult a stored credential.
vi.mock("@/lib/db", () => { throw new Error("CONTROLLER_PURE_IMPORT_TOUCHED_DB"); });
import { inspectPersonalModelSetupManifest } from "../src/server/model-gateway/personal-intent/operator-setup";

describe("controller: operator setup rejects non-JSON input without disclosure", () => {
  it("does not execute enumerable accessors", () => {
    let reads = 0;
    const value = Object.defineProperty({}, "version", { enumerable: true, get() { reads++; return "secret-sentinel"; } });
    expect(() => inspectPersonalModelSetupManifest(value)).toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(reads).toBe(0);
  });

  it("does not invoke toJSON on supplied data", () => {
    let calls = 0;
    const value = { toJSON() { calls++; return {}; } };
    expect(() => inspectPersonalModelSetupManifest(value)).toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(calls).toBe(0);
  });

  it.each([
    null, undefined, 1n, Number.NaN, Number.POSITIVE_INFINITY,
    new Date(), new Map(), new Set(), { value: Symbol("synthetic") },
    { value: "x".repeat(32769) }, { value: new Array(257).fill(0) },
    JSON.parse('{"__proto__":{"polluted":true}}'),
  ])("refuses unsupported data with one fixed error", value => {
    let error: unknown;
    try { inspectPersonalModelSetupManifest(value); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("PERSONAL_MODEL_SETUP_REFUSED");
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("refuses cycles at the structural limit rather than recursing without bound", () => {
    const value: { child?: unknown } = {};
    value.child = value;
    expect(() => inspectPersonalModelSetupManifest(value)).toThrow("PERSONAL_MODEL_SETUP_REFUSED");
  });

  it("does not expose a caller-supplied secret sentinel through errors", () => {
    const sentinel = "synthetic-controller-key-never-valid";
    let result = "";
    try { inspectPersonalModelSetupManifest({ apiKey: sentinel }); }
    catch (error) { result = String(error); }
    expect(result).toBe("Error: PERSONAL_MODEL_SETUP_REFUSED");
    expect(result.includes(sentinel)).toBe(false);
  });
});
