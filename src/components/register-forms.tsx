"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { registerVa } from "@/server/actions/auth";
import { GoogleButton, OrDivider } from "@/components/google-button";
import { PasswordFields, passwordProblem } from "@/components/password-fields";
import { Field, inputClass, buttonPrimary } from "@/components/ui";

const fieldLabelClass =
  "font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#5B6069]";

export function ClientRegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
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
    <div className="space-y-5">
      {googleEnabled ? (
        <>
          <GoogleButton label="Sign up with Google" />
          <OrDivider />
        </>
      ) : null}

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
        <PasswordFields
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
        />
        {error ? (
          <p role="alert" className="text-sm text-[#8C2F23]">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}

export function VaRegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    // Account + worker role are created server-side (role is never
    // client-supplied), then we sign in with the same credentials.
    const result = await registerVa({ name, email, password });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      // The account WAS created — land on login with context, not cold.
      router.push("/login?applied=1");
      return;
    }
    router.push("/va");
    router.refresh();
  }

  return (
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
      <PasswordFields
        password={password}
        confirm={confirm}
        onPasswordChange={setPassword}
        onConfirmChange={setConfirm}
      />
      {error ? (
        <p role="alert" className="text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
        {busy ? "Creating account…" : "Apply"}
      </button>
    </form>
  );
}

export function LoginForm({
  googleEnabled,
  next,
}: {
  googleEnabled: boolean;
  /** Same-origin path to return to after sign-in — already validated server-side. */
  next?: string;
}) {
  const router = useRouter();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Open-redirect guard: only same-origin paths — never protocol-relative and
  // never backslashes (browsers normalize "/\evil.com" to "//evil.com").
  const destination =
    next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
      ? next
      : "/";

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
    // "/" redirects to the right dashboard for the account's role;
    // a validated deep link wins over the dashboard.
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {googleEnabled ? (
        <>
          <GoogleButton label="Continue with Google" callbackURL={destination} />
          <OrDivider />
        </>
      ) : null}

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
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={passwordId} className={fieldLabelClass}>
              Password
            </label>
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="text-[12px] font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              aria-pressed={show}
            >
              {show ? "Hide password" : "Show password"}
            </button>
          </div>
          <input
            id={passwordId}
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-[#8C2F23]">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
