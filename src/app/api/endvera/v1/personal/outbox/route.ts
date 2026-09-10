import { z } from "zod";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { approvePersonalOutbound, dispatchPersonalOutbound, personalOutboxForOwner, preparePersonalOutbound } from "@/server/personal-assistant/outbox";
export const runtime = "nodejs";
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PREPARE"), workspaceId: z.string().min(1).max(128), kind: z.enum(["sms_outbound", "voice_outbound"]), to: z.string().max(20), text: z.string().min(1).max(1500), requestId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("APPROVE_AND_SEND"), workspaceId: z.string().min(1).max(128), operationId: z.string().min(1).max(128), expectedRequestHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
export async function GET(request: Request) {
  const auth = await personalApiUser(request); if (auth.response) return auth.response;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 128) return Response.json({ error: "Dossier requis." }, { status: 400 });
  try { return Response.json(await personalOutboxForOwner(auth.user.id, workspaceId), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ error: "Accès refusé." }, { status: 403 }); }
}
export async function POST(request: Request) {
  const auth = await personalApiUser(request); if (auth.response) return auth.response;
  const body = commandSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Demande invalide." }, { status: 400 });
  try {
    if (body.data.action === "PREPARE") return Response.json(await preparePersonalOutbound({ ...body.data, userId: auth.user.id }), { headers: { "cache-control": "no-store" } });
    await approvePersonalOutbound({ ...body.data, userId: auth.user.id });
    return Response.json(await dispatchPersonalOutbound(body.data.operationId), { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "L’envoi n’est pas confirmé. Vérifie son état dans la liste. Aucun nouvel essai automatique ne sera fait." }, { status: 409, headers: { "cache-control": "no-store" } }); }
}
