"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { buttonPrimary, inputClass } from "@/components/ui";

export function VerifyEmailForm({ email }: { email: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp: otp.trim() });
    if (error) {
      setError(error.message ?? "That code is not valid. Check it and try again.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function resend() {
    setResending(true);
    setError(null);
    setNotice(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    setResending(false);
    if (error) {
      setError(error.message ?? "Could not send a new code.");
      return;
    }
    setNotice("A new code is on its way.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-neutral-800">
          6-digit code
        </span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          placeholder="000000"
          className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      <button
        type="submit"
        disabled={busy || otp.length !== 6}
        className={`${buttonPrimary} w-full`}
      >
        {busy ? "Verifying…" : "Verify email"}
      </button>

      <button
        type="button"
        onClick={resend}
        disabled={resending}
        className="w-full text-center text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-900 disabled:opacity-50"
      >
        {resending ? "Sending…" : "Send a new code"}
      </button>
    </form>
  );
}
