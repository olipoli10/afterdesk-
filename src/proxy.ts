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

// The eight DOCUMENT pages — linked from both homepage footers/nav, owned by
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
  "/login": { name: "ss-lang-client", allowed: LANGS },
  "/register": { name: "ss-lang-client", allowed: LANGS },
  "/verify-email": { name: "ss-lang-client", allowed: LANGS },
  "/workers": { name: "ss-lang-worker", allowed: LANGS },
  // /academy is worker-side and shares their cookie: someone who picked FIL on
  // /workers should land on the Academy in FIL, and a worker who arrives on
  // the shared /academy link first should keep their choice when they click
  // through to apply. Without this, the page reads the cookie it can never set.
  "/academy": { name: "ss-lang-worker", allowed: LANGS },
  ...Object.fromEntries(DOC_PATHS.map((p) => [p, { name: "ss-lang-doc", allowed: LANGS }])),
};

export function proxy(req: NextRequest) {
  /* PREVIEW WRITE GATE (1.4B.1). The Vercel Preview environment shares the
     Sensitive DATABASE_URL family with Production and its isolation cannot
     be proven from the CLI (sensitive values are not retrievable). Until a
     provably isolated preview database exists, a preview deployment must
     never write: every non-idempotent method is refused before any handler
     runs. VERCEL_ENV is unset locally and "production" in production, so
     this gate has zero effect anywhere else. */
  if (process.env.VERCEL_ENV === "preview") {
    /* 1.4B.4: the public V5/A2 preview needs NO API at all - and API GETs
       are not read-only here (cron maintenance runs payments/sweeps, the
       download GET writes a fileAccessLog, Better Auth GET can process
       stateful callbacks). The ENTIRE /api surface is refused, every
       method. Ordinary pages keep GET/HEAD/OPTIONS; page POSTs (Server
       Actions) stay refused by the general rule. Production and local are
       untouched - this whole block is preview-only. */
    const { pathname } = req.nextUrl;
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "preview exposes no API: the public preview is a read-only site" },
        { status: 403 },
      );
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return NextResponse.json(
        { error: "preview is read-only: database isolation is not proven" },
        { status: 403 },
      );
    }
  }

  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);

  const rule =
    LANG_COOKIE[req.nextUrl.pathname] ??
    (req.nextUrl.pathname === "/client" || req.nextUrl.pathname.startsWith("/client/")
      ? { name: "ss-lang-client", allowed: LANGS }
      : null);
  const explicitLang = req.nextUrl.searchParams.get("lang");
  const validExplicitLang = explicitLang && LANGS.includes(explicitLang) ? explicitLang : null;
  const resolvedLang = validExplicitLang ?? (
    rule?.name === "ss-lang-client"
      ? req.cookies.get("ss-lang-client")?.value
      : rule?.name === "ss-lang-worker"
        ? req.cookies.get("ss-lang-worker")?.value
        : rule?.name === "ss-lang-doc"
          ? req.cookies.get("ss-lang-doc")?.value ?? req.cookies.get("ss-lang-client")?.value ?? req.cookies.get("ss-lang-worker")?.value
          : null
  );
  headers.set("x-site-lang", resolvedLang && LANGS.includes(resolvedLang) ? resolvedLang : "en");

  const res = NextResponse.next({ request: { headers } });

  if (rule) {
    const lang = explicitLang;
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

// The matcher must be statically analyzable at build time. Phase 1.4B.2
// replaced the hand-maintained page allowlist with the official
// negative-lookahead form (see the installed proxy.md, "Negative matching"):
// EVERY application request - pages, page-bound Server Actions (Next 16
// Server Functions are POSTs to the page route that uses them), /api and
// all current AND future dynamic routes - now flows through the proxy, so
// the preview write gate can actually hold its invariant. Only proven
// framework/static resources are excluded. The language-cookie logic above
// is keyed by exact pathname and is unaffected by the wider match.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - manifest.webmanifest, icon.svg, opengraph-image (app metadata)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|icon.svg|opengraph-image).*)",
  ],
};
