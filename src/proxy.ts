import { NextResponse, type NextRequest } from "next/server";

/**
 * Two small jobs:
 * 1. Stamp the requested pathname onto the request so server components can
 *    build the post-login deep link (`/login?next=…`) deterministically.
 *    safeNextPath() in src/lib/authz.ts consumes and re-validates it.
 * 2. Persist each public page's language choice (?lang=… → cookie) so a
 *    returning visitor keeps their language. Both pages offer all four
 *    languages, but the cookies stay separate on purpose: a French client
 *    and a Filipino worker are different people reading different pages,
 *    and one choosing FIL must not flip the other's page.
 */
const LANGS = ["en", "fr", "es", "tl"];
const LANG_COOKIE: Record<string, { name: string; allowed: string[] }> = {
  "/": { name: "ss-lang-client", allowed: LANGS },
  "/workers": { name: "ss-lang-worker", allowed: LANGS },
  // /academy is worker-side and shares their cookie: someone who picked FIL on
  // /workers should land on the Academy in FIL, and a worker who arrives on
  // the shared /academy link first should keep their choice when they click
  // through to apply. Without this, the page reads the cookie it can never set.
  "/academy": { name: "ss-lang-worker", allowed: LANGS },
  // The two DOCUMENT pages are linked from both homepage footers, so neither
  // audience owns them. They get a cookie of their own and read a fallback
  // chain (doc → client → worker → en, see src/lib/i18n/docs.ts): a French
  // client and a Filipino worker each arrive in their own language, and
  // switching language here still cannot flip either homepage.
  "/about": { name: "ss-lang-doc", allowed: LANGS },
  "/how-it-works": { name: "ss-lang-doc", allowed: LANGS },
  // /services is linked from both homepage headers (see MobileMenu on
  // src/app/page.tsx and src/app/workers/page.tsx) same as the two document
  // pages above, so it shares their cookie and fallback chain rather than
  // getting one of its own.
  "/services": { name: "ss-lang-doc", allowed: LANGS },
};

export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers } });

  const rule = LANG_COOKIE[req.nextUrl.pathname];
  if (rule) {
    const lang = req.nextUrl.searchParams.get("lang");
    if (lang && rule.allowed.includes(lang)) {
      res.cookies.set(rule.name, lang, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/",
    "/workers",
    "/academy",
    "/about",
    "/how-it-works",
    "/services",
    "/notifications",
    "/client/:path*",
    "/va/:path*",
    "/admin/:path*",
  ],
};
