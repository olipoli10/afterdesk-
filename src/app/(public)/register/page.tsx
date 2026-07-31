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
  description: "Create a AfterDesk client account: send tasks, approve a fixed price, download reviewed work.",
  robots: { index: false, follow: false },
};

/* The night homepage's promise, folded beside the paper form. */
const ASIDE = [
  {
    title: "You approve the price first",
    body: "Send a task, get one fixed price back. Nothing starts until you approve it. Decline and you owe nothing.",
  },
  {
    title: "Reviewed before you see it",
    body: "Every delivery is checked against your brief before it reaches you. You get the corrected version, not the first attempt.",
  },
  {
    title: "No subscription",
    body: "No retainer, no minimum, no seat fees. You pay per task, at the price you approved.",
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
      sub="Send tasks, approve a fixed price, download reviewed work."
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
