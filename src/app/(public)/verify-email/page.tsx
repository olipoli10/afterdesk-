import { redirect } from "next/navigation";
import { getSessionUser, roleHome } from "@/lib/authz";
import { AuthShell } from "@/components/auth-shell";
import { VerifyEmailForm } from "@/components/verify-email-form";
import { SignOutButton } from "@/components/sign-out";

export default async function VerifyEmailPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect(roleHome(user.role));

  return (
    <AuthShell
      title="Confirm your email"
      sub={`We sent a 6-digit code to ${user.email}. Enter it to activate your account.`}
      aside={[
        {
          title: "Why we verify",
          body: "Tasks carry real business data. Confirming the address makes sure account notices and deliverables only ever reach the person who owns it.",
        },
        {
          title: "Code not arriving?",
          body: "Check your spam folder, then request a new one. Codes expire after 10 minutes.",
        },
      ]}
      footer={
        <span className="flex items-center gap-1">
          Wrong account? <SignOutButton />
        </span>
      }
    >
      <VerifyEmailForm email={user.email} />
    </AuthShell>
  );
}
