import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { VaRegisterForm } from "@/components/register-forms";
import { linkInline } from "@/components/ui";
import { academyStats } from "@/lib/academy/public";
import { emailSignupEnabled } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Apply to join the pool",
  description: "Apply to work Endvera tasks: the payout is printed before you claim.",
  robots: { index: false, follow: false },
};

/* Slip-style aside — the worker came from the paper homepage.
   The Academy leads on purpose: this page's one moment of friction is the
   wait for review, and the Academy is the honest answer to "what do I do
   now?" — it opens the second the account exists, and what you earn in it
   is on the desk when we read your application. */
const ASIDE = [
  {
    title: "The Academy opens today, not after approval",
    // Course count computed, never typed — the "Twenty" this replaced had
    // already silently gone stale against the 29 courses an account gets.
    body: `${academyStats().courses} free courses with real exams and permanent certificates. Start tonight: every certificate you earn is on your profile when we review you.`,
  },
  {
    title: "The payout is printed before you claim",
    body: "Every task in the pool shows what it pays and when it is due. Claim what you want. First come, first served.",
  },
  {
    title: "A person reads your application",
    body: "No automated screening. We review every application ourselves and open the pool for the ones we can stand behind.",
  },
];

export default function RegisterVaPage() {
  return (
    <AuthShell
      kicker="Specialist application"
      title="Apply to join the pool."
      sub="Create your account and send your application. We review every one before the pool opens."
      aside={ASIDE}
      asideTone="paper"
      footer={
        <>
          Already applied?{" "}
          <Link href="/login?audience=worker" className={linkInline}>
            Sign in
          </Link>
        </>
      }
    >
      {/* Workers apply through this form only — the flow creates their
          profile server-side, which a Google sign-up cannot do. */}
      <VaRegisterForm emailEnabled={emailSignupEnabled} />
    </AuthShell>
  );
}
