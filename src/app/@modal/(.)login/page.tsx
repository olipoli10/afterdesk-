import { googleEnabled } from "@/lib/auth";
import { getSessionUser, safeNextParam } from "@/lib/authz";
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
  // NEVER redirect() from this file. It populates a parallel slot, and an
  // unmatched slot keeps its last active state across soft navigations: a
  // redirect to roleHome() leaves the slot itself still pointing at
  // (.)login, so rendering the destination re-renders this file, which
  // redirects again. Measured in production at ~26 RSC requests a second,
  // alternating /login and /va forever, with every <Link> on the page dead
  // for as long as the router stays busy. An intercepting route has no
  // fixed point to redirect TO; rendering nothing IS the fixed point. The
  // page underneath just stays where it was, and the form still never
  // appears under a live session, which is all the bounce was ever for.
  // The full-page /login (src/app/(public)/login) keeps its redirect and
  // should: a hard navigation owns the whole document, so it can land.
  //
  // This is also what dismisses the modal after a successful sign-in from
  // inside it: the slot re-renders, now finds a session, and empties.
  //
  // An UNVERIFIED session still gets the form, and that half is
  // load-bearing: the link such an account is offered to escape
  // /verify-email ("Wrong account? Sign in again") is a <Link>, so it soft-
  // navigates and lands HERE, not on the real page. Sending that session
  // anywhere else puts it in front of requireUser (src/lib/authz.ts), which
  // returns it to /verify-email — the one advertised way out, looping.
  const user = await getSessionUser();
  if (user?.emailVerified) return null;

  const params = await searchParams;
  const next = safeNextParam(params.next);
  const applied = params.applied === "1";
  const workerAudience = params.audience === "worker";

  return (
    <LoginModal
      googleEnabled={googleEnabled}
      next={next}
      applied={applied}
      workerAudience={workerAudience}
    />
  );
}
