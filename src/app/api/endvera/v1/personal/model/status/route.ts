import { z } from "zod";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { personalModelConnectionStatus } from "@/server/personal-assistant/model-connection";
export const runtime = "nodejs";
const query = z.object({ workspaceId: z.string().min(1).max(160) }).strict();
const headers = { "cache-control": "private, no-store" };
export async function GET(request: Request) {
  const auth = await personalApiUser(request);
  if (auth.response) { auth.response.headers.set("cache-control", headers["cache-control"]); return auth.response; }
  const params = new URL(request.url).searchParams;
  const parsed = query.safeParse(Object.fromEntries(params));
  if (!parsed.success || [...params.keys()].length !== 1) return Response.json({ error: "Demande invalide." }, { status: 400, headers });
  try { return Response.json(await personalModelConnectionStatus(auth.user.id, parsed.data.workspaceId), { headers }); }
  catch { return Response.json({ error: "Connexion IA indisponible pour ce compte." }, { status: 403, headers }); }
}
