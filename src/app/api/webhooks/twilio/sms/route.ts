import { handlePersonalSmsWebhook } from "@/server/personal-assistant/twilio-handler";
import { acceptPersonalSms } from "@/server/personal-assistant/phone-pairing";
import { after } from "next/server";
import { drainPersonalSms } from "@/server/personal-assistant/sms-worker";
import { schedulePersonalSmsWakeup } from "@/server/personal-assistant/sms-wakeup";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  // after() shares this request's 60-second lifetime, not a fresh worker budget.
  const deadlineAt = Date.now() + 55_000;
  return handlePersonalSmsWebhook(request, {
    env: process.env, enqueue: async envelope => {
      const receipt = await acceptPersonalSms(envelope);
      schedulePersonalSmsWakeup(receipt, {
        enabled: process.env.ENDVERA_PERSONAL_SMS_WORKER_ENABLED === "true",
        deadlineAt, now: Date.now, schedule: callback => after(callback),
        run: deadline => drainPersonalSms(process.env, 1, { deadlineAt: deadline }),
        observe: event => console.info(JSON.stringify(event)),
      });
      return receipt;
    }, now: Date.now,
  });
}
