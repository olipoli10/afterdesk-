"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelTask } from "@/server/actions/admin";
import { Card, CardBody, Field, inputClass, buttonDanger } from "@/components/ui";

/** Admin override: cancel from any non-terminal state, reason logged. */
export function AdminCancel({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        className="text-sm font-medium text-neutral-400 hover:text-red-600"
        onClick={() => setOpen(true)}
      >
        Cancel this task…
      </button>
    );
  }

  return (
    <Card className="border-red-200">
      <CardBody>
        <Field label="Cancellation reason (written to the audit log)">
          <input
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-3 flex gap-2">
          <button
            className={buttonDanger}
            disabled={isPending || reason.trim().length < 3}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await cancelTask({ taskId, reason });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
                setOpen(false);
              });
            }}
          >
            {isPending ? "Cancelling…" : "Confirm cancellation"}
          </button>
          <button
            className="px-2 text-sm text-neutral-500 hover:text-neutral-800"
            onClick={() => setOpen(false)}
          >
            Keep task
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
