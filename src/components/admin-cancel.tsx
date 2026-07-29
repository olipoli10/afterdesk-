"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelTask, reassignTask } from "@/server/actions/admin";
import { Card, CardBody, Field, inputClass, buttonDanger, buttonSecondary } from "@/components/ui";

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
        className="text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#8C2F23]"
        onClick={() => setOpen(true)}
      >
        Cancel this task…
      </button>
    );
  }

  return (
    <Card className="border-[#A23B2E]/30">
      <CardBody>
        <Field label="Cancellation reason (written to the audit log)">
          <input
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-[#8C2F23]">
            {error}
          </p>
        ) : null}
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
            className="px-2 text-sm text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
            onClick={() => setOpen(false)}
          >
            Keep task
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Un-stick tool: pulls a task out of a worker's hands and back into the pool
 * (reason required — it goes to the audit log). Rendered only for
 * claimed / submitted_for_qc / qc_rejected / revision_requested.
 */
export function AdminReturnToPool({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        className="text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
        onClick={() => setOpen(true)}
      >
        Return to pool…
      </button>
    );
  }

  return (
    <Card>
      <CardBody>
        <Field
          label="Reason for returning it (written to the audit log)"
          hint="The task goes back to the pool for a different worker. QC rounds reset — the next worker starts fresh."
        >
          <input
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-[#8C2F23]">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            className={buttonSecondary}
            disabled={isPending || reason.trim().length < 3}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await reassignTask({ taskId, reason });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
                setOpen(false);
              });
            }}
          >
            {isPending ? "Returning…" : "Confirm — return to pool"}
          </button>
          <button
            className="px-2 text-sm text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
            onClick={() => setOpen(false)}
          >
            Keep assignment
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
