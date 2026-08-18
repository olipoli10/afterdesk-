import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { googleEnabled } from "@/lib/auth";
import { getSessionUser, roleHome } from "@/lib/authz";
import { AuthShell } from "@/components/auth-shell";
import { ClientRegisterForm } from "@/components/register-forms";
import { linkInline } from "@/components/ui";

export const metadata: Metadata = {
  title: "Client sign-up",
  description: "Create an Endvera client account: describe a deliverable, approve a fixed price and download reviewed work.",
  robots: { index: false, follow: false },
};

/* The night homepage's promise, folded beside the paper form. */
const ASIDE = [
  {
    title: "Scope and price come first",
    body: "Describe the deliverable, receive one fixed price for a one-off task, and approve it before work begins.",
  },
  {
    title: "Reviewed before you see it",
    body: "Every delivery is checked against your brief before it reaches you. You get the corrected version, not the first attempt.",
  },
  {
    title: "One-off work needs no subscription",
    body: "Use a one-off task without a retainer or minimum. You approve one fixed price per deliverable before anything starts.",
  },
];

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

  return (
    <AuthShell
      kicker="Client sign-up"
      title="Create your account."
      sub="Describe deliverables, approve one-off pricing, and download reviewed work."
      aside={ASIDE}
      asideTone="night"
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className={linkInline}>
            Sign in
          </Link>
        </>
      }
    >
      <ClientRegisterForm googleEnabled={googleEnabled} />
    </AuthShell>
  );
}
