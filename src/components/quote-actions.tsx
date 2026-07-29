"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptQuote, declineQuote } from "@/server/actions/client-tasks";
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

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
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  if (declining) {
    return (
      <div className="space-y-3">
        <textarea
          rows={2}
          className={inputClass}
          placeholder="Optional — tell us why, it helps us re-price fairly."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <button
            className={buttonSecondary}
            disabled={isPending}
            onClick={() => run(() => declineQuote(taskId, reason || undefined))}
          >
            {isPending ? "Declining…" : "Confirm decline"}
          </button>
          <button
            className="px-2 text-sm text-neutral-500 hover:text-neutral-800"
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          className={buttonPrimary}
          disabled={isPending}
          onClick={() => run(() => acceptQuote(taskId))}
        >
          {isPending ? "Accepting…" : "Accept price"}
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
