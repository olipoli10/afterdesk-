import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { projectProvenanceQuerySchema } from "@/lib/construction-operating-assistant-r29/provenance";
import { projectProvenanceForUser } from "@/server/construction-operating-assistant-r29/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "private, no-store" } as const;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: responseHeaders });
  if (user.role !== "CLIENT" || !user.emailVerified) return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
  if (!await consumeRateLimit(`construction-mobile-provenance:${user.id}`, { window: 60, max: 60 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: responseHeaders });
  }
  const parsed = projectProvenanceQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid provenance query." }, { status: 400, headers: responseHeaders });
  try {
    return NextResponse.json(await projectProvenanceForUser({ userId: user.id, ...parsed.data }), { headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: responseHeaders });
  }
}
