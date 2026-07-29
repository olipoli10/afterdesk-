import "server-only";
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

export async function getSessionUser(): Promise<SessionUser | null> {
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
}

/**
 * Requires a signed-in account with a verified email address. Unverified
 * accounts are held at the code-entry screen — they cannot submit tasks, claim
 * work, or reach any dashboard.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
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
