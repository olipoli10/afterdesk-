"use client";

import { useState } from "react";
import { buttonPrimary } from "@/components/ui";

export function PaymentActions({ taskId }: { taskId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        setError(result.error ?? "Secure checkout could not start.");
        setBusy(false);
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("Secure checkout could not start. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <button type="button" className={buttonPrimary} disabled={busy} onClick={startCheckout}>
        {busy ? "Opening secure checkout…" : "Pay securely"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-[#5B6069]">
        Card details are entered on Stripe. Your card is authorized, not charged. Nothing is
        actually billed until you approve the delivered work.
      </p>
    </div>
  );
}
