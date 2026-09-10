import { parseTwilioReceipt, storeTwilioReceipt } from "@/server/personal-assistant/delivery-receipts";
import { MAX_TWILIO_BODY_BYTES } from "@/server/personal-assistant/twilio-envelope";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new Response("Refused", { status: 415 });
    const url = new URL(request.url); if (Array.from(url.searchParams.keys()).length !== 1 || !url.searchParams.has("operationId")) return new Response("Refused", { status: 400 });
    const reader = request.body?.getReader(); if (!reader) return new Response("Refused", { status: 400 });
    let size = 0; const parts: Uint8Array[] = [];
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX_TWILIO_BODY_BYTES) { await reader.cancel(); return new Response("Refused", { status: 413 }); } parts.push(part.value); }
    const receipt = parseTwilioReceipt({ operationId: url.searchParams.get("operationId")!, rawBody: Buffer.concat(parts).toString("utf8"), signature: request.headers.get("x-twilio-signature") ?? "" }, process.env);
    await storeTwilioReceipt(receipt);
    return new Response(null, { status: 204 });
  } catch { return new Response("Receipt not accepted", { status: 503 }); }
}
