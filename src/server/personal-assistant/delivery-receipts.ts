import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { MAX_TWILIO_BODY_BYTES, verifyTwilioFormSignature } from "./twilio-envelope";
import { personalOutboundSchema } from "./twilio-outbound";
import type { ConnectorEnvironment } from "./google-client";

const smsStates = ["queued", "sending", "sent", "delivered", "undelivered", "failed", "canceled"];
const voiceStates = ["queued", "initiated", "ringing", "in-progress", "completed", "busy", "no-answer", "failed", "canceled"];
export function parseTwilioReceipt(input: { rawBody: string; signature: string; operationId: string }, env: ConnectorEnvironment) {
  if (Buffer.byteLength(input.rawBody) > MAX_TWILIO_BODY_BYTES || !/^[a-zA-Z0-9-]{10,128}$/.test(input.operationId) || !env.TWILIO_AUTH_TOKEN) throw new Error("RECEIPT_REFUSED");
  const url = new URL(env.ENDVERA_TWILIO_STATUS_WEBHOOK_URL ?? "https://invalid.example");
  if (url.protocol !== "https:" || url.pathname !== "/api/webhooks/twilio/status" || url.origin !== new URL(env.ENDVERA_PROVIDER_WEBHOOK_ORIGIN ?? "https://missing.example").origin || url.search || url.hash || url.username || url.password) throw new Error("RECEIPT_REFUSED");
  url.searchParams.set("operationId", input.operationId);
  const params = new URLSearchParams(input.rawBody); const fields: Record<string, string> = {};
  for (const [key, value] of params) { if (Object.hasOwn(fields, key)) throw new Error("RECEIPT_REFUSED"); fields[key] = value; }
  if (!verifyTwilioFormSignature({ publicUrl: url.href, authToken: env.TWILIO_AUTH_TOKEN, signature: input.signature, fields }) || fields.AccountSid !== env.TWILIO_ACCOUNT_SID) throw new Error("RECEIPT_REFUSED");
  const voice = Boolean(fields.CallSid);
  const providerSid = voice ? fields.CallSid : fields.MessageSid;
  const status = voice ? fields.CallStatus : fields.MessageStatus;
  if (voice && fields.MessageSid || !(voice ? /^CA[0-9a-f]{32}$/i : /^SM[0-9a-f]{32}$/i).test(providerSid ?? "") || !(voice ? voiceStates : smsStates).includes(status)) throw new Error("RECEIPT_REFUSED");
  return { operationId: input.operationId, providerSid, status, kind: voice ? "voice_outbound" : "sms_outbound", to: fields.To, from: fields.From };
}
export async function storeTwilioReceipt(receipt: ReturnType<typeof parseTwilioReceipt>) {
  const row = await prisma.personalAssistantOperation.findUnique({ where: { id: receipt.operationId } });
  if (!row || row.kind !== receipt.kind || !["processing", "completed", "uncertain"].includes(row.status) || row.attempts !== 1) throw new Error("RECEIPT_REFUSED");
  const request = personalOutboundSchema.parse(row.request);
  const result = row.result as { providerSid?: string } | null;
  if (result?.providerSid && result.providerSid !== receipt.providerSid || receipt.to && receipt.to !== request.to || receipt.from && receipt.from !== request.from) throw new Error("RECEIPT_REFUSED");
  const id = createHash("sha256").update(JSON.stringify([row.id, receipt.providerSid, receipt.status])).digest("hex");
  await prisma.personalAssistantDeliveryReceipt.upsert({ where: { id }, create: { id, operationId: row.id, providerSid: receipt.providerSid, status: receipt.status }, update: {} });
}
