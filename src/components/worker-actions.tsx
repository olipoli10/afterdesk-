"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveVa, rejectVa, suspendVa } from "@/server/actions/admin-va";
import { inputClass, buttonPrimary, buttonSecondary } from "@/components/ui";

export function WorkerActions({
  vaUserId,
  status,
}: {
  vaUserId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSuspending(false);
      setReason("");
      router.refresh();
    });
  }

  if (suspending) {
    return (
      <div className="w-full space-y-2">
        <input
          className={inputClass}
          placeholder="Reason (logged, shown to the worker)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <button
            className={buttonSecondary}
            disabled={isPending || reason.trim().length < 3}
            onClick={() => run(() => suspendVa({ vaUserId, reason }))}
          >
            {isPending ? "Suspending…" : "Confirm suspension"}
          </button>
          <button
            className="px-2 text-sm text-neutral-500 hover:text-neutral-800"
            onClick={() => setSuspending(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "approved" ? (
        <button
          className={buttonPrimary}
          disabled={isPending}
          onClick={() => run(() => approveVa({ vaUserId }))}
        >
          {status === "suspended" ? "Reinstate" : "Approve"}
        </button>
      ) : null}
      {status === "pending_test" || status === "pending_grading" ? (
        <button
          className={buttonSecondary}
          disabled={isPending}
          onClick={() => run(() => rejectVa({ vaUserId }))}
        >
          Reject
        </button>
      ) : null}
      {status === "approved" ? (
        <button
          className="text-sm font-medium text-neutral-400 hover:text-red-600"
          onClick={() => setSuspending(true)}
        >
          Suspend…
        </button>
      ) : null}
      {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
