"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Card, CardBody, Field, inputClass, buttonPrimary } from "@/components/ui";

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
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Sign in</h1>
      <p className="mb-5 text-sm text-neutral-500">Nightlexicon</p>
      <Card>
        <CardBody>
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
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-neutral-500">
        No account?{" "}
        <Link href="/register" className="font-medium text-indigo-600 hover:underline">
          Client sign-up
        </Link>{" "}
        ·{" "}
        <Link href="/register/va" className="font-medium text-indigo-600 hover:underline">
          VA application
        </Link>
      </p>
    </div>
  );
}
