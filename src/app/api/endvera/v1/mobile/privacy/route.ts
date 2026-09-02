import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { privacyCommandSchema } from "@/lib/construction-operating-assistant-r30/contracts";
import {
  privacyCockpitForUser,
  processPrivacyCommand,
} from "@/server/construction-operating-assistant-r30/privacy";

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
  if (!await consumeRateLimit(`construction-mobile-privacy-read:${user.id}`, { window: 60, max: 60 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 160) return NextResponse.json({ error: "Invalid privacy query." }, { status: 400, headers: PRIVATE_NO_STORE });
  try {
    return NextResponse.json(await privacyCockpitForUser({ userId: user.id, workspaceId }), { headers: PRIVATE_NO_STORE });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}

export async function POST(request: Request) {
  const user = await clientUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  if (!await consumeRateLimit(`construction-mobile-privacy-write:${user.id}`, { window: 60, max: 20 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const body = await request.json().catch(() => null);
  const parsed = privacyCommandSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid privacy command." }, { status: 400, headers: PRIVATE_NO_STORE });
  try {
    const result = await processPrivacyCommand({ userId: user.id, command: parsed.data });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: PRIVATE_NO_STORE });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (/CONFLICT|INCOMPLETE|IMMUTABLE|UNSAFE|PROTECTED|UNAUTHORIZED|REQUIRED|ACTIVE|ELIGIBLE|TOMBSTONED|RETAIN|CHANGED|REFUSED/u.test(code)) {
      return NextResponse.json({ error: code }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
