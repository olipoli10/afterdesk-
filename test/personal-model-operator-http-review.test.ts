import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalModelOperatorHttpError, personalModelOperatorRequestContext, readPersonalModelOperatorCommand } from "../src/server/model-gateway/personal-intent/operator-http";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const command = { version: "personal-model-setup-command-v1", setupRef: "12345678-1234-4234-8234-123456789abc",
  apiKey: "synthetic_review_key_12345678901234567890" };
function request(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  return new Request("https://example.invalid/operator-setup", { method: "POST", headers: { "content-type": "application/json" },
    body: stream, signal, duplex: "half" } as RequestInit);
}

describe("peer: isolated operator HTTP reader (no auth/DB/transport)", () => {
  it("owns Buffer bytes before the next pull can mutate them; does not erase caller-owned bytes", async () => {
    const raw = Buffer.from(JSON.stringify(command)), split = raw.length - 2;
    const first = Buffer.from(raw.subarray(0, split)), second = Buffer.from(raw.subarray(split));
    let pulls = 0;
    const r = request(new ReadableStream<Uint8Array>({ pull(controller) {
      if (pulls++ === 0) controller.enqueue(first);
      else { first.fill(88); controller.enqueue(second); controller.close(); }
    } }, { highWaterMark: 0 }));
    const result = await readPersonalModelOperatorCommand(r, personalModelOperatorRequestContext(r));
    expect(result).toEqual(command); expect(Object.isFrozen(result)).toBe(true);
    expect(first.every(byte => byte === 88)).toBe(true); expect(second).toEqual(raw.subarray(split));
    expect(result).not.toHaveProperty("ownerVerified"); expect(result).not.toHaveProperty("executionAuthorized");
  });

  it.each(["ordinary", "forged-typed"])("redacts %s stream exceptions rather than reflecting a secret message", async kind => {
    const sentinel = "synthetic_stream_secret_must_not_escape";
    const error = kind === "ordinary" ? new Error(sentinel) : new PersonalModelOperatorHttpError("INVALID_BODY");
    error.message = sentinel;
    const r = request(new ReadableStream<Uint8Array>({ pull(controller) { controller.error(error); } }, { highWaterMark: 0 }));
    let caught: unknown;
    try { await readPersonalModelOperatorCommand(r, personalModelOperatorRequestContext(r)); } catch (value) { caught = value; }
    expect(caught).toBeInstanceOf(PersonalModelOperatorHttpError);
    expect((caught as Error).message).toBe("PERSONAL_MODEL_OPERATOR_INVALID_BODY");
    expect(String(caught)).not.toContain(sentinel);
  });

  it.each(["abort", "deadline"])("settles on original %s without awaiting hung cancel", async kind => {
    vi.useFakeTimers();
    const wall = vi.spyOn(Date, "now").mockReturnValue(100000);
    const mono = vi.spyOn(performance, "now").mockReturnValue(1000);
    const abort = new AbortController(), cancel = vi.fn(() => new Promise<void>(() => {}));
    const r = request(new ReadableStream<Uint8Array>({ pull() { return new Promise<void>(() => {}); }, cancel }, { highWaterMark: 0 }), abort.signal);
    const context = personalModelOperatorRequestContext(r);
    // Replacing a request property cannot replace the captured signal.
    Object.defineProperty(r, "signal", { value: new AbortController().signal });
    wall.mockReturnValue(114999); mono.mockReturnValue(15999);
    const result = readPersonalModelOperatorCommand(r, context).then(() => "UNEXPECTED_SUCCESS", error => (error as Error).message);
    if (kind === "abort") abort.abort();
    else { wall.mockReturnValue(115000); mono.mockReturnValue(16000); await vi.advanceTimersByTimeAsync(1); }
    expect(await result).toBe("PERSONAL_MODEL_OPERATOR_REQUEST_EXPIRED");
    expect(cancel).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
});
