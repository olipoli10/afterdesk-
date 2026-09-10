import { z } from "zod";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { beginGoogleConnection, disconnectGoogleLocally } from "@/server/personal-assistant/google-connection";

const command = z.object({ workspaceId: z.string().min(1).max(160), action: z.enum(["CONNECT", "DISCONNECT"]), mode: z.enum(["READ_ONLY", "READ_WRITE"]).optional() }).strict();
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await personalApiUser(request);
  if ("response" in auth) return auth.response;
  const body = command.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Demande invalide." }, { status: 400 });
  try {
    const result = body.data.action === "CONNECT"
      ? await beginGoogleConnection({ userId: auth.user.id, workspaceId: body.data.workspaceId, mode: body.data.mode ?? "READ_ONLY" })
      : await disconnectGoogleLocally(auth.user.id, body.data.workspaceId);
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "La connexion Google n’est pas disponible. Tes accès existants n’ont pas été remplacés." }, { status: 503 });
  }
}
