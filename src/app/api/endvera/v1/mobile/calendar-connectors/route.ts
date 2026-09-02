import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { calendarConnectorApiCommandSchema } from "@/lib/construction-operating-assistant-r23/contracts";
import {
  calendarConnectorCockpitForUser,
  prepareCalendarConnectionR23,
  prepareCalendarWorkR23,
  revokeCalendarConnectionR23,
} from "@/server/construction-operating-assistant-r23/connectors";

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
  const allowed = await consumeRateLimit(
    `construction-mobile-calendar-connectors-read:${auth.user.id}`,
    { window: 60, max: 60 },
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 160) {
    return NextResponse.json({ error: "Invalid calendar connector query." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    return NextResponse.json(
      await calendarConnectorCockpitForUser({ userId: auth.user.id, workspaceId }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}

const CONFLICT_CODES = new Set([
  "CALENDAR_CONNECTOR_IDEMPOTENCY_CONFLICT",
  "CALENDAR_CONNECTOR_STALE_STATE",
  "CALENDAR_CONNECTOR_ALREADY_CONNECTED",
  "CALENDAR_CANONICAL_FINGERPRINT_MISMATCH",
]);

export async function POST(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(
    `construction-mobile-calendar-connectors-write:${auth.user.id}`,
    { window: 60, max: 30 },
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const body = await request.json().catch(() => null);
  const parsed = calendarConnectorApiCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid calendar connector command." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    const result = parsed.data.action === "PREPARE_CONNECTION"
      ? await prepareCalendarConnectionR23({ userId: auth.user.id, command: parsed.data })
      : parsed.data.action === "REVOKE_LOCAL"
        ? await revokeCalendarConnectionR23({ userId: auth.user.id, command: parsed.data })
        : await prepareCalendarWorkR23({ userId: auth.user.id, command: parsed.data });
    return NextResponse.json(result, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (CONFLICT_CODES.has(code)) {
      return NextResponse.json({ error: code }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
