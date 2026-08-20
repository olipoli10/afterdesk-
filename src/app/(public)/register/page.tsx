import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { emailSignupEnabled, googleEnabled } from "@/lib/auth";
import { getSessionUser, roleHome } from "@/lib/authz";
import { AuthShell } from "@/components/auth-shell";
import { ClientRegisterForm } from "@/components/register-forms";
import { linkInlineNight } from "@/components/ui";
import { ClientLanguageSwitch } from "@/components/client-language-switch";
import { CLIENT_PORTAL_I18N, clientPortalLangOf } from "@/lib/i18n/client-portal";

export async function generateMetadata(): Promise<Metadata> {
  const lang = clientPortalLangOf((await headers()).get("x-site-lang"));
  const copy = CLIENT_PORTAL_I18N[lang].auth;
  return { title: copy.registerKicker, description: copy.registerSub, robots: { index: false, follow: false } };
}

export default async function RegisterClientPage() {
  // Same guard as both /login copies (src/app/(public)/login and
  // src/app/@modal/(.)login). Without it this is the one AuthShell page a
  // live session can sit on, and every way out of that shell is a trapdoor:
  // the wordmark and "← Back to site" both point at "/", which bounces a
  // signed-in visitor straight into the portal, and the footer "Sign in"
  // does the same. Signing up is also meaningless with a session already
  // open — the form would only ever create a second account or fail on the
  // duplicate email.
  const user = await getSessionUser();
  if (user) redirect(roleHome(user.role));
  const lang = clientPortalLangOf((await headers()).get("x-site-lang"));
  const copy = CLIENT_PORTAL_I18N[lang].auth;

  return (
    <AuthShell
      tone="endvera"
      kicker={copy.registerKicker}
      title={copy.registerTitle}
      sub={copy.registerSub}
      aside={copy.registerAside}
      asideTone="night"
      backLabel={copy.backToSite}
      utility={<ClientLanguageSwitch current={lang} />}
      footer={
        <>
          {copy.alreadyRegistered}{" "}
          <Link href="/login" className={`inline-flex min-h-11 items-center ${linkInlineNight}`}>
            {copy.signInLink}
          </Link>
        </>
      }
    >
      <ClientRegisterForm
        googleEnabled={googleEnabled}
        emailEnabled={emailSignupEnabled}
        tone="glass"
        copy={copy.form}
      />
    </AuthShell>
  );
}
