import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { constructionMobileBootstrapForUser } from "@/server/construction-operating-assistant-r8/bootstrap";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const allowed = await consumeRateLimit(`construction-mobile-bootstrap:${user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    await constructionMobileBootstrapForUser({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
    }),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
