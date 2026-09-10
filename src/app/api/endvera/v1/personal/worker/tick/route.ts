import { drainPersonalSms } from "@/server/personal-assistant/sms-worker";
import { personalWorkerAuthorized } from "@/server/personal-assistant/worker-auth";
import { recoverExpiredPersonalActionClaims } from "@/server/personal-assistant/claim-recovery";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const deadlineAt = Date.now() + 55_000;
  const headers = { "cache-control": "no-store" };
  if (!personalWorkerAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401, headers });
  try {
    // Bookkeeping can remain available after execution or consent is disabled.
    // This separate OFF-default gate grants no authority to retry an effect.
    const recovery = process.env.ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED === "true"
      ? await recoverExpiredPersonalActionClaims({ enabled: true, batchSize: 25, deadlineAt }) : undefined;
    if (Date.now() >= deadlineAt) throw new Error("WORKER_DEADLINE_EXCEEDED");
    const worker = await drainPersonalSms(process.env, 1, { deadlineAt });
    return Response.json(recovery ? { ...worker, actionRecovery: recovery } : worker, { headers });
  }
  catch { return Response.json({ error: "WORKER_UNAVAILABLE" }, { status: 503, headers }); }
}
