import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  followUpEngineCommandSchema,
  followUpQueueQuerySchema,
} from "@/lib/construction-operating-assistant-r20/contracts";
import {
  FollowUpEngineConflict,
  followUpQueueForUser,
  processFollowUpEngineCommand,
} from "@/server/construction-operating-assistant-r20/follow-up-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

async function authorizedUser() {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE }) } as const;
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return { response: NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE }) } as const;
  }
  return { user } as const;
}

export async function GET(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(`construction-mobile-follow-ups-read:${auth.user.id}`, { window: 60, max: 60 });
  if (!allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  const parsed = followUpQueueQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid follow-up query." }, { status: 400, headers: PRIVATE_NO_STORE });
  try {
    return NextResponse.json(await followUpQueueForUser({ userId: auth.user.id, ...parsed.data }), { headers: PRIVATE_NO_STORE });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}

export async function POST(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(`construction-mobile-follow-ups-write:${auth.user.id}`, { window: 60, max: 30 });
  if (!allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  const body = await request.json().catch(() => null);
  const command = followUpEngineCommandSchema.safeParse(body);
  if (!command.success) return NextResponse.json({ error: "Invalid follow-up command." }, { status: 400, headers: PRIVATE_NO_STORE });
  try {
    return NextResponse.json(
      await processFollowUpEngineCommand({ userId: auth.user.id, command: command.data }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch (error) {
    if (error instanceof FollowUpEngineConflict) {
      return NextResponse.json({ error: error.code }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
