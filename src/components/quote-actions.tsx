"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptQuote, declineQuote } from "@/server/actions/client-tasks";
import { Field, buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

export function QuoteActions({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        // Never a bare "something went wrong" at the highest-stakes click:
        // say what is still true and what to do next.
        setError(
          result.error ?? "That didn't go through — the price is unchanged. Try again."
        );
      }
      router.refresh();
    });
  }

  function acceptAndPay() {
    setError(null);
    startTransition(async () => {
      const accepted = await acceptQuote(taskId);
      if (!accepted.ok) {
        setError(accepted.error);
        router.refresh();
        return;
      }
      try {
        const response = await fetch("/api/payments/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
        });
        const result = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !result.url) {
          setError(
            result.error ??
              "Your price was accepted, but secure checkout could not start. Use Pay securely to retry."
          );
          router.refresh();
          return;
        }
        window.location.assign(result.url);
      } catch {
        setError(
          "Your price was accepted, but secure checkout could not start. Use Pay securely to retry."
        );
        router.refresh();
      }
    });
  }

  if (declining) {
    return (
      <div className="space-y-3">
        <Field label="Why are you declining?" hint="Optional — it helps us re-price fairly.">
          <textarea
            rows={2}
            autoFocus
            className={inputClass}
            placeholder="e.g. Over budget for this one"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-[#8C2F23]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            className={buttonSecondary}
            disabled={isPending}
            onClick={() => run(() => declineQuote(taskId, reason || undefined))}
          >
            {isPending ? "Declining…" : "Confirm decline"}
          </button>
          <button
            className="min-h-11 rounded-sm px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            disabled={isPending}
            onClick={() => setDeclining(false)}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          className={buttonPrimary}
          disabled={isPending}
          onClick={acceptAndPay}
        >
          {isPending ? "Opening checkout…" : "Accept price & pay"}
        </button>
        <button
          className={buttonSecondary}
          disabled={isPending}
          onClick={() => setDeclining(true)}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
