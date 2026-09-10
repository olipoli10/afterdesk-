import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { googleConnectionStatus } from "@/server/personal-assistant/google-connection";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await personalApiUser(request); if (auth.response) return auth.response;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 128) return Response.json({ error: "Chantier requis." }, { status: 400 });
  try { return Response.json(await googleConnectionStatus(auth.user.id, workspaceId), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ error: "Connexion indisponible pour ce compte." }, { status: 403 }); }
}
