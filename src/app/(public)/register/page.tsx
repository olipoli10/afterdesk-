"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Card, CardBody, Field, inputClass, buttonPrimary } from "@/components/ui";

export default function RegisterClientPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signUp.email({ name, email, password });
    if (error) {
      setError(error.message ?? "Sign-up failed.");
      setBusy(false);
      return;
    }
    router.push("/client");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Create a client account</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Submit tasks, approve a fixed price, receive quality-checked deliverables.
      </p>
      <Card>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Company or contact name">
              <input
                required
                minLength={2}
                autoComplete="organization"
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
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
            <Field label="Password" hint="At least 10 characters.">
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-neutral-500">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
