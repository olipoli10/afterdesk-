import "server-only";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";

export type PersonalApiRatePolicy = Readonly<{
  namespace: string;
  window: number;
  max: number;
}>;

const DEFAULT_PERSONAL_API_RATE_POLICY: PersonalApiRatePolicy = Object.freeze({
  namespace: "personal-connectors",
  window: 60,
  max: 20,
});

export async function personalApiUser(
  request: Request,
  ratePolicy: PersonalApiRatePolicy = DEFAULT_PERSONAL_API_RATE_POLICY,
) {
  const user = await getSessionUser();
  if (!user || user.role !== "CLIENT" || !user.emailVerified) return { response: Response.json({ error: "Connecte-toi pour continuer." }, { status: 401, headers: { "cache-control": "private, no-store" } }) } as const;
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const allowedOrigin = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : null;
    if (origin && origin !== allowedOrigin && origin !== "endvera://") return { response: Response.json({ error: "Demande refusée." }, { status: 403, headers: { "cache-control": "private, no-store" } }) } as const;
  }
  if (!await consumeRateLimit(`${ratePolicy.namespace}:${user.id}`, { window: ratePolicy.window, max: ratePolicy.max })) return { response: Response.json({ error: "Réessaie dans une minute." }, { status: 429, headers: { "cache-control": "private, no-store", "retry-after": "60" } }) } as const;
  return { user } as const;
}
