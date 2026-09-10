import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { externalCapabilityDecision } from "@/lib/release/external-capabilities";
import type { ConnectorEnvironment } from "./google-client";

export const personalOutboundSchema = z.object({ to: z.string().regex(/^\+[1-9]\d{7,14}$/), from: z.string().regex(/^\+[1-9]\d{7,14}$/), text: z.string().trim().min(1).max(1500), sourceOperationId: z.string().max(128).optional() }).strict();
export type PersonalOutbound = z.infer<typeof personalOutboundSchema>;
export type OutboundKind = "sms_outbound" | "voice_outbound";
export type PersonalOutboundExecutionContext = Readonly<{ deadlineAt?: number; signal?: AbortSignal }>;

/** A bounded lifetime, not permission to dispatch. Late promises may still
 * settle, so callers must also fence every durable write and actual callback. */
export function personalOutboundExecution(context: PersonalOutboundExecutionContext = {}, maximumMs = 20_000) {
  if (context.deadlineAt !== undefined && !Number.isFinite(context.deadlineAt)) throw new Error("OUTBOUND_DEADLINE_INVALID");
  const deadlineAt = Math.min(Date.now() + maximumMs, context.deadlineAt ?? Infinity);
  const controller = new AbortController();
  const abort = () => controller.abort();
  const requireLive = () => { if (controller.signal.aborted || Date.now() >= deadlineAt) throw new Error("OUTBOUND_DEADLINE_REACHED"); };
  if (context.signal?.aborted || Date.now() >= deadlineAt) abort();
  else context.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, Math.max(0, deadlineAt - Date.now()));
  return {
    deadlineAt, signal: controller.signal, requireLive,
    async wait<T>(work: () => Promise<T>): Promise<T> {
      requireLive();
      return new Promise<T>((resolve, reject) => {
        const stopped = () => reject(new Error("OUTBOUND_DEADLINE_REACHED"));
        controller.signal.addEventListener("abort", stopped, { once: true });
        Promise.resolve().then(() => { requireLive(); return work(); }).then(value => {
          requireLive(); resolve(value);
        }).catch(reject).finally(() => controller.signal.removeEventListener("abort", stopped));
      });
    },
    dispose() { clearTimeout(timer); context.signal?.removeEventListener("abort", abort); },
  };
}
export function cadMicros(value: string | undefined) {
  if (!value || !/^\d{1,5}(?:\.\d{1,6})?$/.test(value)) throw new Error("CURRENT_CAD_BUDGET_REQUIRED");
  const [whole, fraction = ""] = value.split("."); const result = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  if (result <= 0n) throw new Error("CURRENT_CAD_BUDGET_REQUIRED"); return result;
}
export function twilioDispatchPolicy(env: ConnectorEnvironment, kind: OutboundKind, text: string, now = Date.now()) {
  const expiry = Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT ?? "");
  const capability = kind === "sms_outbound" ? "SMS" : "VOICE";
  if (!externalCapabilityDecision(capability, env).enabled || env.ENDVERA_PERSONAL_OUTBOUND_ENABLED !== "true" || !(expiry > now)) throw new Error("PERSONAL_OUTBOUND_DISABLED");
  if (!/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID ?? "") || !/^SK[0-9a-f]{32}$/i.test(env.TWILIO_API_KEY_SID ?? "")) throw new Error("TWILIO_CONFIGURATION_REQUIRED");
  const reviewedAt = Date.parse(env.ENDVERA_TWILIO_RATE_REVIEWED_AT ?? "");
  if (!env.ENDVERA_TWILIO_RATE_REVIEW_REF || !(reviewedAt <= now && now - reviewedAt < 86400000)) throw new Error("CURRENT_TWILIO_RATE_REVIEW_REQUIRED");
  const ceiling = cadMicros(env.ENDVERA_PERSONAL_BUDGET_CAD);
  // Conservative UCS-2 segment count: JS length counts UTF-16 code units.
  const units = kind === "sms_outbound" ? text.length <= 70 ? 1 : Math.ceil(text.length / 67) : 1;
  if (kind === "voice_outbound" && text.length > 600) throw new Error("VOICE_TEXT_TOO_LONG");
  const reservation = cadMicros(kind === "sms_outbound" ? env.ENDVERA_SMS_SEGMENT_RESERVE_CAD : env.ENDVERA_VOICE_MINUTE_RESERVE_CAD) * BigInt(units);
  if (reservation > ceiling) throw new Error("BUDGET_EXHAUSTED");
  const callback = new URL(env.ENDVERA_TWILIO_STATUS_WEBHOOK_URL ?? "https://invalid.example");
  if (callback.protocol !== "https:" || callback.origin !== new URL(env.ENDVERA_PROVIDER_WEBHOOK_ORIGIN!).origin || callback.pathname !== "/api/webhooks/twilio/status" || callback.search || callback.hash || callback.username || callback.password) throw new Error("TWILIO_CALLBACK_REQUIRED");
  return { budgetId: createHash("sha256").update(JSON.stringify([env.TWILIO_ACCOUNT_SID, env.ENDVERA_EXTERNAL_AUTHORITY_REF])).digest("hex"), ceiling, reservation, expiresAt: new Date(expiry), callback: callback.href };
}
function xml(value: string) { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!); }

