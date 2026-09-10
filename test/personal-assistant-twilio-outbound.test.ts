import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { cadMicros, sendPersonalTwilio, twilioDispatchPolicy } from "../src/server/personal-assistant/twilio-outbound";
import { parseTwilioReceipt } from "../src/server/personal-assistant/delivery-receipts";
const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-current-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", ENDVERA_VOICE_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: `SK${"b".repeat(32)}`, TWILIO_API_KEY_SECRET: "synthetic-secret", TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example", ENDVERA_TWILIO_STATUS_WEBHOOK_URL: "https://endvera.example/api/webhooks/twilio/status", ENDVERA_PERSONAL_OUTBOUND_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(), ENDVERA_TWILIO_RATE_REVIEWED_AT: new Date(Date.now() - 1000).toISOString(), ENDVERA_TWILIO_RATE_REVIEW_REF: "synthetic-rate-bound", ENDVERA_PERSONAL_BUDGET_CAD: "10", ENDVERA_SMS_SEGMENT_RESERVE_CAD: "0.10", ENDVERA_VOICE_MINUTE_RESERVE_CAD: "0.50" };
const request = { from: env.TWILIO_PHONE_NUMBER, to: "+15005550001", text: "Message synthétique" };
const operationId = "synthetic-operation-210";
afterEach(() => { vi.useRealTimers(); });
describe("bounded personal Twilio transport with fake HTTP", () => {
  it("refuses expired or aborted caller lifetimes without HTTP", async () => {
    const controller = new AbortController(); controller.abort();
    for (const context of [{ deadlineAt: Date.now() - 1 }, { signal: controller.signal }, { deadlineAt: NaN }]) {
      const transport = vi.fn();
      await expect(sendPersonalTwilio("sms_outbound", request, env, transport, operationId, context)).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled();
    }
  });
  it("aborts a stalled HTTP operation at the caller deadline without retry", async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Promise<Response>(() => undefined); });
    const outcome = sendPersonalTwilio("sms_outbound", request, env, transport, operationId, { deadlineAt: Date.now() + 25 }).catch(error => error.message);
    await vi.advanceTimersByTimeAsync(26);
    expect(await outcome).toBe("TWILIO_OUTCOME_UNKNOWN"); expect(signal?.aborted).toBe(true); expect(transport).toHaveBeenCalledTimes(1);
  });
  it("bounds response streaming, cancels the reader and retains unknown outcome", async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    const transport = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"sid":')); }, cancel })));
    const outcome = sendPersonalTwilio("sms_outbound", request, env, transport, operationId, { deadlineAt: Date.now() + 25 }).catch(error => error.message);
    await vi.advanceTimersByTimeAsync(26);
    expect(await outcome).toBe("TWILIO_OUTCOME_UNKNOWN"); expect(cancel).toHaveBeenCalledOnce(); expect(transport).toHaveBeenCalledOnce();
  });
  it("uses a ten-second maximum even when the caller supplies no deadline", async () => {
    vi.useFakeTimers(); const transport = vi.fn(async () => new Promise<Response>(() => undefined));
    const outcome = sendPersonalTwilio("sms_outbound", request, env, transport, operationId).catch(error => error.message);
    await vi.advanceTimersByTimeAsync(10001);
    expect(await outcome).toBe("TWILIO_OUTCOME_UNKNOWN"); expect(transport).toHaveBeenCalledOnce();
  });
  it("requires current authority, reviewed rates and a CAD ceiling before transport", async () => {
    for (const bad of [{}, { ...env, ENDVERA_PERSONAL_BUDGET_CAD: "" }, { ...env, ENDVERA_TWILIO_RATE_REVIEWED_AT: "2020-01-01T00:00:00Z" }, { ...env, ENDVERA_TWILIO_STATUS_WEBHOOK_URL: "https://evil.example/api/webhooks/twilio/status" }]) {
      const transport = vi.fn(); await expect(sendPersonalTwilio("sms_outbound", request, bad, transport, operationId)).rejects.toThrow(); expect(transport).not.toHaveBeenCalled();
    }
  });
  it("uses integer CAD arithmetic and conservative unicode segment reservations", () => {
    expect(cadMicros("1.000001")).toBe(1000001n);
    expect(twilioDispatchPolicy(env, "sms_outbound", "é".repeat(135)).reservation).toBe(300000n);
    expect(() => cadMicros("1e3")).toThrow(); expect(() => cadMicros("0")).toThrow();
  });
  it("dispatches the exact text and never calls accepted SMS delivered", async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ sid: `SM${"c".repeat(32)}`, account_sid: env.TWILIO_ACCOUNT_SID, from: request.from, to: request.to, status: "queued" }));
    expect(await sendPersonalTwilio("sms_outbound", request, env, transport, operationId)).toMatchObject({ delivered: false, providerStatus: "queued" });
    const form = new URLSearchParams(transport.mock.calls[0][1].body); expect(form.get("Body")).toBe(request.text); expect(form.get("ValidityPeriod")).toBe("60"); expect(form.get("MaxPrice")).toBeNull();
    expect(form.get("StatusCallback")).toContain(`operationId=${operationId}`); expect(transport).toHaveBeenCalledOnce();
  });
  it.each(["failed", "undelivered", "canceled", "received", "receiving", "scheduled", "accepted", "read", "invented", ""])("does not return SMS acceptance for REST status %s", async status => {
    const transport = vi.fn().mockResolvedValue(Response.json({ sid: `SM${"c".repeat(32)}`, account_sid: env.TWILIO_ACCOUNT_SID, from: request.from, to: request.to, status }));
    await expect(sendPersonalTwilio("sms_outbound", request, env, transport, operationId)).rejects.toThrow("TWILIO_OUTCOME_UNKNOWN");
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each(["failed", "busy", "no-answer", "canceled", "initiated", "invented", ""])("does not return voice acceptance for REST status %s", async status => {
    const transport = vi.fn().mockResolvedValue(Response.json({ sid: `CA${"c".repeat(32)}`, account_sid: env.TWILIO_ACCOUNT_SID, from: request.from, to: request.to, status }));
    await expect(sendPersonalTwilio("voice_outbound", request, env, transport, operationId)).rejects.toThrow("TWILIO_OUTCOME_UNKNOWN");
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each(["queued", "sending", "sent", "delivered"])("records SMS progression %s without claiming delivery", async status => {
    const transport = vi.fn().mockResolvedValue(Response.json({ sid: `SM${"c".repeat(32)}`, account_sid: env.TWILIO_ACCOUNT_SID, from: request.from, to: request.to, status, error_code: null, error_message: null }));
    expect(await sendPersonalTwilio("sms_outbound", request, env, transport, operationId)).toMatchObject({ providerStatus: status, delivered: false });
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each(["queued", "ringing", "in-progress", "completed"])("records voice progression %s without claiming a human heard it", async status => {
    const transport = vi.fn().mockResolvedValue(Response.json({ sid: `CA${"c".repeat(32)}`, account_sid: env.TWILIO_ACCOUNT_SID, from: request.from, to: request.to, status }));
    expect(await sendPersonalTwilio("voice_outbound", request, env, transport, operationId)).toMatchObject({ providerStatus: status, delivered: false });
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each([{ error_code: 30001 }, { error_message: "synthetic private failure" }])("does not accept a queued SMS carrying a contradictory error %j", async error => {
    const transport = vi.fn().mockResolvedValue(Response.json({ sid: `SM${"c".repeat(32)}`, account_sid: env.TWILIO_ACCOUNT_SID, from: request.from, to: request.to, status: "queued", ...error }));
    await expect(sendPersonalTwilio("sms_outbound", request, env, transport, operationId)).rejects.toThrow("TWILIO_OUTCOME_UNKNOWN");
    expect(transport).toHaveBeenCalledOnce();
  });
  it("escapes voice XML, disables recording and limits the call to 60 seconds", async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ sid: `CA${"c".repeat(32)}`, account_sid: env.TWILIO_ACCOUNT_SID, from: request.from, to: request.to, status: "queued" }));
    await sendPersonalTwilio("voice_outbound", { ...request, text: "Texte <Dial>+123</Dial> & autre" }, env, transport, operationId);
    const form = new URLSearchParams(transport.mock.calls[0][1].body); expect(form.get("Twiml")).toContain("&lt;Dial&gt;"); expect(form.get("Record")).toBe("false"); expect(form.get("TimeLimit")).toBe("60");
  });
  it("does not retry or echo provider failures", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("private debug"));
    await expect(sendPersonalTwilio("sms_outbound", request, env, transport, operationId)).rejects.toThrow("TWILIO_OUTCOME_UNKNOWN"); expect(transport).toHaveBeenCalledOnce();
  });
  it("verifies callbacks including the operation binding and unknown future fields", () => {
    const fields = { AccountSid: env.TWILIO_ACCOUNT_SID, MessageSid: `SM${"c".repeat(32)}`, MessageStatus: "delivered", FutureField: "included" };
    const rawBody = new URLSearchParams(fields).toString(); const url = `${env.ENDVERA_TWILIO_STATUS_WEBHOOK_URL}?operationId=${operationId}`;
    const signature = createHmac("sha1", env.TWILIO_AUTH_TOKEN).update(Object.keys(fields).sort().reduce((out, key) => out + key + fields[key as keyof typeof fields], url)).digest("base64");
    expect(parseTwilioReceipt({ rawBody, signature, operationId }, env).status).toBe("delivered");
    expect(() => parseTwilioReceipt({ rawBody, signature, operationId: "different-operation-210" }, env)).toThrow();
    expect(() => parseTwilioReceipt({ rawBody: `${rawBody}&MessageStatus=sent`, signature, operationId }, env)).toThrow();
  });
});
