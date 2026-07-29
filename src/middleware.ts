import { NextResponse, type NextRequest } from "next/server";

/**
 * Two small jobs:
 * 1. Stamp the requested pathname onto the request so server components can
 *    build the post-login deep link (`/login?next=…`) deterministically.
 *    safeNextPath() in src/lib/authz.ts consumes and re-validates it.
 * 2. Persist the worker-page language choice (?lang=en|tl → cookie) so a
 *    returning visitor keeps their language.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers } });

  if (req.nextUrl.pathname === "/workers") {
    const lang = req.nextUrl.searchParams.get("lang");
    if (lang === "en" || lang === "tl") {
      res.cookies.set("ss-lang", lang, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
  }

  return res;
}

export const config = {
  matcher: ["/client/:path*", "/va/:path*", "/admin/:path*", "/workers"],
};
