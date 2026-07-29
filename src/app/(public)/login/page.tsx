"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth-shell";
import { Field, inputClass, buttonPrimary } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "Sign-in failed.");
      setBusy(false);
      return;
    }
    // "/" redirects to the right dashboard for the account's role.
    router.push("/");
    router.refresh();
  }

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
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
