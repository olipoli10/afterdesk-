import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { constructionMobileAssistantRequestSchema } from "@/lib/construction-operating-assistant-r9/mobile-assistant-contracts";
import {
  constructionMobileAssistantHistoryForUser,
  processConstructionMobileAssistantRequest,
} from "@/server/construction-operating-assistant-r9/mobile-assistant";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

async function authenticatedClient() {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE }) } as const;
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return { response: NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE }) } as const;
  }
  return { user } as const;
}

export async function GET(request: Request) {
  const auth = await authenticatedClient();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(`construction-mobile-assistant-read:${auth.user.id}`, {
    window: 60,
    max: 120,
  });
  if (!allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
  if (!workspaceId || workspaceId.length > 160) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    return NextResponse.json(
      await constructionMobileAssistantHistoryForUser({ userId: auth.user.id, workspaceId }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}

export async function POST(request: Request) {
  const auth = await authenticatedClient();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(`construction-mobile-assistant-write:${auth.user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  const parsed = constructionMobileAssistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    const result = await processConstructionMobileAssistantRequest({
      userId: auth.user.id,
      request: parsed.data,
    });
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: PRIVATE_NO_STORE,
    });
  } catch {
    return NextResponse.json({ error: "Command refused." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
