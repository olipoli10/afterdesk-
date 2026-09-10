import { z } from "zod";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { approveAndInsertPersonalCalendar, personalCalendarActions, personalCalendarDraftSchema, preparePersonalCalendar } from "@/server/personal-assistant/calendar-actions";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await personalApiUser(request); if (auth.response) return auth.response;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId"); if (!workspaceId || workspaceId.length > 128) return Response.json({ error: "Dossier requis." }, { status: 400 });
  try { return Response.json(await personalCalendarActions(auth.user.id, workspaceId), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ error: "Accès refusé." }, { status: 403 }); }
}
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("PREPARE"), workspaceId: z.string().min(1).max(128), requestId: z.string().uuid(), draft: personalCalendarDraftSchema }).strict(), z.object({ action: z.literal("APPROVE_AND_INSERT"), workspaceId: z.string().min(1).max(128), operationId: z.string().min(1).max(128), expectedRequestHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()]);
export async function POST(request: Request) {
  const auth = await personalApiUser(request); if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Demande invalide." }, { status: 400 });
  try { return Response.json(parsed.data.action === "PREPARE" ? await preparePersonalCalendar({ ...parsed.data, userId: auth.user.id }) : await approveAndInsertPersonalCalendar({ ...parsed.data, userId: auth.user.id }), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ error: "Ajout Google non confirmé. Vérifie l’état avant de recommencer; aucun nouvel essai automatique." }, { status: 409, headers: { "cache-control": "no-store" } }); }
}
