import { z } from "zod";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { readPersonalModelCommandBody } from "@/server/personal-assistant/model-http";
import { PERSONAL_MODEL_CREDENTIAL_CONFIRMATION,
  provisionPersonalModelCredentialFromOwnerSession } from "@/server/personal-assistant/model-connection";

export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store", vary: "Cookie, Authorization" };
const command = z.object({
  version: z.literal("personal-model-mobile-credential-v1"),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  confirmation: z.literal(PERSONAL_MODEL_CREDENTIAL_CONFIRMATION),
  apiKey: z.string().regex(/^[A-Za-z0-9_-]{24,512}$/),
}).strict();

export async function POST(request: Request) {
  const auth = await personalApiUser(request);
  if (auth.response) { for (const [key, value] of Object.entries(headers)) auth.response.headers.set(key, value); return auth.response; }
  const url = new URL(request.url);
  if ([...url.searchParams].length || request.headers.get("x-endvera-mobile-client") !== "android-v1") {
    return Response.json({ error: "Demande invalide." }, { status: 400, headers });
  }
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return Response.json({ error: "Demande invalide." }, { status: 415, headers });
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return Response.json({ error: "Demande invalide." }, { status: 413, headers });
  const body = command.safeParse(await readPersonalModelCommandBody(request));
  if (!body.success) return Response.json({ error: "Demande invalide." }, { status: 400, headers });
  try {
    return Response.json(await provisionPersonalModelCredentialFromOwnerSession({ userId: auth.user.id,
      workspaceId: body.data.workspaceId, commandId: body.data.commandId,
      confirmation: body.data.confirmation, apiKey: body.data.apiKey }), { headers });
  } catch {
    return Response.json({ error: "La clé n’a pas été enregistrée. Vérifie ton autorisation IA et réessaie." }, { status: 403, headers });
  }
}
