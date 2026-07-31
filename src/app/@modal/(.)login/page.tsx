import { redirect } from "next/navigation";
import { googleEnabled } from "@/lib/auth";
import { getSessionUser, roleHome, safeNextParam } from "@/lib/authz";
import { LoginModal } from "@/components/login-modal";

/**
 * The intercepted counterpart to src/app/(public)/login/page.tsx. Next.js
 * routes here instead of the real page for any SOFT navigation to /login —
 * i.e. one that originates from inside the app, like clicking "Sign in" in
 * a nav while reading /workers. The (.) marks it as intercepting a sibling
 * at the same URL level; /login is a root-level segment even though its
 * real page file sits under the (public) route group, since a route group
 * adds no path segment of its own.
 *
 * A hard navigation — refresh, typed URL, bookmark, email link — never
 * matches this file; Next.js renders the real page instead. That is by
 * design: the modal is a shortcut for someone already in the app, not a
 * replacement for /login as a real, linkable, refreshable page.
 */
export default async function InterceptedLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // An already-signed-in visitor gets bounced to their OWN role's home
  // instead of the login form. Without this, clicking "Sign in" while a
  // session is still live (the cookie survives across marketing pages —
  // there is no "log out just by browsing") shows the form anyway; if
  // that account isn't the one someone means to test with, whatever they
  // do next still runs inside the OLD session, which reads as "signing in
  // as a worker still landed me on the client side" even though no new
  // sign-in ever happened.
  const user = await getSessionUser();
  if (user) redirect(roleHome(user.role));

  const params = await searchParams;
  const next = safeNextParam(params.next);
  const applied = params.applied === "1";

  return <LoginModal googleEnabled={googleEnabled} next={next} applied={applied} />;
}
