import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { secretaryBroadcastCockpitForUser } from "@/server/construction-operating-assistant-r38e/broadcast-preparation";
import { approveSecretaryBroadcastCommandSchema } from "@/lib/construction-operating-assistant-r38f/contracts";
import { approveSecretaryBroadcast } from "@/server/construction-operating-assistant-r38f/broadcast-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
  const allowed = await consumeRateLimit(`construction-secretary-broadcast-read:${user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
  if (!workspaceId || workspaceId.length > 160) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    return NextResponse.json(
      await secretaryBroadcastCockpitForUser({ userId: user.id, workspaceId }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
  const allowed = await consumeRateLimit(`construction-secretary-broadcast-write:${user.id}`, {
    window: 60,
    max: 30,
  });
  if (!allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  const body = await request.json().catch(() => null);
  const command = approveSecretaryBroadcastCommandSchema.safeParse(body);
  if (!command.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE_NO_STORE });
  try {
    const result = await approveSecretaryBroadcast({ userId: user.id, command: command.data });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: PRIVATE_NO_STORE });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (/R38F_(SECOND_APPROVAL_REFUSED|EXACT_APPROVAL_MISMATCH|BROADCAST_NOT_PREPARED)/u.test(code)) {
      return NextResponse.json({ error: code }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
