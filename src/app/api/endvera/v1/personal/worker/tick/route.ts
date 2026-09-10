import { drainPersonalSms } from "@/server/personal-assistant/sms-worker";
import { personalWorkerAuthorized } from "@/server/personal-assistant/worker-auth";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!personalWorkerAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  try { return Response.json(await drainPersonalSms(process.env, 1), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ error: "WORKER_UNAVAILABLE" }, { status: 503 }); }
}
