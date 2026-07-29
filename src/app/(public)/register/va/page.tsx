import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { VaRegisterForm } from "@/components/register-forms";

const ASIDE = [
  {
    title: "You see the payout before you claim",
    body: "Every task in the pool shows what it pays and when it is due. Claim what you want — first come, first served.",
  },
  {
    title: "A short entry test first",
    body: "Two or three sample exercises, graded personally. Once you pass, the task pool opens for you.",
  },
  {
    title: "No clients to manage",
    body: "No bidding, no interviews, no chasing anyone for payment. You do the work and submit it; we handle the rest.",
  },
];

export default function RegisterVaPage() {
  return (
    <AuthShell
      title="Apply as a virtual assistant"
      sub="Create your account, pass a short entry test, then start claiming paid tasks."
      aside={ASIDE}
      footer={
        <>
          Already applied?{" "}
          <Link href="/login" className="font-medium text-blue-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {/* Assistants apply through this form only — the flow creates their
          profile and entry test, which a Google sign-up cannot do. */}
      <VaRegisterForm />
    </AuthShell>
  );
}
