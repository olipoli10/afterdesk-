import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { VerifyEmailForm } from "@/components/verify-email-form";
import { getSessionUser, roleHome } from "@/lib/authz";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect(roleHome(user.role));

  return (
    <AuthShell
      title="Check your inbox"
      sub="Email verification protects tasks, files and payments from account impersonation."
      footer={
        <>
          Wrong account? <Link href="/login" className="underline">Sign in again</Link>
        </>
      }
    >
      <VerifyEmailForm email={user.email} destination={roleHome(user.role)} />
    </AuthShell>
  );
}
