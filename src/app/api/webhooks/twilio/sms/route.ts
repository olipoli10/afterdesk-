import { handlePersonalSmsWebhook } from "@/server/personal-assistant/twilio-handler";
import { enqueuePersonalSms } from "@/server/personal-assistant/sms-inbox";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handlePersonalSmsWebhook(request, {
    env: process.env, enqueue: enqueuePersonalSms, now: Date.now,
  });
}
