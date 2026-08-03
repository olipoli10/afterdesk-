import { NextResponse, type NextRequest } from "next/server";

/**
 * Two small jobs:
 * 1. Stamp the requested pathname onto the request so server components can
 *    build the post-login deep link (`/login?next=…`) deterministically.
 *    safeNextPath() in src/lib/authz.ts consumes and re-validates it.
 * 2. Persist each public page's language choice (?lang=… → cookie) so a
 *    returning visitor keeps their language. Both audience pages offer all
 *    four languages, but the cookies stay separate on purpose: a French
 *    client and a Filipino worker are different people reading different
 *    pages, and one choosing FIL must not flip the other's page.
 */
const LANGS = ["en", "fr", "es", "tl"];

// The seven DOCUMENT pages — linked from both homepage footers/nav, owned by
// neither audience — share one cookie and a fallback chain (doc → client →
// worker → en, see docLangOf in src/lib/i18n/docs.ts).
const DOC_PATHS = [
  "/about",
  "/how-it-works",
  "/services",
  "/security",
  "/privacy",
  "/terms",
  "/acceptable-use",
  "/ledger",
];

const LANG_COOKIE: Record<string, { name: string; allowed: string[] }> = {
  "/": { name: "ss-lang-client", allowed: LANGS },
  "/workers": { name: "ss-lang-worker", allowed: LANGS },
  // /academy is worker-side and shares their cookie: someone who picked FIL on
  // /workers should land on the Academy in FIL, and a worker who arrives on
  // the shared /academy link first should keep their choice when they click
  // through to apply. Without this, the page reads the cookie it can never set.
  "/academy": { name: "ss-lang-worker", allowed: LANGS },
  ...Object.fromEntries(DOC_PATHS.map((p) => [p, { name: "ss-lang-doc", allowed: LANGS }])),
};

export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers } });

  const rule = LANG_COOKIE[req.nextUrl.pathname];
  if (rule) {
    const lang = req.nextUrl.searchParams.get("lang");
    if (lang && rule.allowed.includes(lang)) {
      const cookieOpts = {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
      };
      res.cookies.set(rule.name, lang, cookieOpts);
      // Also remember this as the most recently, EXPLICITLY chosen language
      // anywhere on the site. The document family falls back through
      // ss-lang-client and ss-lang-worker when ss-lang-doc is unset — which
      // it usually is, since most visits land here via a plain nav link with
      // no ?lang= of its own — so without this the fallback silently follows
      // whichever of those two cookies happens to be set, in a fixed
      // doc→client→worker priority, no matter how stale. A worker-track
      // reader who once tried Spanish on /workers, then spends a whole later
      // session reading the client side in English, could land on /terms in
      // Spanish with no visible cause: neither cookie was "wrong", the
      // priority order just favored the older one. Writing ss-lang-doc on
      // EVERY explicit pick — on / and /workers too, not just the doc pages
      // themselves — makes the fallback track whichever choice was made
      // last, which is what a reader actually expects "changing the
      // language" to do. This never touches ss-lang-client or ss-lang-worker
      // themselves, so switching language on /workers still can never flip
      // what / shows, and vice versa — only the shared, ownerless document
      // family is affected.
      if (rule.name !== "ss-lang-doc") {
        res.cookies.set("ss-lang-doc", lang, cookieOpts);
      }
    }
  }

  return res;
}

// The matcher must be statically analyzable at build time — Next.js parses
// this literal from source, so it cannot be built from DOC_PATHS by spread.
// Kept in sync with DOC_PATHS by hand; the two arrays are meant to be
// identical.
export const config = {
  matcher: [
    "/",
    "/workers",
    "/academy",
    "/about",
    "/how-it-works",
    "/services",
    "/security",
    "/privacy",
    "/terms",
    "/acceptable-use",
    "/ledger",
    "/notifications",
    "/client/:path*",
    "/va/:path*",
    "/admin/:path*",
  ],
};
