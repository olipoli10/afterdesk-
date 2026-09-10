import { launchGoogleConnection } from "@/server/personal-assistant/google-connection";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.getAll("attempt").length !== 1 || params.getAll("token").length !== 1) return new Response("Lien invalide.", { status: 400 });
  try {
    const result = await launchGoogleConnection(params.get("attempt")!, params.get("token")!);
    return new Response(null, { status: 303, headers: {
      location: result.authorizationUrl,
      "set-cookie": `__Host-endvera-google=${result.cookieNonce}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "cache-control": "no-store", "referrer-policy": "no-referrer",
    } });
  } catch { return new Response("Ce lien a expiré ou a déjà été utilisé. Reviens dans ENDVERA pour reconnecter Google.", { status: 400, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } }); }
}
