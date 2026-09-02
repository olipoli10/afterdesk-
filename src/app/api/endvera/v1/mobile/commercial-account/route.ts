import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { commercialAccountForUser } from "@/server/construction-operating-assistant-r34/commercial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "CLIENT" || !user.emailVerified) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  }
  if (!await consumeRateLimit(`construction-commercial-account:${user.id}`, { window: 60, max: 60 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 200) {
    return NextResponse.json({ error: "Invalid workspace." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    return NextResponse.json(await commercialAccountForUser({ userId: user.id, workspaceId }), { headers: PRIVATE_NO_STORE });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
