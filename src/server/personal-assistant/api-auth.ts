import "server-only";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";

export async function personalApiUser(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "CLIENT" || !user.emailVerified) return { response: Response.json({ error: "Connecte-toi pour continuer." }, { status: 401 }) } as const;
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const allowedOrigin = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : null;
    if (origin && origin !== allowedOrigin && origin !== "endvera://") return { response: Response.json({ error: "Demande refusée." }, { status: 403 }) } as const;
  }
  if (!await consumeRateLimit(`personal-connectors:${user.id}`, { window: 60, max: 20 })) return { response: Response.json({ error: "Réessaie dans une minute." }, { status: 429 }) } as const;
  return { user } as const;
}
