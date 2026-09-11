import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ session: vi.fn(), limit: vi.fn(), apply: vi.fn(), read: vi.fn(), publication: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: h.session, consumeRateLimit: h.limit }));
vi.mock("@/server/model-gateway/personal-intent/operator-ingress", () => ({ applyPersonalModelOperatorIngress: h.apply,
  readPersonalModelOperatorIngress: h.read, assertPersonalModelOperatorIngressPublication: h.publication }));
// Independent HTTP seam fixture. These mocks do not attest DB owner, B1 integrity
// or committed publication; the actual body reader and request deadline run.
vi.mock("@/server/model-gateway/personal-intent/operator-ingress-contract", () => ({
  PERSONAL_MODEL_INGRESS_TARGET: { origin: "https://endvera-core-sandbox-afterdesk.vercel.app" },
  PERSONAL_MODEL_INGRESS_LIMITS: { receiptUtf8: 16384 },
  inspectPersonalModelIngressConfiguration(raw: unknown) {
    if (raw !== "peer-configuration") throw new Error("INVALID_CONFIG");
    return { configuration: { setupRef: "12345678-1234-4234-8234-123456789abc" }, manifest: { ownerUserId: "peer-owner" } };
  },
  assertPersonalModelIngressWindow(raw: unknown) { if (raw !== "peer-configuration") throw new Error("INVALID_CONFIG"); },
}));
import { GET, POST } from "../src/app/api/endvera/v1/personal/model/operator-setup/route";
const origin = "https://endvera-core-sandbox-afterdesk.vercel.app";
const url = origin + "/api/endvera/v1/personal/model/operator-setup";
const setupRef = "12345678-1234-4234-8234-123456789abc";
const key = "ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION";
const command = { version: "personal-model-setup-command-v1", setupRef, apiKey: "synthetic_peer_key_never_valid_123456" };
const receipt = Object.freeze({ status: "APPLIED_NOT_ACTIVATED", executionAuthorized: false, automaticRetry: false });
function post(body: BodyInit = JSON.stringify(command), signal?: AbortSignal) {
  return new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body, signal, duplex: "half" } as RequestInit);
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv(key, "peer-configuration");
  h.session.mockResolvedValue({ id: "peer-owner", role: "CLIENT", emailVerified: true }); h.limit.mockResolvedValue(true);
  h.apply.mockResolvedValue(receipt); h.read.mockResolvedValue(receipt);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("independent operator HTTP boundary review", () => {
  it("positive control reaches exactly one setup and preserves its redacted body", async () => {
    const response = await POST(post()); expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt); expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.apply.mock.calls[0][0].actor).toEqual({ userId: "peer-owner", role: "CLIENT", emailVerified: true });
  });
  it("does not treat a truthy nonboolean verification as a verified session", async () => {
    h.session.mockResolvedValue({ id: "peer-owner", role: "CLIENT", emailVerified: "false" });
    expect((await POST(post())).status).toBe(401); expect(h.limit).not.toHaveBeenCalled(); expect(h.apply).not.toHaveBeenCalled();
  });
  it("does not treat a truthy nonboolean limiter result as admission", async () => {
    h.limit.mockResolvedValue("false"); expect((await POST(post())).status).toBe(429); expect(h.apply).not.toHaveBeenCalled();
  });
  it("snapshots the validated actor before awaiting the limiter", async () => {
    const user = { id: "peer-owner", role: "CLIENT", emailVerified: true }; h.session.mockResolvedValue(user);
    h.limit.mockImplementation(async () => { user.id = "foreign-user"; user.role = "ADMIN"; user.emailVerified = false; return true; });
    const response = await POST(post());
    // A conservative refusal also satisfies the boundary; never pass the mutated
    // session values as if they were the identity validated before the await.
    if (response.status === 200) expect(h.apply.mock.calls[0][0].actor).toEqual({ userId: "peer-owner", role: "CLIENT", emailVerified: true });
    else expect(h.apply).not.toHaveBeenCalled();
  });
  it("copies a Buffer chunk before its producer mutates it during the next pull", async () => {
    const buffer = Buffer.from(JSON.stringify(command)); let pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
      if (!pulls++) controller.enqueue(buffer); else { buffer.fill(0); controller.close(); }
    } }, { highWaterMark: 0 });
    expect((await POST(post(body))).status).toBe(200); expect(h.apply.mock.calls[0][0].apiKey).toBe(command.apiKey);
  });
  it("aborts a hung secret-body stream without waiting for hung cancellation", async () => {
    const abort = new AbortController(); let cancelCalls = 0, reading!: () => void;
    const started = new Promise<void>(resolve => { reading = resolve; });
    const body = new ReadableStream<Uint8Array>({ pull() { reading(); return new Promise(() => {}); },
      cancel() { cancelCalls++; return new Promise(() => {}); } }, { highWaterMark: 0 });
    const pending = POST(post(body, abort.signal)); await started; abort.abort();
    const response = await pending; expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"status":"REFUSED","automaticRetry":false}');
    expect(h.apply).not.toHaveBeenCalled(); expect(cancelCalls).toBeGreaterThan(0);
  });
  it("does not read or reflect a dependency error accessor", async () => {
    const get = vi.fn(() => command.apiKey), error = Object.defineProperty({}, "message", { get });
    h.apply.mockRejectedValue(error); const response = await POST(post());
    expect(await response.text()).toBe('{"status":"UNKNOWN","automaticRetry":false}'); expect(get).not.toHaveBeenCalled();
  });
  it("post-dispatch abort stays UNKNOWN rather than false success or retry", async () => {
    const abort = new AbortController(); h.apply.mockImplementation(async () => { abort.abort(); return receipt; });
    const response = await POST(post(undefined, abort.signal)); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "UNKNOWN", automaticRetry: false }); expect(h.apply).toHaveBeenCalledTimes(1);
  });
  it("a monotonic deadline expiring during JSON refuses a late success", async () => {
    let mono = 1000; vi.spyOn(performance, "now").mockImplementation(() => mono);
    h.apply.mockResolvedValue({ toJSON() { mono = 16000; return receipt; } });
    const response = await POST(post()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "UNKNOWN", automaticRetry: false });
  });
  it("captures the original abort signal even if the Request property changes during auth", async () => {
    const abort = new AbortController(), request = post(undefined, abort.signal);
    h.session.mockImplementation(async () => { Object.defineProperty(request, "signal", { value: new AbortController().signal }); abort.abort();
      return { id: "peer-owner", role: "CLIENT", emailVerified: true }; });
    expect((await POST(request)).status).toBe(503); expect(h.limit).not.toHaveBeenCalled(); expect(h.apply).not.toHaveBeenCalled();
  });
  it.each(["endvera://", "https://foreign.invalid", "null"])("GET refuses cross-origin %s without invoking history", async value => {
    const response = await GET(new Request(`${url}?setupRef=${setupRef}`, { headers: { origin: value } }));
    expect(response.status).toBe(403); expect(h.session).not.toHaveBeenCalled(); expect(h.read).not.toHaveBeenCalled();
  });
  it("GET decodes the configured selector once, cannot add a duplicate via percent encoding", async () => {
    expect((await GET(new Request(`${url}?%73etupRef=${setupRef}`))).status).toBe(200);
    expect(h.apply).not.toHaveBeenCalled(); h.read.mockClear();
    expect((await GET(new Request(`${url}?setupRef=${setupRef}&%73etupRef=${setupRef}`))).status).toBe(400);
    expect(h.read).not.toHaveBeenCalled();
  });
  it("failures never set auth cookies, CORS permission or cacheable content", async () => {
    h.session.mockRejectedValue(new Error(command.apiKey)); const response = await POST(post());
    expect(await response.text()).toBe('{"status":"REFUSED","automaticRetry":false}');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBeNull(); expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
