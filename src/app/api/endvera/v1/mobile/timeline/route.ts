import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { projectTimelineQuerySchema } from "@/lib/construction-operating-assistant-r15/timeline";
import { projectTimelineForUser } from "@/server/construction-operating-assistant-r15/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  }
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
  const allowed = await consumeRateLimit(`construction-mobile-timeline:${user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = projectTimelineQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid timeline query." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    return NextResponse.json(
      await projectTimelineForUser({ userId: user.id, ...parsed.data }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
