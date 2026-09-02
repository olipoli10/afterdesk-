import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { commercialCommandSchema } from "@/lib/construction-operating-assistant-r34/contracts";
import {
  commercialPortfolioForAdmin,
  processCommercialCommand,
} from "@/server/construction-operating-assistant-r34/commercial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

async function adminUser() {
  const user = await getSessionUser();
  return user?.role === "ADMIN" && user.emailVerified ? user : null;
}

export async function GET() {
  const user = await adminUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  if (!await consumeRateLimit(`construction-commercial-admin-read:${user.id}`, { window: 60, max: 60 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  return NextResponse.json(await commercialPortfolioForAdmin({ actorId: user.id }), { headers: PRIVATE_NO_STORE });
}

export async function POST(request: Request) {
  const user = await adminUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  if (!await consumeRateLimit(`construction-commercial-admin-write:${user.id}`, { window: 60, max: 20 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const body = await request.json().catch(() => null);
  const parsed = commercialCommandSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid commercial command." }, { status: 400, headers: PRIVATE_NO_STORE });
  try {
    const result = await processCommercialCommand({ actorId: user.id, command: parsed.data });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: PRIVATE_NO_STORE });
  } catch (error) {
    const code = error instanceof Error ? error.message : "COMMERCIAL_COMMAND_REFUSED";
    return NextResponse.json({ error: code }, { status: 409, headers: PRIVATE_NO_STORE });
  }
}
