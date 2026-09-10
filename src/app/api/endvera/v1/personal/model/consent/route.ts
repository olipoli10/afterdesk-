import { z } from "zod";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { readPersonalModelCommandBody } from "@/server/personal-assistant/model-http";
import { consentPersonalModelConnection, preparePersonalModelConnection, PERSONAL_MODEL_CONSENT_VERSION } from "@/server/personal-assistant/model-connection";
export const runtime = "nodejs";
const workspaceId = z.string().min(1).max(160);
const command = z.discriminatedUnion("action", [z.object({ workspaceId, action: z.literal("PREPARE") }).strict(),
  z.object({ workspaceId, action: z.literal("CONSENT"), confirmation: z.literal(PERSONAL_MODEL_CONSENT_VERSION) }).strict()]);
const headers = { "cache-control": "private, no-store" };
export async function POST(request: Request) {
  const auth = await personalApiUser(request);
  if (auth.response) { auth.response.headers.set("cache-control", headers["cache-control"]); return auth.response; }
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return Response.json({ error: "Demande invalide." }, { status: 413, headers });
  const body = command.safeParse(await readPersonalModelCommandBody(request));
  if (!body.success) return Response.json({ error: "Demande invalide." }, { status: 400, headers });
  try {
    const input = { userId: auth.user.id, workspaceId: body.data.workspaceId };
    const result = body.data.action === "PREPARE" ? await preparePersonalModelConnection(input)
      : await consentPersonalModelConnection({ ...input, confirmation: body.data.confirmation });
    return Response.json(result, { headers });
  } catch { return Response.json({ error: "Le propriétaire doit autoriser séparément la connexion IA." }, { status: 403, headers }); }
}
