import { z } from "zod";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { readGoogleCalendar } from "@/server/personal-assistant/google-connection";
export const runtime = "nodejs";
const querySchema = z.object({ workspaceId: z.string().min(1).max(128), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).strict();
export async function GET(request: Request) {
  const auth = await personalApiUser(request); if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Période invalide." }, { status: 400 });
  try {
    return Response.json(await readGoogleCalendar(auth.user.id, parsed.data.workspaceId, parsed.data.start, parsed.data.end), { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "Impossible de lire tout le calendrier. Aucun horaire n’a été inventé. Reconnecte Google ou réessaie." }, { status: 503, headers: { "cache-control": "no-store" } }); }
}
