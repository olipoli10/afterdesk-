import "server-only";
import { randomUUID } from "crypto";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type Role = "CLIENT" | "VA" | "ADMIN";

export function roleHome(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "VA":
      return "/va";
    default:
      return "/client";
  }
}

/**
 * True when this request was started from one of our own pages instead of by
 * arriving at the bare root/storefront. Someone opening a public entry page
 * cold — bookmark, typed address, a link from elsewhere — is opening the
 * product; someone who clicked their way here from inside Endvera is
 * ASKING for the marketing/storefront page, and that is the difference a
 * signed-in bounce has to respect. Shared by `/` and `/workers` so the two
 * doors can never drift into different behavior.
 *
 * The referrer is the signal, and site-wide Referrer-Policy: same-origin
 * (next.config.ts) is what makes it a trustworthy one: a referrer naming our
 * own host can only have come from our own page. A next/link click carries it
 * too — the router fetches the RSC payload with a plain fetch() from the page
 * you are leaving. Do not "improve" this with the RSC or Next-URL header:
 * neither reaches a Server Component. Flight headers are stripped before
 * headers() (server/async-storage/request-store.js) and Next-URL is deleted
 * for any path that cannot be intercepted (server/base-server.js), which
 * neither "/" nor "/workers" can. Both were measured null here, not assumed.
 */
export async function arrivedFromInsideTheApp(): Promise<boolean> {
  const h = await headers();
  const host = h.get("host");
  const referer = h.get("referer");
  if (!host || !referer) return false;
  // Prefix match rather than new URL(): a malformed Referer is
  // attacker-controlled and must never be able to throw on a public page.
  return referer.startsWith(`https://${host}/`) || referer.startsWith(`http://${host}/`);
}

/**
 * Per-request memoized session lookup. Layouts and pages each call
 * requireRole → getSessionUser, so without cache() every navigation costs two
 * identical database session queries. cache() dedupes within a single render
 * pass only — it does NOT weaken the "demoted account loses access on the
 * next request" guarantee documented in src/lib/auth.ts.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as unknown as SessionUser & { role: string };
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    emailVerified: Boolean(u.emailVerified),
  };
});

/**
 * Best-effort server-side derivation of the pathname being requested, for the
 * post-login deep link. Next.js only exposes the path via request headers
 * (`next-url` on client-router RSC navigations; `x-pathname`/`x-invoke-path`
 * when Proxy or the dev server provide them), so on a cold direct load
 * this may return null — in that case login simply lands on the role home.
 *
 * Safety: only a relative path is ever returned — no origin, no
 * protocol-relative `//`, no query string or fragment (never user data).
 */
async function safeNextPath(): Promise<string | null> {
  const h = await headers();
  const raw = h.get("next-url") ?? h.get("x-pathname") ?? h.get("x-invoke-path");
  if (!raw) return null;
  // Path component only — drop query/hash so no user data rides the redirect.
  const path = raw.split("?")[0].split("#")[0];
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  if (path === "/" || path === "/login" || path.startsWith("/login/")) return null;
  return path;
}

/**
 * Validates the `?next=` a login page (full or modal) was reached with —
 * never trust it past this. Shared by both /login (src/app/(public)/login)
 * and its intercepted modal (src/app/@modal/(.)login) so a hardening fix
 * made in one can never silently miss the other.
 *
 * Same-origin relative paths only: no protocol-relative `//`, no
 * backslashes (browsers normalize "/\evil.com" to "//evil.com").
 */
export function safeNextParam(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return value;
  }
  return undefined;
}

/**
 * Requires a signed-in account. An unauthenticated visitor is bounced to
 * /login with `?next=<attempted path>` so the login form can return them to
 * the page they asked for (bookmarked task URLs, future email links).
 *
 * Email verification is a hard product boundary: unverified sessions can
 * reach the verification page, but not task, worker or operator data.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const next = await safeNextPath();
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  if (!user.emailVerified) redirect("/verify-email");
  return user;
}

/**
 * Hard role gate — used by every layout, server action and route handler.
 * A user with the wrong role is sent to their own home, never shown an error
 * that reveals what exists behind the gate.
 */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) redirect(roleHome(user.role));
  return user;
}

/**
 * VA gate for anything beyond the account page: pool, claim, task work, file
 * downloads. Read from the database on every call — a VA rejected or
 * suspended mid-session loses access on their next request, not whenever a
 * cached session happens to expire.
 */
export async function requireApprovedVa(): Promise<SessionUser> {
  const user = await requireRole("VA");
  const profile = await prisma.vaProfile.findUnique({
    where: { userId: user.id },
    select: { status: true },
  });
  if (profile?.status !== "approved") redirect("/va");
  return user;
}

/** Non-redirecting variant for route handlers (they return 404, not a redirect). */
export async function isApprovedVa(userId: string): Promise<boolean> {
  const profile = await prisma.vaProfile.findUnique({
    where: { userId },
    select: { status: true },
  });
  return profile?.status === "approved";
}

/**
 * Fixed-window rate limit backed by Better Auth's RateLimit table (the same
 * database storage its HTTP route uses), for code paths that never pass
 * through /api/auth/* — server actions and route handlers. Synthetic keys
 * (`action:...`, `upload:...`) cannot collide with Better Auth's own
 * `<ip><path>` keys.
 *
 * A single INSERT ... ON CONFLICT does the read-decide-write in one atomic
 * statement: Postgres serializes concurrent upserts on the same key via the
 * row's own lock, so a burst of concurrent requests can never all observe
 * "no live window yet" and all reset the counter to 1 the way two separate
 * round trips (an updateMany, then a fallback upsert) could. Returns true
 * when the request is allowed.
 */
export async function consumeRateLimit(
  key: string,
  { window, max }: { window: number; max: number }
): Promise<boolean> {
  const now = BigInt(Date.now());
  const windowStart = now - BigInt(window * 1000);

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${randomUUID()}, ${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."lastRequest" >= ${windowStart} THEN "RateLimit"."count" + 1
        ELSE 1
      END,
      "lastRequest" = CASE
        WHEN "RateLimit"."lastRequest" >= ${windowStart} THEN "RateLimit"."lastRequest"
        ELSE ${now}
      END
    RETURNING "count"
  `;
  return (rows[0]?.count ?? 1) <= max;
}
