import Link from "next/link";
import type { Metadata } from "next";
import { googleEnabled } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/register-forms";
import { linkInline } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Second Shift dashboard.",
  robots: { index: false, follow: false },
};

/** Only forward same-origin paths — never protocol-relative or absolute URLs. */
function safeNext(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const applied = params.applied === "1";

  return (
    <AuthShell
      title="Sign in"
      sub="Sign in to your dashboard."
      footer={
        <>
          No account yet?{" "}
          <Link href="/register" className={linkInline}>
            Client sign-up
          </Link>{" "}
          ·{" "}
          <Link href="/register/va" className={linkInline}>
            Specialist application
          </Link>
        </>
      }
    >
      {applied ? (
        <p
          role="status"
          className="mb-5 rounded-md border border-[#14161A]/15 bg-[#F7F6F3] px-3 py-2.5 text-sm leading-relaxed text-[#14161A]"
        >
          Application received — sign in to continue.
        </p>
      ) : null}
      <LoginForm googleEnabled={googleEnabled} next={next} />
    </AuthShell>
  );
}
