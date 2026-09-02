import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  authorityPolicyCommandSchema,
  decideAuthorityEvaluationCommandSchema,
  evaluateActionAuthorityCommandSchema,
} from "@/lib/construction-operating-assistant-r28/contracts";
import {
  authorityPolicyCockpitForUser,
  decideAuthorityEvaluation,
  evaluateActionAuthority,
  processAuthorityPolicyCommand,
} from "@/server/construction-operating-assistant-r28/authority-policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "private, no-store" } as const;

async function authenticate() {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Not signed in." }, { status: 401, headers: responseHeaders }) } as const;
  if (user.role !== "CLIENT" || !user.emailVerified) return { response: NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders }) } as const;
  return { user } as const;
}

export async function GET(request: Request) {
  const authenticated = await authenticate();
  if ("response" in authenticated) return authenticated.response;
  if (!await consumeRateLimit(`construction-mobile-authority-read:${authenticated.user.id}`, { window: 60, max: 60 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: responseHeaders });
  }
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 160) {
    return NextResponse.json({ error: "Invalid authority query." }, { status: 400, headers: responseHeaders });
  }
  try {
    return NextResponse.json(
      await authorityPolicyCockpitForUser({ userId: authenticated.user.id, workspaceId }),
      { headers: responseHeaders },
    );
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
  }
}

export async function POST(request: Request) {
  const authenticated = await authenticate();
  if ("response" in authenticated) return authenticated.response;
  if (!await consumeRateLimit(`construction-mobile-authority-write:${authenticated.user.id}`, { window: 60, max: 30 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: responseHeaders });
  }
  const body = await request.json().catch(() => null);
  try {
    let result: unknown;
    if (authorityPolicyCommandSchema.safeParse(body).success) {
      result = await processAuthorityPolicyCommand({ userId: authenticated.user.id, command: body });
    } else if (evaluateActionAuthorityCommandSchema.safeParse(body).success) {
      result = await evaluateActionAuthority({ userId: authenticated.user.id, command: body });
    } else if (decideAuthorityEvaluationCommandSchema.safeParse(body).success) {
      result = await decideAuthorityEvaluation({ userId: authenticated.user.id, command: body });
    } else {
      return NextResponse.json({ error: "Invalid authority command." }, { status: 400, headers: responseHeaders });
    }
    return NextResponse.json(result, { status: (result as { replayed?: boolean }).replayed ? 200 : 201, headers: responseHeaders });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (/CONFLICT|IMMUTABLE|REQUIRED|UNSAFE|UNREGISTERED|EXPIRED|PROHIBITED|DECIDED|STALE|NOT_DRAFT|NOT_ACTIVE/u.test(code)) {
      return NextResponse.json({ error: code }, { status: 409, headers: responseHeaders });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
  }
}
