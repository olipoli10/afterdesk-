import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { textAssistFoundationManifest } from "@/lib/construction-operating-assistant-r38a/text-assist-foundation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "CLIENT" || !user.emailVerified) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  }
  const allowed = await consumeRateLimit(`construction-mobile-text-assist-foundation:${user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  return NextResponse.json(textAssistFoundationManifest(), { headers: PRIVATE_NO_STORE });
}
