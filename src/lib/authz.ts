import "server-only";
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
 * Returns true when the request is allowed. Best-effort under extreme
 * concurrency (increment is atomic; a simultaneous window reset can race),
 * which matches Better Auth's own non-atomic storage fallback.
 */
export async function consumeRateLimit(
  key: string,
  { window, max }: { window: number; max: number }
): Promise<boolean> {
  const now = Date.now();
  const windowStart = BigInt(now - window * 1000);

  // Atomic increment when a live window exists for this key.
  const updated = await prisma.rateLimit.updateMany({
    where: { key, lastRequest: { gte: windowStart } },
    data: { count: { increment: 1 } },
  });

  if (updated.count === 0) {
    // No row, or the window lapsed — start a fresh one.
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, lastRequest: BigInt(now) },
      update: { count: 1, lastRequest: BigInt(now) },
    });
    return true;
  }

  const row = await prisma.rateLimit.findUnique({
    where: { key },
    select: { count: true },
  });
  return (row?.count ?? 1) <= max;
}
