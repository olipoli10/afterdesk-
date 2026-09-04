import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { constructionMobileAssistantRequestSchema } from "@/lib/construction-operating-assistant-r9/mobile-assistant-contracts";
import {
  constructionMobileAssistantHistoryForUser,
} from "@/server/construction-operating-assistant-r9/mobile-assistant";
import { processUnifiedAssistantRequest } from "@/server/construction-operating-assistant-r36c/orchestrator";
import { projectBrainAssistantCommandSchema } from "@/lib/construction-operating-assistant-r36y/project-brain-assistant-memory";
import { applyProjectBrainAssistantCommandForUser } from "@/server/construction-operating-assistant-r36y/project-brain-assistant-memory";

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
  const memoryCommand = projectBrainAssistantCommandSchema.safeParse(body);
  if (memoryCommand.success) {
    try {
      const result = await applyProjectBrainAssistantCommandForUser({ userId: auth.user.id, command: memoryCommand.data });
      return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: PRIVATE_NO_STORE });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (/STALE|CONFLICT|AMBIGUOUS/u.test(code)) return NextResponse.json({ error: "Command conflict." }, { status: 409, headers: PRIVATE_NO_STORE });
      if (/UNAVAILABLE|LIMITATION|CITATION|CORRUPT/u.test(code)) return NextResponse.json({ error: "Command unavailable." }, { status: 422, headers: PRIVATE_NO_STORE });
      return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
    }
  }
  const parsed = constructionMobileAssistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    const result = await processUnifiedAssistantRequest({
      userId: auth.user.id,
      channel: "MOBILE_APP",
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
