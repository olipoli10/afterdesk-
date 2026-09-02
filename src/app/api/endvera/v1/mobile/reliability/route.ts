import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { reliabilityCommandSchema } from "@/lib/construction-operating-assistant-r31/contracts";
import {
  processReliabilityCommand,
  reliabilityCockpitForUser,
} from "@/server/construction-operating-assistant-r31/reliability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

async function clientUser() {
  const user = await getSessionUser();
  return user?.role === "CLIENT" && user.emailVerified ? user : null;
}

export async function GET(request: Request) {
  const user = await clientUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  if (!await consumeRateLimit(`construction-mobile-reliability-read:${user.id}`, { window: 60, max: 60 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 160) return NextResponse.json({ error: "Invalid reliability query." }, { status: 400, headers: PRIVATE_NO_STORE });
  try {
    return NextResponse.json(await reliabilityCockpitForUser({ userId: user.id, workspaceId }), { headers: PRIVATE_NO_STORE });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}

export async function POST(request: Request) {
  const user = await clientUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  if (!await consumeRateLimit(`construction-mobile-reliability-write:${user.id}`, { window: 60, max: 20 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const body = await request.json().catch(() => null);
  const parsed = reliabilityCommandSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid reliability command." }, { status: 400, headers: PRIVATE_NO_STORE });
  try {
    const result = await processReliabilityCommand({ userId: user.id, command: parsed.data });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: PRIVATE_NO_STORE });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (/CONFLICT|MISMATCH|REQUIRED|REFUSED|NOT_OPEN|NOT_PREPARED|ALREADY|NO_LONGER|INCOMPLETE|INVALID/u.test(code)) {
      return NextResponse.json({ error: code }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
