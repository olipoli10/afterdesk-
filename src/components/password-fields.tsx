"use client";

import { useId, useState } from "react";
import { Field, inputClass, inputClassNight } from "@/components/ui";
import { CLIENT_PORTAL_I18N, type ClientPortalAuthFormCopy } from "@/lib/i18n/client-portal";

const labelClass =
  "font-mono text-[12px] font-medium uppercase tracking-[0.1em] text-[#5B6069]";

/**
 * Password + confirmation with a single show/hide toggle covering both, plus
 * live match feedback. Sign-up only — the login form keeps one plain field.
 */
export function PasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  minLength = 10,
  tone = "paper",
  copy = CLIENT_PORTAL_I18N.en.auth.form,
}: {
  password: string;
  confirm: string;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  minLength?: number;
  tone?: "paper" | "glass";
  copy?: ClientPortalAuthFormCopy;
}) {
  const passwordId = useId();
  const [show, setShow] = useState(false);
  const type = show ? "text" : "password";

  const tooShort = password.length > 0 && password.length < minLength;
  const matched = confirm.length > 0 && confirm === password && !tooShort;
  const glass = tone === "glass";

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor={passwordId} className={glass ? "font-mono text-[12px] font-medium uppercase tracking-[0.1em] text-white/55" : labelClass}>
            {copy.password}
          </label>
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className={glass ? "min-h-11 px-2 text-[12px] font-medium text-white/55 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60" : "min-h-11 px-2 text-[12px] font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-white"}
            aria-pressed={show}
          >
            {show ? copy.hidePassword : copy.showPassword}
          </button>
        </div>
        <input
          id={passwordId}
          type={type}
          required
          minLength={minLength}
          autoComplete="new-password"
          className={glass ? inputClassNight : inputClass}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
        <span
          className={`mt-1.5 block text-xs ${tooShort ? (glass ? "text-[#FF9A8B]" : "text-[#8C2F23]") : (glass ? "text-white/55" : "text-[#5B6069]")}`}
        >
          {tooShort
            ? copy.moreCharacters.replace("{count}", String(minLength - password.length))
            : copy.minCharacters.replace("{min}", String(minLength))}
        </span>
      </div>

      <Field label={copy.confirmPassword} tone={tone}>
        <input
          type={type}
          required
          autoComplete="new-password"
          className={glass ? inputClassNight : inputClass}
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
        />
      </Field>
      {matched ? (
        <p role="status" className={`-mt-2 text-xs ${glass ? "text-[#9FE8C8]" : "text-[#5B6069]"}`}>✓ {copy.passwordsMatch}</p>
      ) : null}
    </div>
  );
}

/** Shared validation used by both sign-up forms. */
export function passwordProblem(
  password: string,
  confirm: string,
  minLength = 10
): string | null {
  if (password.length < minLength) return `Password must be at least ${minLength} characters.`;
  if (password !== confirm) return "Passwords do not match.";
  return null;
}
