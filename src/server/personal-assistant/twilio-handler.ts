import "server-only";
import { externalCapabilityDecision } from "@/lib/release/external-capabilities";
import { MAX_TWILIO_BODY_BYTES, parseSignedTwilioSms, TwilioIngressRefused, type TwilioSmsEnvelope } from "./twilio-envelope";

type Dependencies = {
  env: Readonly<Record<string, string | undefined>>;
  enqueue: (envelope: TwilioSmsEnvelope) => Promise<{ operationId: string; replayed: boolean }>;
  now: () => number;
};

export async function handlePersonalSmsWebhook(request: Request, deps: Dependencies): Promise<Response> {
  const { env } = deps;
  const deadline = Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT ?? "");
  if (!externalCapabilityDecision("SMS", env).enabled || env.ENDVERA_PERSONAL_SMS_INGRESS_ENABLED !== "true" || !Number.isFinite(deadline) || deadline <= deps.now()) {
    return new Response("Service unavailable", { status: 503 });
  }
  let rawBody = "";
  try {
    // Enforce bytes while streaming, before allocating an arbitrary request body.
    const reader = request.body?.getReader();
    if (!reader) throw new TwilioIngressRefused("INVALID_MESSAGE");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_TWILIO_BODY_BYTES) {
        await reader.cancel();
        throw new TwilioIngressRefused("BODY_TOO_LARGE");
      }
      chunks.push(result.value);
    }
    rawBody = Buffer.concat(chunks).toString("utf8");
    const envelope = parseSignedTwilioSms({
      rawBody, contentType: request.headers.get("content-type") ?? "",
      signature: request.headers.get("x-twilio-signature") ?? "",
      publicUrl: env.ENDVERA_TWILIO_SMS_WEBHOOK_URL ?? "",
      authToken: env.TWILIO_AUTH_TOKEN ?? "", accountSid: env.TWILIO_ACCOUNT_SID ?? "",
      number: env.TWILIO_PHONE_NUMBER ?? "",
    });
    await deps.enqueue(envelope);
    // Empty TwiML acknowledges durable receipt only; it sends no paid reply and
    // does not claim that the assistant has processed or completed the request.
    return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
      status: 200, headers: { "content-type": "text/xml; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof TwilioIngressRefused
      ? error.code === "CONFIGURATION_REQUIRED" ? 503
      : error.code === "BODY_TOO_LARGE" ? 413
      : error.code === "UNSUPPORTED_CONTENT_TYPE" ? 415
      : error.code === "REPLAY_CONFLICT" ? 409 : 403
      : 503;
    // Never echo request fields, tokens or ORM/provider exceptions.
    return new Response(status === 503 ? "Service unavailable" : "Request refused", { status });
  }
}
