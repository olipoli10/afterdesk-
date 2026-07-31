import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SignOutButton } from "@/components/sign-out";
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

  /*
   * The footer is a sign-OUT, not a link to /login, because signing out is the
   * only exit from this page that isn't a loop: /login bounces an
   * authenticated visitor to its portal home, and every portal's requireUser
   * sends an unverified account straight back here (src/lib/authz.ts). The
   * shell's own wordmark and "Back to site" pointed at "/" and looped the same
   * way, which is what exit="sign-out" replaces. Someone who typed their
   * address wrong or never receives the code was otherwise trapped here for
   * the full 30-day session with no way back to the site.
   */
  return (
    <AuthShell
      kicker="Verify email"
      title="Check your inbox."
      sub="Email verification protects tasks, files and payments from account impersonation."
      exit="sign-out"
      footer={
        <span className="flex flex-wrap items-center">
          Wrong address, or no code arriving?
          <SignOutButton home="/" />
        </span>
      }
    >
      <VerifyEmailForm email={user.email} destination={roleHome(user.role)} />
    </AuthShell>
  );
}
