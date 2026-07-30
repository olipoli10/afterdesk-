"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveVa, rejectVa, suspendVa } from "@/server/actions/admin-va";
import { Field, inputClass, buttonPrimary, buttonSecondary } from "@/components/ui";

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
        <Field label="Suspension reason">
          <input
            className={inputClass}
            placeholder="Logged and shown to the worker"
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
            disabled={isPending || reason.trim().length < 3}
            onClick={() => run(() => suspendVa({ vaUserId, reason }))}
          >
            {isPending ? "Suspending…" : "Confirm suspension"}
          </button>
          <button
            className="min-h-11 px-2 text-sm text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]"
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
          className="min-h-11 px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#8C2F23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C2F23]"
          onClick={() => setSuspending(true)}
        >
          Suspend…
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
