import Link from "next/link";
import { googleEnabled } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/register-forms";

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      sub="Clients, assistants and the operator all sign in here — you land on your own dashboard."
      footer={
        <>
          No account yet?{" "}
          <Link href="/register" className="font-medium text-blue-700 hover:underline">
            Client sign-up
          </Link>{" "}
          ·{" "}
          <Link href="/register/va" className="font-medium text-blue-700 hover:underline">
            Assistant application
          </Link>
        </>
      }
    >
      <LoginForm googleEnabled={googleEnabled} />
    </AuthShell>
  );
}
