import { z } from "zod";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { disconnectPersonalPhone, PersonalPhoneAccessDenied, PersonalPhoneStatusUnavailable, personalPhoneStatus, startPhonePairing } from "@/server/personal-assistant/phone-pairing";
export const runtime = "nodejs";
const PRIVATE_NO_STORE = { "cache-control": "private, no-store" };
export async function GET(request: Request) {
  const auth = await personalApiUser(request); if (auth.response) return auth.response;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 128) return Response.json({ error: "Dossier requis." }, { status: 400 });
  try { return Response.json(await personalPhoneStatus(auth.user.id, workspaceId), { headers: PRIVATE_NO_STORE }); }
  catch (error) {
    if (error instanceof PersonalPhoneAccessDenied) return Response.json({ error: "Accès refusé." }, { status: 403, headers: PRIVATE_NO_STORE });
    const stage = error instanceof PersonalPhoneStatusUnavailable ? error.stage : "unknown";
    console.error("ENDVERA_PERSONAL_PHONE_STATUS_UNAVAILABLE", { stage });
    return Response.json({ error: "État du numéro temporairement indisponible." }, { status: 503, headers: PRIVATE_NO_STORE });
  }
}
const commandSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("PAIR"), workspaceId: z.string().min(1).max(128), allowSelfSms: z.boolean(), allowSelfVoice: z.boolean() }).strict(), z.object({ action: z.literal("DISCONNECT"), workspaceId: z.string().min(1).max(128) }).strict()]);
export async function POST(request: Request) {
  const auth = await personalApiUser(request); if (auth.response) return auth.response;
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Demande invalide." }, { status: 400 });
  try { return Response.json(parsed.data.action === "PAIR" ? await startPhonePairing({ ...parsed.data, userId: auth.user.id }) : await disconnectPersonalPhone(auth.user.id, parsed.data.workspaceId), { headers: PRIVATE_NO_STORE }); }
  catch { return Response.json({ error: "Le numéro ENDVERA n’est pas encore prêt à être associé. Aucun texto n’a été envoyé." }, { status: 503, headers: PRIVATE_NO_STORE }); }
}
