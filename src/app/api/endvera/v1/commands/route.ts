import { NextResponse } from "next/server";
import { getSessionUser, consumeRateLimit } from "@/lib/authz";
import { operatingCommandEnvelopeSchema } from "@/lib/construction-operating-assistant-r2/contracts";
import { processAuthenticatedPortalCommand } from "@/server/construction-operating-assistant-r36c/orchestrator";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "CLIENT") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const allowed = await consumeRateLimit(`operating-assistant:${user.id}`, { window: 60, max: 60 });
  if (!allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = operatingCommandEnvelopeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid command envelope." }, { status: 400 });
  try {
    const result = await processAuthenticatedPortalCommand({ userId: user.id, envelope: parsed.data });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch {
    return NextResponse.json({ error: "Command refused." }, { status: 404 });
  }
}
