import { NextRequest, NextResponse } from "next/server";
import {
  FOUNDER_TEST_COOKIE,
  FOUNDER_TEST_ROUTE,
  assertLoopbackHost,
  consumeFounderAccessToken,
} from "@/server/construction-operating-assistant-r38/founder-test";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const host = request.headers.get("host");
    assertLoopbackHost(host);
    const token = request.nextUrl.searchParams.get("token");
    if (!token) return new NextResponse("Accès local refusé.", { status: 404 });
    const session = await consumeFounderAccessToken(token);
    const response = NextResponse.redirect(new URL(FOUNDER_TEST_ROUTE, `http://${host}`));
    response.cookies.set(FOUNDER_TEST_COOKIE, session.sessionId, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: FOUNDER_TEST_ROUTE,
      maxAge: 6 * 60 * 60,
    });
    return response;
  } catch {
    return new NextResponse("Accès local refusé.", { status: 404 });
  }
}
