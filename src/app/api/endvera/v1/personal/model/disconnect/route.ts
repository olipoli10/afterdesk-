import { z } from "zod";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { readPersonalModelCommandBody } from "@/server/personal-assistant/model-http";
import { disconnectPersonalModelConnection } from "@/server/personal-assistant/model-connection";
export const runtime = "nodejs";
const command = z.object({ workspaceId: z.string().min(1).max(160) }).strict();
const headers = { "cache-control": "private, no-store" };
export async function POST(request: Request) {
  const auth = await personalApiUser(request);
  if (auth.response) { auth.response.headers.set("cache-control", headers["cache-control"]); return auth.response; }
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return Response.json({ error: "Demande invalide." }, { status: 413, headers });
  const body = command.safeParse(await readPersonalModelCommandBody(request));
  if (!body.success) return Response.json({ error: "Demande invalide." }, { status: 400, headers });
  try { return Response.json(await disconnectPersonalModelConnection({ userId: auth.user.id, workspaceId: body.data.workspaceId }), { headers }); }
  catch { return Response.json({ error: "Déconnexion refusée pour ce compte." }, { status: 403, headers }); }
}
