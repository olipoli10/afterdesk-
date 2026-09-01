import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { manageCalendarConnectorSchema } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import {
  calendarConnectorStatusForUser,
  prepareCalendarConnector,
  revokeCalendarConnector,
} from "@/server/construction-operating-assistant-r3/connectors";

const statusQuerySchema = z.object({ workspaceId: z.string().min(1).max(160) }).strict();

async function requireClient() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  if (user.role !== "CLIENT") return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) } as const;
  const allowed = await consumeRateLimit(`calendar-connector:${user.id}`, { window: 60, max: 30 });
  if (!allowed) return { error: NextResponse.json({ error: "Too many requests." }, { status: 429 }) } as const;
  return { user } as const;
}

export async function GET(request: Request) {
  const auth = await requireClient();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const parsed = statusQuerySchema.safeParse({ workspaceId: url.searchParams.get("workspaceId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid status request." }, { status: 400 });
  try {
    return NextResponse.json(await calendarConnectorStatusForUser({
      userId: auth.user.id,
      workspaceId: parsed.data.workspaceId,
    }));
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const auth = await requireClient();
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = manageCalendarConnectorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid connector command." }, { status: 400 });
  try {
    const result = parsed.data.action === "PREPARE_CONNECTION"
      ? await prepareCalendarConnector({ userId: auth.user.id, command: parsed.data })
      : await revokeCalendarConnector({ userId: auth.user.id, command: parsed.data });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CONNECTOR_ALREADY_CONNECTED") {
      return NextResponse.json({ error: "Connector already connected." }, { status: 409 });
    }
    return NextResponse.json({ error: "Connector command refused." }, { status: 404 });
  }
}
