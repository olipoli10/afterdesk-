"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelTask, reassignTask } from "@/server/actions/admin";
import { Card, CardBody, Field, inputClass, buttonDanger, buttonSecondary } from "@/components/ui";

export const LOST_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "deadline_at_risk", label: "Deadline could not be met" },
  { value: "worker_unavailable", label: "Worker went unavailable / never delivered" },
  { value: "client_cancelled_no_reason", label: "Client cancelled, no reason given" },
  { value: "qc_failed_repeatedly", label: "Failed QC repeatedly" },
  { value: "other", label: "Other" },
];

/** Admin override: cancel from any non-terminal state. The reason stays internal. */
export function AdminCancel({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [lostReasonCategory, setLostReasonCategory] = useState("deadline_at_risk");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        className="min-h-11 px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#8C2F23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C2F23]"
        onClick={() => setOpen(true)}
      >
        Cancel this task…
      </button>
    );
  }

  return (
    <Card className="border-[#A23B2E]/30">
      <CardBody>
        <Field label="Reason category (Closed Job Log)">
          <select
            className={inputClass}
            value={lostReasonCategory}
            onChange={(e) => setLostReasonCategory(e.target.value)}
          >
            {LOST_REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {/*
          TWO FIELDS, AND THE LABELS ARE THE WHOLE POINT.

          These used to be one. The internal reason was the client's entire
          cancellation email whenever no money had moved, while this label
          promised it was written to the audit log. Whatever an operator types
          about margin, capacity or a worker now stops here.
        */}
        <Field
          label="Internal reason (required, audit log only, never sent)"
          hint="Free-text detail — the category above is what feeds pattern analysis."
        >
          <input
            className={inputClass}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Field
          label="Message to the client (optional)"
          hint="Sent verbatim, under the refund or capacity line. Leave empty to send only that."
        >
          <input
            className={inputClass}
            maxLength={500}
            value={clientMessage}
            onChange={(e) => setClientMessage(e.target.value)}
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
                const result = await cancelTask({
                  taskId,
                  reason,
                  clientMessage: clientMessage.trim() || undefined,
                  lostReasonCategory,
                });
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
            className="min-h-11 px-2 text-sm text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]"
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
        className="min-h-11 px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]"
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
            className="min-h-11 px-2 text-sm text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]"
            onClick={() => setOpen(false)}
          >
            Keep assignment
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
