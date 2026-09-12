import { afterEach, describe, expect, it, vi } from "vitest";
import { personalModelOperatorRequestContext, readPersonalModelOperatorCommand } from "../src/server/model-gateway/personal-intent/operator-http";

afterEach(() => vi.restoreAllMocks());
const payload = { version: "personal-model-setup-command-v1", setupRef: "12345678-1234-4234-8234-123456789abc",
  apiKey: "synthetic_http_key_never_real_123456" };
const url = "https://endvera-core-sandbox-afterdesk.vercel.app/api/endvera/v1/personal/model/operator-setup";
function request(body = JSON.stringify(payload), headers: Record<string, string> = { "content-type": "application/json" }) {
  return new Request(url, { method: "POST", body, headers });
}
function streamed(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  return new Request(url, { method: "POST", body: stream, signal, headers: { "content-type": "application/json" }, duplex: "half" } as RequestInit);
}
const read = (r: Request) => readPersonalModelOperatorCommand(r, personalModelOperatorRequestContext(r));

describe("operator installation JSON body, no session or installation authority", () => {
  it("accepts the exact closed command as immutable data only", async () => {
    const result = await read(request());
    expect(result).toEqual(payload); expect(Object.isFrozen(result)).toBe(true);
    expect(result).not.toHaveProperty("executionAuthorized");
  });
  it("accepts explicit UTF-8 media type", async () => {
    expect(await read(request(JSON.stringify(payload), { "content-type": "Application/JSON; charset=UTF-8" }))).toEqual(payload);
  });
  it("accepts the explicit idempotent credential rotation command", async () => {
    const rotation = { ...payload, version: "personal-model-credential-rotation-v1",
      commandId: "22345678-1234-4234-8234-123456789abc" };
    expect(await read(request(JSON.stringify(rotation)))).toEqual(rotation);
  });
  it.each(["text/plain", "application/x-www-form-urlencoded", "application/json; charset=utf-16", ""])("refuses media type %s", async type => {
    await expect(read(request("{}", { "content-type": type }))).rejects.toThrow("UNSUPPORTED_MEDIA_TYPE");
  });
  it.each(["-1", "NaN", "Infinity", "1,2", "1e3"])("rejects malformed length %s", async length => {
    await expect(read(request("{}", { "content-type": "application/json", "content-length": length }))).rejects.toThrow("INVALID_BODY");
  });
  it("refuses excessive declared length before reading", async () => {
    await expect(read(request("{}", { "content-type": "application/json", "content-length": "4097" }))).rejects.toThrow("BODY_TOO_LARGE");
  });
  it("enforces actual size even with no Content-Length", async () => {
    await expect(read(request(" ".repeat(4097)))).rejects.toThrow("BODY_TOO_LARGE");
  });
  it.each([
    { ...payload, ownerUserId: "foreign" }, { ...payload, retry: true }, { ...payload, setupRef: "unknown" },
    { ...payload, apiKey: "short" }, { ...payload, apiKey: "x".repeat(513) }, { ...payload, apiKey: "x".repeat(24) + "\n" },
  ])("rejects extra fields or invalid setup/key without reflecting their content", async invalid => {
    let result = "";
    try { await read(request(JSON.stringify(invalid))); } catch (error) { result = String(error); }
    expect(result).toBe("Error: PERSONAL_MODEL_OPERATOR_INVALID_BODY");
    expect(result.includes(payload.apiKey)).toBe(false);
  });
  it("rejects broken JSON", async () => {
    await expect(read(request('{"apiKey":'))).rejects.toThrow("INVALID_BODY");
  });
  it("rejects invalid UTF-8", async () => {
    const r = streamed(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0xff])); c.close(); } }));
    await expect(read(r)).rejects.toThrow("INVALID_BODY");
  });
  it("copies chunks before later asynchronous mutation", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(payload)); let pulls = 0;
    const r = streamed(new ReadableStream({ pull(c) {
      if (!pulls++) c.enqueue(bytes);
      else { bytes.fill(0); c.close(); }
    } }, { highWaterMark: 0 }));
    expect(await read(r)).toEqual(payload);
  });
  it("caps empty chunks as well as bytes", async () => {
    let pulls = 0;
    const r = streamed(new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array()); } }, { highWaterMark: 0 }));
    await expect(read(r)).rejects.toThrow("BODY_TOO_LARGE");
    expect(pulls).toBe(4097);
  });
  it("abort rejects a hung read without awaiting hung cancellation", async () => {
    const abort = new AbortController(); let cancelCalls = 0;
    const r = streamed(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelCalls++; return new Promise(() => {}); } }), abort.signal);
    const result = read(r); const assertion = expect(result).rejects.toThrow("REQUEST_EXPIRED");
    abort.abort(); await assertion; expect(cancelCalls).toBeGreaterThan(0);
  });
  it.each(["wall", "monotone"])("refuses invalid current %s after context creation", kind => {
    const r = request(), context = personalModelOperatorRequestContext(r);
    if (kind === "wall") vi.spyOn(Date, "now").mockReturnValue(NaN);
    else vi.spyOn(performance, "now").mockReturnValue(NaN);
    expect(context.remaining).toThrow("REQUEST_EXPIRED");
  });
  it("does not renew the original fifteen-second window", () => {
    const wall = vi.spyOn(Date, "now").mockReturnValue(100000);
    const mono = vi.spyOn(performance, "now").mockReturnValue(1000);
    const context = personalModelOperatorRequestContext(request());
    wall.mockReturnValue(114000); mono.mockReturnValue(15000);
    expect(context.remaining()).toBe(1000);
    wall.mockReturnValue(115000); mono.mockReturnValue(16000);
    expect(context.remaining).toThrow("REQUEST_EXPIRED");
  });
});
