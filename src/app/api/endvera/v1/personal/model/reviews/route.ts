import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { personalModelReviewsForOwner } from "@/server/model-gateway/personal-intent/review-projection";

export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store", vary: "Cookie, Authorization" };

/** Read-only. Next returns 405 for unsupported mutation methods. */
export async function GET(request: Request) {
  const auth = await personalApiUser(request);
  if (auth.response) { auth.response.headers.set("cache-control", headers["cache-control"]); auth.response.headers.set("vary", headers.vary); return auth.response; }
  const params = new URL(request.url).searchParams;
  const workspaceId = params.get("workspaceId");
  if (!workspaceId || workspaceId.length > 128 || params.getAll("workspaceId").length !== 1 || [...params.keys()].some(key => key !== "workspaceId")) {
    return Response.json({ error: "Dossier requis." }, { status: 400, headers });
  }
  try { return Response.json(await personalModelReviewsForOwner(auth.user.id, workspaceId), { headers }); }
  catch { return Response.json({ error: "Accès aux demandes refusé." }, { status: 403, headers }); }
}
