import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ session: vi.fn(), limit: vi.fn(), apply: vi.fn(), read: vi.fn(), publication: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: h.session, consumeRateLimit: h.limit }));
vi.mock("@/server/model-gateway/personal-intent/operator-ingress", () => ({ applyPersonalModelOperatorIngress: h.apply,
  readPersonalModelOperatorIngress: h.read, assertPersonalModelOperatorIngressPublication: h.publication }));
// HTTP orchestration only: real closed configuration/archive contracts have a
// separate 65-test suite. No DB, real credentials, owner consent or external call.
vi.mock("@/server/model-gateway/personal-intent/operator-ingress-contract", () => ({
  PERSONAL_MODEL_INGRESS_TARGET: { origin: "https://endvera-core-sandbox-afterdesk.vercel.app" },
  PERSONAL_MODEL_INGRESS_LIMITS: { receiptUtf8: 16384 },
  inspectPersonalModelIngressConfiguration(raw: unknown) {
    if (raw !== "synthetic-current" && raw !== "synthetic-expired") throw new Error("synthetic malformed");
    return { manifest: { ownerUserId: "synthetic-owner" }, configuration: { setupRef: "12345678-1234-4234-8234-123456789abc" } };
  },
  assertPersonalModelIngressWindow(raw: unknown) { if (raw !== "synthetic-current") throw new Error("synthetic expired"); },
}));
import { GET, POST } from "../src/app/api/endvera/v1/personal/model/operator-setup/route";
const origin = "https://endvera-core-sandbox-afterdesk.vercel.app", path = "/api/endvera/v1/personal/model/operator-setup";
const setupRef = "12345678-1234-4234-8234-123456789abc", configKey = "ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION";
const command = { version: "personal-model-setup-command-v1", setupRef, apiKey: "synthetic_key_not_valid_123456789" };
const user = { id: "synthetic-owner", role: "CLIENT", emailVerified: true };
const receipt = { status: "APPLIED_NOT_ACTIVATED", automaticRetry: false, executionAuthorized: false };
function post(body: unknown = command, extra: Record<string, string> = {}, suffix = "") {
  return new Request(origin + path + suffix, { method: "POST", headers: { origin, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
}
const get = (suffix = `?setupRef=${setupRef}`) => new Request(origin + path + suffix);
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv(configKey, "synthetic-current"); h.session.mockResolvedValue(user);
  h.limit.mockResolvedValue(true); h.apply.mockResolvedValue(receipt); h.read.mockResolvedValue(receipt); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("dedicated owner-only model setup route", () => {
  it.each([undefined, "", "malformed", "synthetic-expired"])("disabled POST %s performs no auth/core work", async raw => {
    vi.stubEnv(configKey, raw); const r = await POST(post()); expect(r.status).toBe(404);
    expect(h.session).not.toHaveBeenCalled(); expect(h.apply).not.toHaveBeenCalled();
  });
  it.each(["null", "endvera://", "https://evil.invalid", "", `${origin}.evil.invalid`])("refuses Origin %s", async value => {
    expect((await POST(post(command, { origin: value }))).status).toBe(403); expect(h.session).not.toHaveBeenCalled();
  });
  it("refuses absent Origin even with spoofed forwarded host", async () => {
    const r = post(command, { "x-forwarded-host": new URL(origin).hostname }); r.headers.delete("origin");
    expect((await POST(r)).status).toBe(403); expect(h.apply).not.toHaveBeenCalled();
  });
  it("refuses bearer-only/native credentials", async () => {
    expect((await POST(post(command, { authorization: "Bearer synthetic" }))).status).toBe(401); expect(h.session).not.toHaveBeenCalled();
  });
  it.each([null, { ...user, role: "ADMIN" }, { ...user, emailVerified: false }])("requires verified CLIENT session", async value => {
    h.session.mockResolvedValue(value); expect((await POST(post())).status).toBe(401); expect(h.apply).not.toHaveBeenCalled();
  });
  it("does not disclose another owner's configuration", async () => {
    h.session.mockResolvedValue({ ...user, id: "different-owner" }); expect((await POST(post())).status).toBe(404);
    expect(h.limit).not.toHaveBeenCalled(); expect(h.apply).not.toHaveBeenCalled();
  });
  it("does not continue after rate refusal", async () => {
    h.limit.mockResolvedValue(false); expect((await POST(post())).status).toBe(429); expect(h.apply).not.toHaveBeenCalled();
  });
  it.each(["?setupRef=x", "?apiKey=synthetic", "?retry=true"])("no POST query %s", async suffix => {
    expect((await POST(post(command, {}, suffix))).status).toBe(400); expect(h.session).not.toHaveBeenCalled();
  });
  it.each([{ ...command, actor: user }, { ...command, retry: true }, { ...command, apiKey: "short" }])("closed actual body reader", async body => {
    expect((await POST(post(body))).status).toBe(400); expect(h.apply).not.toHaveBeenCalled();
  });
  it("returns 413 on actual body limit; 415 on unsupported media", async () => {
    expect((await POST(post({ ...command, apiKey: "x".repeat(5000) }))).status).toBe(413);
    expect((await POST(post(command, { "content-type": "text/plain" }))).status).toBe(415); expect(h.apply).not.toHaveBeenCalled();
  });
  it("passes only server-derived actor, original signal/deadline and command key to ingress", async () => {
    const r = post(); const result = await POST(r); expect(result.status).toBe(200);
    expect(h.apply).toHaveBeenCalledTimes(1);
    const [input, env, context] = h.apply.mock.calls[0];
    expect(input).toEqual({ actor: { userId: user.id, role: "CLIENT", emailVerified: true }, setupRef, apiKey: command.apiKey });
    expect(env).toBe(process.env); expect(Object.keys(context).sort()).toEqual(["deadlineAt", "monotoneDeadlineAt", "signal"]);
    expect(context.signal).toBe(r.signal); expect(h.publication).toHaveBeenCalledTimes(2);
    expect(await result.json()).toEqual(receipt); expect(h.read).not.toHaveBeenCalled();
  });
  it.each(["session", "rate", "core"])("configuration drift during %s blocks later success", async phase => {
    const change = () => { process.env[configKey] = "changed"; };
    if (phase === "session") h.session.mockImplementation(async () => { change(); return user; });
    if (phase === "rate") h.limit.mockImplementation(async () => { change(); return true; });
    if (phase === "core") h.apply.mockImplementation(async () => { change(); return receipt; });
    const r = await POST(post()); expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ status: phase === "core" ? "UNKNOWN" : "REFUSED", automaticRetry: false });
    if (phase !== "core") expect(h.apply).not.toHaveBeenCalled();
  });
  it("auth latency consumes original budget, not a fresh body/setup window", async () => {
    const started = Date.now(); h.session.mockImplementation(async () => { vi.spyOn(Date, "now").mockReturnValue(started + 16000); return user; });
    expect((await POST(post())).status).toBe(503); expect(h.apply).not.toHaveBeenCalled();
  });
  it("never reflects core secret-bearing errors and never retries", async () => {
    h.apply.mockRejectedValue(new Error(command.apiKey)); const r = await POST(post());
    expect(await r.text()).toBe('{"status":"UNKNOWN","automaticRetry":false}'); expect(h.apply).toHaveBeenCalledTimes(1);
  });
  it.each([1, 2])("publication guard %s refuses false success", async call => {
    let n = 0; h.publication.mockImplementation(() => { if (++n === call) throw new Error("synthetic"); });
    const r = await POST(post()); expect(r.status).toBe(503); expect((await r.json()).status).toBe("UNKNOWN");
  });
  it("rejects receipt overflow and context lost while JSON is serialized", async () => {
    h.apply.mockResolvedValue({ status: "x".repeat(17000) }); expect((await POST(post())).status).toBe(503);
    h.apply.mockResolvedValue({ toJSON() { process.env[configKey] = "changed"; return receipt; } });
    const r = await POST(post()); expect(r.status).toBe(503); expect((await r.json()).status).toBe("UNKNOWN");
  });
  it("allows owner-only historical GET after the POST window, no key/write", async () => {
    vi.stubEnv(configKey, "synthetic-expired"); const r = await GET(get()); expect(r.status).toBe(200);
    expect(h.read.mock.calls[0][0]).toEqual({ actor: { userId: user.id, role: "CLIENT", emailVerified: true }, setupRef });
    expect(h.apply).not.toHaveBeenCalled();
  });
  it.each(["", "?setupRef=wrong", `?setupRef=${setupRef}&setupRef=${setupRef}`, `?setupRef=${setupRef}&key=x`])("closed GET selector %s", async suffix => {
    expect((await GET(get(suffix))).status).toBe(400); expect(h.read).not.toHaveBeenCalled();
  });
  it("all success and refusal responses are private and noncacheable", async () => {
    for (const r of [await POST(post()), await GET(get()), await GET(get(""))]) {
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(r.headers.get("vary")).toBe("Cookie, Authorization"); expect(r.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});
