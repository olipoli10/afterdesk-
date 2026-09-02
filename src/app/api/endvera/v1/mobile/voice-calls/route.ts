import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { prepareOutboundCallWorkCommandSchema } from "@/lib/construction-operating-assistant-r25/contracts";
import {
  prepareOutboundCallWorkR25,
  voiceCallsCockpitForUserR25,
} from "@/server/construction-operating-assistant-r25/voice-calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

async function authorizedUser() {
  const user = await getSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE }) } as const;
  }
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return { response: NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE }) } as const;
  }
  return { user } as const;
}

export async function GET(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(`construction-mobile-voice-read:${auth.user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 160) {
    return NextResponse.json({ error: "Invalid voice query." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    return NextResponse.json(
      await voiceCallsCockpitForUserR25({ userId: auth.user.id, workspaceId }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}

const CONFLICT_CODES = new Set([
  "CALL_WORK_IDEMPOTENCY_CONFLICT",
  "COMMERCIAL_AUTOMATED_CALL_PROHIBITED",
  "VOICE_IDENTITY_REQUIRED",
  "DISCLOSURE_VERSION_REQUIRED",
]);

export async function POST(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(`construction-mobile-voice-write:${auth.user.id}`, {
    window: 60,
    max: 20,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const body = await request.json().catch(() => null);
  const command = prepareOutboundCallWorkCommandSchema.safeParse(body);
  if (!command.success) {
    return NextResponse.json({ error: "Invalid call-work command." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    const result = await prepareOutboundCallWorkR25({ userId: auth.user.id, command: command.data });
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: PRIVATE_NO_STORE,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (CONFLICT_CODES.has(code)) {
      return NextResponse.json({ error: code }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
