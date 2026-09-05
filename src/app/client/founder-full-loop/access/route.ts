import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  FOUNDER_EMAIL,
  FOUNDER_PASSWORD,
  FOUNDER_TEST_COOKIE,
  FOUNDER_TEST_ROUTE,
  assertLoopbackHost,
  consumeFounderAccessToken,
} from "@/server/construction-operating-assistant-r38/founder-test";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertLoopbackHost(request.headers.get("host"));
    const token = request.nextUrl.searchParams.get("token");
    if (!token) return new NextResponse("Accès local refusé.", { status: 404 });
    const session = await consumeFounderAccessToken(token);
    const authResponse = await auth.api.signInEmail({
      headers: request.headers,
      body: { email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD, rememberMe: false },
      asResponse: true,
    });
    if (!authResponse.ok) return new NextResponse("Connexion synthétique refusée.", { status: 404 });
    const response = NextResponse.redirect(new URL(FOUNDER_TEST_ROUTE, request.url));
    response.cookies.set(FOUNDER_TEST_COOKIE, session.sessionId, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: FOUNDER_TEST_ROUTE,
      maxAge: 6 * 60 * 60,
    });
    // NextResponse.cookies.set rewrites the Set-Cookie header, so append the
    // Better Auth cookies after the founder-session cookie has been written.
    const setCookies = authResponse.headers.getSetCookie();
    for (const cookie of setCookies) response.headers.append("set-cookie", cookie);
    return response;
  } catch {
    return new NextResponse("Accès local refusé.", { status: 404 });
  }
}
