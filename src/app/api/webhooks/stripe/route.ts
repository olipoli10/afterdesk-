import { NextResponse } from "next/server";
import {
  constructStripeEvent,
  fulfillCheckout,
  PaymentUnavailableError,
  reconcileStripeDispute,
  reconcileStripePaymentIntentCanceled,
  reconcileStripeRefunds,
} from "@/lib/payments/stripe";

export const runtime = "nodejs";

const MAX_EVENT_BYTES = 1024 * 1024;

async function readEventBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_EVENT_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_EVENT_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const payload = await readEventBody(request);
  if (payload === null) {
    return NextResponse.json({ error: "Event too large." }, { status: 413 });
  }
  try {
    const event = constructStripeEvent(payload, signature);
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfillCheckout(event.data.object);
        break;
      case "charge.refunded":
        await reconcileStripeRefunds(event.data.object);
        break;
      case "charge.dispute.created":
      case "charge.dispute.closed":
        await reconcileStripeDispute(event.data.object);
        break;
      case "payment_intent.canceled":
        // Almost always an authorization expiring (7-day card hold) before
        // QC approval ever triggered a capture. See the doc comment on
        // reconcileStripePaymentIntentCanceled.
        await reconcileStripePaymentIntentCanceled(event.data.object);
        break;
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    const status = error instanceof PaymentUnavailableError ? 503 : 400;
    console.error("[stripe-webhook] rejected event", error);
    return NextResponse.json({ error: "Webhook rejected." }, { status });
  }
}
