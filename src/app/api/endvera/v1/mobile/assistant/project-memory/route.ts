import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { projectBrainAssistantMemoryForUser } from "@/server/construction-operating-assistant-r36y/project-brain-assistant-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  if (user.role !== "CLIENT" || !user.emailVerified) return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  if (!await consumeRateLimit(`construction-mobile-project-memory-read:${user.id}`, { window: 60, max: 120 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const url = new URL(request.url);
  const allowed = new Set(["workspaceId", "projectId"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE_NO_STORE });
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  const projectId = url.searchParams.get("projectId")?.trim();
  if (!workspaceId || !projectId || workspaceId.length > 160 || projectId.length > 160) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE_NO_STORE });
  try {
    return NextResponse.json(await projectBrainAssistantMemoryForUser({ userId: user.id, workspaceId, projectId }), { headers: PRIVATE_NO_STORE });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
