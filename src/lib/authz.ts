import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type SessionUser } from "@/lib/auth";

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
  return { id: u.id, email: u.email, name: u.name, role: u.role as Role };
}

/** Requires a logged-in user; redirects to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
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
