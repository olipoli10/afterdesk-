import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { googleEnabled } from "@/lib/auth";
import { getSessionUser, roleHome, safeNextParam } from "@/lib/authz";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/register-forms";
import { linkInlineNight } from "@/components/ui";
import { ClientLanguageSwitch } from "@/components/client-language-switch";
import { CLIENT_PORTAL_I18N, clientPortalLangOf } from "@/lib/i18n/client-portal";

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

export async function generateMetadata(): Promise<Metadata> {
  const lang = clientPortalLangOf((await headers()).get("x-site-lang"));
  const copy = CLIENT_PORTAL_I18N[lang].auth;
  return { title: copy.loginKicker, description: copy.loginSub, robots: { index: false, follow: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Same guard as the intercepted modal (src/app/@modal/(.)login) — see the
  // comment there for why an already-authenticated visitor must never see
  // this form. This copy has to exist independently: a direct/hard
  // navigation to /login never renders the modal at all.
  //
  // The guard is on a VERIFIED session, not on any session at all. An
  // unverified account owns exactly two pages: /verify-email and this form,
  // and /verify-email's "Wrong account? Sign in again" is its only exit.
  // Bouncing an unverified visitor to roleHome() hands them to a portal
  // layout whose requireUser (src/lib/authz.ts) sends them straight back to
  // /verify-email — the exit link becomes a loop with no way off it.
  const user = await getSessionUser();
  if (user?.emailVerified) redirect(roleHome(user.role));

  const params = await searchParams;
  const next = safeNextParam(params.next);
  const applied = params.applied === "1";
  const workerAudience = params.audience === "worker";
  const lang = clientPortalLangOf((await headers()).get("x-site-lang"));
  const copy = CLIENT_PORTAL_I18N[lang].auth;
  const languageParams = new URLSearchParams();
  if (next) languageParams.set("next", next);
  if (applied) languageParams.set("applied", "1");
  if (workerAudience) languageParams.set("audience", "worker");
  const languageSearch = languageParams.toString();

  return (
    <AuthShell
      tone="endvera"
      kicker={copy.loginKicker}
      title={copy.loginTitle}
      sub={copy.loginSub}
      backLabel={copy.backToSite}
      utility={<ClientLanguageSwitch current={lang} search={languageSearch} />}
      footer={
        <>
          {copy.noAccount}{" "}
          <Link href="/register" className={`inline-flex min-h-11 items-center ${linkInlineNight}`}>
            {copy.clientSignup}
          </Link>{" "}
          ·{" "}
          <Link href="/register/va" className={`inline-flex min-h-11 items-center ${linkInlineNight}`}>
            {copy.specialistApplication}
          </Link>
        </>
      }
    >
      {applied ? (
        <p
          role="status"
          className="mb-5 rounded-md border-l-[3px] border-[#3DDCA0] bg-[#3DDCA0]/[0.08] px-3 py-2.5 text-sm leading-relaxed text-[#D7F7EA]"
        >
          {copy.applicationReceived}
        </p>
      ) : null}
      <LoginForm
        googleEnabled={googleEnabled}
        next={next}
        workerAudience={workerAudience}
        tone="glass"
        copy={copy.form}
      />
    </AuthShell>
  );
}
