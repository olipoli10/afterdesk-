import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handlePersonalSmsWebhook } from "../src/server/personal-assistant/twilio-handler";
import { TwilioIngressRefused } from "../src/server/personal-assistant/twilio-envelope";

const url = "https://endvera.example/api/webhooks/twilio/sms";
const fields = { AccountSid: `AC${"a".repeat(32)}`, MessageSid: `SM${"b".repeat(32)}`, From: "+15005550001", To: "+15005550006", NumMedia: "0", Body: "Qu'est-ce que j'ai demain?" };
const env = {
  ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED",
  ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  TWILIO_API_KEY_SID: "synthetic-api-key-id", TWILIO_API_KEY_SECRET: "synthetic-api-secret",
  ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
  ENDVERA_PERSONAL_SMS_INGRESS_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-09-10T00:00:00Z",
  ENDVERA_TWILIO_SMS_WEBHOOK_URL: url, TWILIO_ACCOUNT_SID: fields.AccountSid,
  TWILIO_AUTH_TOKEN: "synthetic-test-token", TWILIO_PHONE_NUMBER: fields.To,
};
function req(body = new URLSearchParams(fields).toString()) {
  const signature = createHmac("sha1", env.TWILIO_AUTH_TOKEN).update(url + Object.keys(fields).sort().map(key => key + fields[key as keyof typeof fields]).join("")).digest("base64");
  return new Request("https://internal.example/api/webhooks/twilio/sms", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature, "x-forwarded-host": "attacker.example" } });
}
function deps() {
  return { env, now: () => Date.parse("2026-09-09T00:00:00Z"), enqueue: vi.fn().mockResolvedValue({ operationId: "op-test", replayed: false }) };
}
describe("personal SMS HTTP ingress", () => {
  it("is closed by default and never reads or enqueues a disabled request", async () => {
    const d = deps();
    expect((await handlePersonalSmsWebhook(req(), { ...d, env: {} })).status).toBe(503);
    expect(d.enqueue).not.toHaveBeenCalled();
  });
  it("stops accepting at pilot expiry", async () => {
    const d = deps();
    expect((await handlePersonalSmsWebhook(req(), { ...d, now: () => Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT) })).status).toBe(503);
    expect(d.enqueue).not.toHaveBeenCalled();
  });
  it.each(["ENDVERA_EXTERNAL_TRANSPORT_ENABLED", "ENDVERA_SMS_PROVIDER_ENABLED", "ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_EXTERNAL_OWNER_REF"])("honors existing capability gate %s", async name => {
    const d = deps();
    expect((await handlePersonalSmsWebhook(req(), { ...d, env: { ...env, [name]: "" } })).status).toBe(503);
    expect(d.enqueue).not.toHaveBeenCalled();
  });
  it("acknowledges durable receipt with no outgoing message and ignores spoofed proxy headers", async () => {
    const d = deps();
    const result = await handlePersonalSmsWebhook(req(), d);
    expect(result.status).toBe(200);
    expect(await result.text()).toContain("<Response></Response>");
    expect(d.enqueue).toHaveBeenCalledOnce();
  });
  it("fails closed before enqueue when a signed body is changed", async () => {
    const d = deps();
    expect((await handlePersonalSmsWebhook(req("Body=altered"), d)).status).toBe(403);
    expect(d.enqueue).not.toHaveBeenCalled();
  });
  it("rejects oversized streamed bodies before enqueue", async () => {
    const d = deps();
    expect((await handlePersonalSmsWebhook(req("x".repeat(32769)), d)).status).toBe(413);
    expect(d.enqueue).not.toHaveBeenCalled();
  });
  it("does not acknowledge an unavailable database or expose its exception", async () => {
    const d = deps(); d.enqueue.mockRejectedValue(new Error("database secret password"));
    const result = await handlePersonalSmsWebhook(req(), d);
    expect(result.status).toBe(503);
    expect(await result.text()).toBe("Service unavailable");
  });
  it.each(["IDENTITY_NOT_BOUND", "CHANNEL_NOT_CONNECTED", "REPLAY_CONFLICT"])("refuses %s", async code => {
    const d = deps(); d.enqueue.mockRejectedValue(new TwilioIngressRefused(code));
    const result = await handlePersonalSmsWebhook(req(), d);
    expect(result.status).toBe(code === "REPLAY_CONFLICT" ? 409 : 403);
    expect(await result.text()).toBe("Request refused");
  });
});
