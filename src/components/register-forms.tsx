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
      router.push("/login?applied=1&audience=worker");
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

/**
 * Mirrors roleHome() in src/lib/authz.ts, which is server-only and so cannot
 * be imported into a client bundle. Sending a fresh sign-in straight to its
 * own portal is what pushing "/" used to achieve indirectly, minus the round
 * trip: "/" only redirects a signed-in visitor onward, and as a soft
 * navigation out of the login modal it re-enters the route that modal is
 * intercepting.
 */
function roleHome(role: string | undefined): string {
  if (role === "ADMIN") return "/admin";
  if (role === "VA") return "/va";
  return "/client";
}

export function LoginForm({
  googleEnabled,
  next,
  tone = "paper",
  workerAudience = false,
}: {
  googleEnabled: boolean;
  /** Same-origin path to return to after sign-in — already validated server-side. */
  next?: string;
  /** "glass" is the login modal's dark frosted treatment. */
  tone?: "paper" | "glass";
  /**
   * True when this /login was reached from a worker-side link (?audience=worker
   * — see workers/page.tsx, academy/page.tsx, register/va/page.tsx). Hides
   * "Continue with Google" instead of showing it.
   *
   * WHY: identity here resolves by email, not by which button was clicked.
   * Better Auth's account model has no concept of "sign in as a worker" — a
   * Google identity is permanently tied to whichever user row shares its
   * email, and that row's role is fixed the moment it's created. VA accounts
   * are created ONLY by the dedicated application form (registerVa, a server
   * action that also builds the vaProfile a Google sign-up has no path to
   * create — see the comment on VaRegisterForm below and on
   * register/va/page.tsx). So Google sign-in can NEVER authenticate a new VA:
   * it either creates a fresh CLIENT account (if the email is unseen) or logs
   * into whatever existing account already owns that email — client, if
   * that's what was there. Offering the button here was not a redirect bug,
   * it was a real path that could only ever end on the client side; hiding it
   * for this audience removes the false affordance instead of leaving a
   * button that silently does something other than what it looks like it
   * does. A specialist's only route back into their account is the same
   * email + password they applied with.
   */
  workerAudience?: boolean;
}) {
  const router = useRouter();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  // Checked by default: the portal is the point of this site, not the
  // marketing pages around it, so staying signed in is the behaviour that
  // needs an opt-OUT, not an opt-in. Wired straight to Better Auth's own
  // rememberMe flag (see src/lib/auth.ts's session block for how long that
  // actually lasts) — unchecking still signs you in, it just makes the
  // browser drop the cookie on close instead of keeping it for 30 days.
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rememberMeId = useId();

  // Open-redirect guard: only same-origin paths — never protocol-relative and
  // never backslashes (browsers normalize "/\evil.com" to "//evil.com").
  const deepLink =
    next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
      ? next
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password, rememberMe });
    if (error) {
      setError(error.message ?? "Sign-in failed.");
      setBusy(false);
      return;
    }
    const session = await authClient.getSession();
    // `role` is a Better Auth additionalField (src/lib/auth.ts) and the client
    // is not built with inferAdditionalFields, so it rides the session at
    // runtime but is missing from the inferred type.
    const user = session.data?.user as { emailVerified: boolean; role?: string } | undefined;
    if (user && !user.emailVerified) {
      router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      router.refresh();
      return;
    }
    // A validated deep link wins; without one, land on this account's own
    // dashboard directly rather than bouncing through "/".
    router.push(deepLink ?? roleHome(user?.role));
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {googleEnabled && !workerAudience ? (
        <>
          {/* OAuth returns through a full document load and the account's role
              is unknowable until it completes, so "/" — which redirects a
              signed-in visitor to their portal — stays the right fallback. */}
          <GoogleButton label="Continue with Google" callbackURL={deepLink ?? "/"} />
          <OrDivider tone={tone} />
        </>
      ) : null}
      {workerAudience ? (
        <p
          className={`text-[13px] leading-relaxed ${tone === "paper" ? "text-[#5B6069]" : "text-white/55"}`}
        >
          Specialist accounts sign in with email and password — Google sign-in always opens a
          client account.
        </p>
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
        <label
          htmlFor={rememberMeId}
          className={`flex min-h-11 items-center gap-2 text-sm ${tone === "glass" ? "text-white/70" : "text-[#5B6069]"}`}
        >
          <input
            id={rememberMeId}
            type="checkbox"
            className={tone === "glass" ? "accent-[#F7F6F3]" : "accent-[#14161A]"}
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          Keep me signed in on this device
        </label>
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
