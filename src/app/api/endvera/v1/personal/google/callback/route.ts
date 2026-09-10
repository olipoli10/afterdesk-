import { finishGoogleConnection } from "@/server/personal-assistant/google-connection";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const cookies = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith("__Host-endvera-google="));
  let connected = false;
  if (!params.has("error") && params.getAll("state").length === 1 && params.getAll("code").length === 1 && cookies.length === 1) {
    try {
      await finishGoogleConnection({ state: params.get("state")!, code: params.get("code")!, cookieNonce: cookies[0].slice("__Host-endvera-google=".length) });
      connected = true;
    } catch { /* Fixed user-facing message below; codes/tokens are never echoed. */ }
  }
  const title = connected ? "Ton calendrier Google est connecté." : "La connexion n’a pas été terminée.";
  const detail = connected ? "Tu peux revenir dans ENDVERA. Seuls les accès que tu as accordés sont utilisés." : "Aucun nouvel accès n’a été activé. Reviens dans ENDVERA pour réessayer.";
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ENDVERA — Google</title><body><main><h1>${title}</h1><p>${detail}</p><p><a href="endvera://calendar-connections">Revenir dans ENDVERA</a></p></main></body></html>`, { status: connected ? 200 : 400, headers: {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "set-cookie": "__Host-endvera-google=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  } });
}
