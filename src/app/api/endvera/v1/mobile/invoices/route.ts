import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  economicCockpitQuerySchema,
  economicCommandSchema,
} from "@/lib/construction-operating-assistant-r21/contracts";
import {
  EconomicEngineConflict,
  economicCockpitForUser,
  processEconomicCommand,
} from "@/server/construction-operating-assistant-r21/economic-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

async function authorizedUser() {
  const user = await getSessionUser();
  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Not signed in." },
        { status: 401, headers: PRIVATE_NO_STORE },
      ),
    } as const;
  }
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return {
      response: NextResponse.json(
        { error: "Not found." },
        { status: 404, headers: PRIVATE_NO_STORE },
      ),
    } as const;
  }
  return { user } as const;
}

export async function GET(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(`construction-mobile-invoices-read:${auth.user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: PRIVATE_NO_STORE },
    );
  }
  const parsed = economicCockpitQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invoice query." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }
  try {
    return NextResponse.json(
      await economicCockpitForUser({ userId: auth.user.id, workspaceId: parsed.data.workspaceId }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(`construction-mobile-invoices-write:${auth.user.id}`, {
    window: 60,
    max: 30,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: PRIVATE_NO_STORE },
    );
  }
  const body = await request.json().catch(() => null);
  const command = economicCommandSchema.safeParse(body);
  if (!command.success) {
    return NextResponse.json(
      { error: "Invalid invoice command." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }
  try {
    return NextResponse.json(
      await processEconomicCommand({ userId: auth.user.id, command: command.data }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch (error) {
    if (error instanceof EconomicEngineConflict) {
      return NextResponse.json(
        { error: error.code },
        { status: 409, headers: PRIVATE_NO_STORE },
      );
    }
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }
}
