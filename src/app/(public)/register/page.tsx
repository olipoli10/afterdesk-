import Link from "next/link";
import type { Metadata } from "next";
import { googleEnabled } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { ClientRegisterForm } from "@/components/register-forms";
import { linkInline } from "@/components/ui";

export const metadata: Metadata = {
  title: "Client sign-up",
  description: "Create a AfterDesk client account — send tasks, approve a fixed price, download reviewed work.",
  robots: { index: false, follow: false },
};

/* The night homepage's promise, folded beside the paper form. */
const ASIDE = [
  {
    title: "You approve the price first",
    body: "Send a task, get one fixed price back. Nothing starts until you approve it — decline and you owe nothing.",
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

export default function RegisterClientPage() {
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
