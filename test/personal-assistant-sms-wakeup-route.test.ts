import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const shared = vi.hoisted(() => ({ accept: vi.fn(), after: vi.fn(), drain: vi.fn() }));
vi.mock("@/server/personal-assistant/phone-pairing", () => ({ acceptPersonalSms: shared.accept }));
vi.mock("@/server/personal-assistant/sms-worker", () => ({ drainPersonalSms: shared.drain }));
vi.mock("next/server", () => ({ after: shared.after }));
import { POST, maxDuration } from "@/app/api/webhooks/twilio/sms/route";
const url = "https://endvera.example/api/webhooks/twilio/sms";
const fields = { AccountSid: `AC${"a".repeat(32)}`, MessageSid: `SM${"b".repeat(32)}`, From: "+15005550001", To: "+15005550006", NumMedia: "0", Body: "Qu'est-ce que j'ai demain?" };
const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED",
  ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  TWILIO_API_KEY_SID: "synthetic-api-key-id", TWILIO_API_KEY_SECRET: "synthetic-api-secret", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
  ENDVERA_PERSONAL_SMS_INGRESS_ENABLED: "true", ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T00:00:00Z",
  ENDVERA_TWILIO_SMS_WEBHOOK_URL: url, TWILIO_ACCOUNT_SID: fields.AccountSid, TWILIO_AUTH_TOKEN: "synthetic-test-token", TWILIO_PHONE_NUMBER: fields.To };
const started = Date.parse("2026-09-10T01:00:00Z");
const request = () => new Request("https://internal.example/api/webhooks/twilio/sms", { method: "POST", body: new URLSearchParams(fields).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": createHmac("sha1", env.TWILIO_AUTH_TOKEN).update(url + Object.keys(fields).sort().map(key => key + fields[key as keyof typeof fields]).join("")).digest("base64") } });
let callbacks: Array<() => Promise<void>>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(started); vi.resetAllMocks(); callbacks = [];
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  shared.accept.mockResolvedValue({ operationId: "source", replayed: false }); shared.drain.mockResolvedValue({ processed: 1 });
  shared.after.mockImplementation((callback: () => Promise<void>) => { callbacks.push(callback); });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Twilio signed route durable receipt and bounded wakeup integration", () => {
  it("returns empty200 before background work and uses the original55s deadline", async () => {
    const response = await POST(request()); expect(response.status).toBe(200); expect(await response.text()).toContain("<Response></Response>");
    expect(maxDuration).toBe(60); expect(shared.drain).not.toHaveBeenCalled(); expect(callbacks).toHaveLength(1);
    await callbacks[0](); expect(shared.drain).toHaveBeenCalledWith(process.env, 1, { deadlineAt: started + 55000 });
  });
  it("does not turn a committed receipt into503 when after registration throws", async () => {
    shared.after.mockImplementation(() => { throw new Error("private-scheduler-debug"); });
    const response = await POST(request()); expect(response.status).toBe(200); expect(await response.text()).not.toContain("private-scheduler-debug");
    expect(shared.accept).toHaveBeenCalledTimes(1); expect(shared.drain).not.toHaveBeenCalled();
  });
  it("acknowledges replay without another wakeup", async () => {
    shared.accept.mockResolvedValue({ operationId: "source", replayed: true });
    expect((await POST(request())).status).toBe(200); expect(shared.after).not.toHaveBeenCalled(); expect(shared.drain).not.toHaveBeenCalled();
  });
  it("does not schedule before an unsuccessful durable enqueue", async () => {
    shared.accept.mockRejectedValue(new Error("synthetic-db-unavailable"));
    expect((await POST(request())).status).toBe(503); expect(shared.after).not.toHaveBeenCalled();
  });
  it("does not grant a new55s budget after slow receipt storage", async () => {
    shared.accept.mockImplementation(async () => { vi.setSystemTime(started + 45000); return { operationId: "source", replayed: false }; });
    expect((await POST(request())).status).toBe(200); await callbacks[0]();
    expect(shared.drain).toHaveBeenCalledWith(process.env, 1, { deadlineAt: started + 55000 });
  });
  it("skips a callback that begins after the request budget was exhausted", async () => {
    await POST(request()); vi.setSystemTime(started + 55000); await callbacks[0](); expect(shared.drain).not.toHaveBeenCalled();
  });
  it("contains worker failure and invokes the worker only once even if callback repeats", async () => {
    shared.drain.mockRejectedValue(new Error("synthetic-worker-failure")); const response = await POST(request());
    await expect(Promise.all([callbacks[0](), callbacks[0]()])).resolves.toEqual([undefined, undefined]);
    expect(shared.drain).toHaveBeenCalledTimes(1); expect(response.status).toBe(200);
  });
  it("does not schedule invalid signatures", async () => {
    const invalid = request(); invalid.headers.set("x-twilio-signature", "invalid");
    expect((await POST(invalid)).status).toBe(403); expect(shared.accept).not.toHaveBeenCalled(); expect(shared.after).not.toHaveBeenCalled();
  });
});
