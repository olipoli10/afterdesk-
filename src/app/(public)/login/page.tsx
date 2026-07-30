import Link from "next/link";
import type { Metadata } from "next";
import { googleEnabled } from "@/lib/auth";
import { safeNextParam } from "@/lib/authz";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/register-forms";
import { linkInline } from "@/components/ui";

/*
 * THE FULL-PAGE FALLBACK. A soft navigation to /login from anywhere inside
 * the app — clicking "Sign in" in a nav, a stale-session redirect while
 * browsing — is intercepted by src/app/@modal/(.)login and shown as a
 * window over the current page instead. This file only renders on a real
 * document load: a refresh, a typed URL, a bookmark, an email link, or the
 * very first request the browser ever makes for /login. It has to stay
 * complete and correct on its own — it is not a fallback for a broken
 * modal, it is the page every one of those direct arrivals actually gets.
 */

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Second Shift dashboard.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextParam(params.next);
  const applied = params.applied === "1";

  return (
    <AuthShell
      kicker="Sign in"
      title="Welcome back."
      sub="Sign in to your dashboard."
      footer={
        <>
          No account yet?{" "}
          <Link href="/register" className={linkInline}>
            Client sign-up
          </Link>{" "}
          ·{" "}
          <Link href="/register/va" className={linkInline}>
            Specialist application
          </Link>
        </>
      }
    >
      {applied ? (
        <p
          role="status"
          className="mb-5 rounded-md border-l-[3px] border-[#166049] bg-[#166049]/[0.06] px-3 py-2.5 text-sm leading-relaxed text-[#14161A]"
        >
          Application received — sign in to continue.
        </p>
      ) : null}
      <LoginForm googleEnabled={googleEnabled} next={next} />
    </AuthShell>
  );
}
