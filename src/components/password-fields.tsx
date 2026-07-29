"use client";

import { useId, useState } from "react";
import { Field, inputClass } from "@/components/ui";

const labelClass =
  "font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#5B6069]";

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
}: {
  password: string;
  confirm: string;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  minLength?: number;
}) {
  const passwordId = useId();
  const [show, setShow] = useState(false);
  const type = show ? "text" : "password";

  const tooShort = password.length > 0 && password.length < minLength;
  const mismatch = confirm.length > 0 && confirm !== password;
  const matched = confirm.length > 0 && confirm === password && !tooShort;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor={passwordId} className={labelClass}>
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
          type={type}
          required
          minLength={minLength}
          autoComplete="new-password"
          className={inputClass}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
        <span
          className={`mt-1.5 block text-xs ${tooShort ? "text-[#8C2F23]" : "text-[#5B6069]"}`}
        >
          {tooShort
            ? `${minLength - password.length} more character${minLength - password.length > 1 ? "s" : ""} needed.`
            : `At least ${minLength} characters.`}
        </span>
      </div>

      <Field label="Confirm password">
        <input
          type={type}
          required
          autoComplete="new-password"
          className={inputClass}
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
        />
      </Field>
      {mismatch ? (
        <p className="-mt-2 text-xs text-[#8C2F23]">Passwords do not match.</p>
      ) : matched ? (
        <p className="-mt-2 text-xs text-[#5B6069]">✓ Passwords match.</p>
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
