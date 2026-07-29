"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { registerVa } from "@/server/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Field, inputClass, buttonPrimary } from "@/components/ui";

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
    // Account + VA role are created server-side (role is never client-supplied),
    // then we sign in with the same credentials.
    const result = await registerVa({ name, email, password });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      router.push("/login");
      return;
    }
    router.push("/va");
    router.refresh();
  }

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
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name">
          <input
            required
            minLength={2}
            autoComplete="name"
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
          {busy ? "Creating account…" : "Apply"}
        </button>
      </form>
    </AuthShell>
  );
}
