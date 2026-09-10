import { handlePersonalSmsWebhook } from "@/server/personal-assistant/twilio-handler";
import { acceptPersonalSms } from "@/server/personal-assistant/phone-pairing";
import { after } from "next/server";
import { drainPersonalSms } from "@/server/personal-assistant/sms-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handlePersonalSmsWebhook(request, {
    env: process.env, enqueue: async envelope => {
      const receipt = await acceptPersonalSms(envelope);
      after(async () => { try { await drainPersonalSms(process.env, 1); } catch { /* Durable intake remains available to the authenticated recovery tick. */ } });
      return receipt;
    }, now: Date.now,
  });
}
