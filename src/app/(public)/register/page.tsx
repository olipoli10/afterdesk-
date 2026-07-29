"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth-shell";
import { Field, inputClass, buttonPrimary } from "@/components/ui";

const ASIDE = [
  {
    title: "You approve the price before anything starts",
    body: "Submit a task, get one fixed price back. Decline it and you owe nothing — there is no subscription and no minimum.",
  },
  {
    title: "Every deliverable is checked first",
    body: "Work is reviewed against your description before it reaches you. You get the corrected version, not the first attempt.",
  },
  {
    title: "Your data stays scoped and logged",
    body: "Only the assistant on your task can open your files, access is revoked when the task ends, and everything is purged after 90 days.",
  },
];

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
    <AuthShell
      title="Create a client account"
      sub="Submit tasks, approve a fixed price, download quality-checked work."
      aside={ASIDE}
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-blue-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
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
    </AuthShell>
  );
}
