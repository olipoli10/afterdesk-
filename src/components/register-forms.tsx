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

/** The login modal's dark-glass button: inverted from buttonPrimary (light on
 *  dark instead of dark on light) so it still reads as the primary action
 *  against the frosted backdrop. */
const buttonPrimaryGlass =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-medium text-[#14161A] transition-colors duration-150 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-40";

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
    router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
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
  const [experienceSummary, setExperienceSummary] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [weeklyAvailability, setWeeklyAvailability] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
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
    const result = await registerVa({
      name,
      email,
      password,
      experienceSummary,
      specialties,
      weeklyAvailability,
      portfolioUrl,
    });
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
    router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
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
      <Field
        label="Relevant experience"
        hint="Describe one or two concrete projects, tools used, and how you checked the work."
      >
        <textarea
          required
          minLength={40}
          rows={5}
          className={inputClass}
          value={experienceSummary}
          onChange={(e) => setExperienceSummary(e.target.value)}
        />
      </Field>
      <Field label="Specialties" hint="For example: Excel cleanup, research, document production.">
        <input
          required
          minLength={10}
          className={inputClass}
          value={specialties}
          onChange={(e) => setSpecialties(e.target.value)}
        />
      </Field>
      <Field label="Weekly availability" hint="Hours per week and usual Manila working window.">
        <input
          required
          className={inputClass}
          value={weeklyAvailability}
          onChange={(e) => setWeeklyAvailability(e.target.value)}
        />
      </Field>
      <Field label="Portfolio or work sample URL" hint="Optional. Do not include client-confidential work.">
        <input
          type="url"
          className={inputClass}
          value={portfolioUrl}
          onChange={(e) => setPortfolioUrl(e.target.value)}
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
  tone = "paper",
}: {
  googleEnabled: boolean;
  /** Same-origin path to return to after sign-in — already validated server-side. */
  next?: string;
  /** "glass" is the login modal's dark frosted treatment. */
  tone?: "paper" | "glass";
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
    const session = await authClient.getSession();
    if (session.data?.user && !session.data.user.emailVerified) {
      router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      router.refresh();
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
          <OrDivider tone={tone} />
        </>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" tone={tone}>
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
            <label
              htmlFor={passwordId}
              className={tone === "glass" ? "font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-white/55" : fieldLabelClass}
            >
              Password
            </label>
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className={
                tone === "glass"
                  ? "min-h-11 px-2 text-[12px] font-medium text-white/50 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  : "min-h-11 px-2 text-[12px] font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              }
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
          <p role="alert" className={`text-sm ${tone === "glass" ? "text-[#FF9A8B]" : "text-[#8C2F23]"}`}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className={`${tone === "glass" ? buttonPrimaryGlass : buttonPrimary} w-full`}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
