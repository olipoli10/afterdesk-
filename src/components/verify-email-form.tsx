"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

export function VerifyEmailForm({
  email,
  destination,
}: {
  email: string;
  destination: string;
}) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.emailOtp.verifyEmail({ email, otp });
    if (result.error) {
      setError(result.error.message ?? "That code is invalid or expired.");
      setBusy(false);
      return;
    }
    router.push(destination);
    router.refresh();
  }

  async function resend() {
    setBusy(true);
    setError(null);
    setSent(false);
    const result = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "A new code could not be sent.");
      return;
    }
    setSent(true);
  }

  return (
    <form className="space-y-4" onSubmit={verify}>
      <p className="text-sm leading-relaxed text-[#5B6069]">
        Enter the six-digit code sent to{" "}
        <span className="font-mono text-[#14161A]">{email}</span>. It expires in 10 minutes.
      </p>
      <input
        className={`${inputClass} text-center font-mono text-xl tracking-[0.35em]`}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        aria-label="Six-digit verification code"
        value={otp}
        onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      {sent ? <p role="status" className="text-xs text-[#166049]">Verification code sent.</p> : null}
      {error ? <p role="alert" className="text-sm text-[#8C2F23]">{error}</p> : null}
      <button className={`${buttonPrimary} w-full`} disabled={busy || otp.length !== 6}>
        {busy ? "Checking…" : "Verify email"}
      </button>
      <button type="button" className={`${buttonSecondary} w-full`} disabled={busy} onClick={resend}>
        Send a new code
      </button>
    </form>
  );
}