export async function sendPersonalTwilio(kind: OutboundKind, value: PersonalOutbound, env: ConnectorEnvironment, transport: typeof fetch = fetch, operationId?: string, context: PersonalOutboundExecutionContext = {}) {
  const execution = personalOutboundExecution(context, 10_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  try {
  execution.requireLive();
  const request = personalOutboundSchema.parse(value);
  const policy = twilioDispatchPolicy(env, kind, request.text);
  if (request.from !== env.TWILIO_PHONE_NUMBER) throw new Error("TWILIO_SENDER_REFUSED");
  if (!operationId || !/^[a-zA-Z0-9-]{10,128}$/.test(operationId)) throw new Error("OUTBOUND_OPERATION_REQUIRED");
  const callback = new URL(policy.callback); callback.searchParams.set("operationId", operationId);
  const body = new URLSearchParams({ To: request.to, From: request.from, StatusCallback: callback.href });
  if (kind === "sms_outbound") { body.set("Body", request.text); body.set("ValidityPeriod", "60"); }
  else { body.set("Twiml", `<Response><Say voice="alice" language="fr-CA">${xml(request.text)}</Say><Hangup/></Response>`); body.set("TimeLimit", "60"); body.set("Timeout", "20"); body.set("Record", "false"); body.set("StatusCallbackEvent", "completed"); }
  try { response = await execution.wait(() => transport(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/${kind === "sms_outbound" ? "Messages" : "Calls"}.json`, { method: "POST", redirect: "error", signal: execution.signal, headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`).toString("base64")}` }, body: body.toString() })); }
  catch { throw new Error("TWILIO_OUTCOME_UNKNOWN"); }
  // A timeout/5xx can occur after the provider accepted a send. No retry here.
  if (!response.ok) throw new Error(response.status >= 500 ? "TWILIO_OUTCOME_UNKNOWN" : "TWILIO_SEND_REFUSED");
  reader = response.body?.getReader(); if (!reader) throw new Error("TWILIO_OUTCOME_UNKNOWN");
  const bodyReader = reader;
  let size = 0; const parts: Uint8Array[] = [];
  try {
    while (true) { const part = await execution.wait(() => bodyReader.read()); if (part.done) break; size += part.value.byteLength; if (size > 65536) throw new Error(); parts.push(part.value); }
    execution.requireLive();
    // This immediate, explicit-From adapter does not schedule or use Messaging
    // Services. A 2xx resource with a negative/inbound/unknown state is not an
    // acceptance receipt. Keep the unknown-outcome path and never resend here.
    const statusSchema = kind === "sms_outbound"
      ? z.enum(["queued", "sending", "sent", "delivered"])
      : z.enum(["queued", "ringing", "in-progress", "completed"]);
    const parsed = z.object({ sid: z.string().regex(kind === "sms_outbound" ? /^SM[0-9a-f]{32}$/i : /^CA[0-9a-f]{32}$/i), status: statusSchema, account_sid: z.literal(env.TWILIO_ACCOUNT_SID!), to: z.literal(request.to), from: z.literal(request.from),
      error_code: z.null().optional(), error_message: z.null().optional() }).parse(JSON.parse(Buffer.concat(parts).toString("utf8")));
    return { providerSid: parsed.sid, providerStatus: parsed.status, delivered: false as const };
  } catch { throw new Error("TWILIO_OUTCOME_UNKNOWN"); }
  } finally {
    // Never await an uncooperative body's cancellation after the deadline.
    if (reader) { const closing = reader; void closing.cancel().catch(() => undefined).finally(() => {
      try { closing.releaseLock(); } catch { /* Pending canceled read retains no authority. */ }
    }); }
    else if (response?.body) void response.body.cancel().catch(() => undefined);
    execution.dispose();
  }
}
