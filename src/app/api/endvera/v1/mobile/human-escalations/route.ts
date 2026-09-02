import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  humanEscalationCockpitQuerySchema,
  humanEscalationCommandSchema,
} from "@/lib/construction-operating-assistant-r22/contracts";
import {
  HumanEscalationCockpitConflict,
  humanEscalationCockpitForUser,
  processHumanEscalationCommand,
} from "@/server/construction-operating-assistant-r22/human-escalation-cockpit";

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
  const allowed = await consumeRateLimit(
    `construction-mobile-human-support-read:${auth.user.id}`,
    { window: 60, max: 60 },
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: PRIVATE_NO_STORE },
    );
  }
  const parsed = humanEscalationCockpitQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid human-support query." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }
  try {
    return NextResponse.json(
      await humanEscalationCockpitForUser({
        userId: auth.user.id,
        workspaceId: parsed.data.workspaceId,
      }),
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
  const allowed = await consumeRateLimit(
    `construction-mobile-human-support-write:${auth.user.id}`,
    { window: 60, max: 30 },
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: PRIVATE_NO_STORE },
    );
  }
  const body = await request.json().catch(() => null);
  const parsed = humanEscalationCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid human-support command." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }
  try {
    return NextResponse.json(
      await processHumanEscalationCommand({
        userId: auth.user.id,
        command: parsed.data,
      }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch (error) {
    if (error instanceof HumanEscalationCockpitConflict) {
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
