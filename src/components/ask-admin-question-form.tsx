"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { askAdminQuestion } from "@/server/actions/va-tasks";
import { buttonSecondaryNight, inputClassNight } from "@/components/ui";

/**
 * The worker-side "Ask a question" — did not exist before this component.
 * Writes a TaskEvent the admin's existing task-detail audit log already
 * renders generically, plus a Notification to every admin. No state
 * change: asking a question never moves the task.
 */
export function AskAdminQuestionForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  if (sent) {
    return (
      <p className="text-sm text-[#8A9099]">
        Sent — an operator will follow up. You can keep working on the task while you wait.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        className="-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#8A9099] transition-colors duration-150 hover:text-[#F7F6F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]"
        onClick={() => setOpen(true)}
      >
        Ask a question
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-white/10 bg-[#111317] p-4">
      <label className="mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-white/55">
        Your question, for an operator
      </label>
      <textarea
        rows={3}
        className={inputClassNight}
        placeholder="Never include the client's name or contact details — this goes straight to an operator, same as everywhere else."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#FF9A8B]">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className={buttonSecondaryNight}
          disabled={isPending || message.trim().length < 5}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await askAdminQuestion({ taskId, message: message.trim() });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setSent(true);
              router.refresh();
            })
          }
        >
          {isPending ? "Sending…" : "Send to an operator"}
        </button>
        <button
          className="min-h-11 px-2 text-sm font-medium text-white/50 transition-colors duration-150 hover:text-white"
          onClick={() => {
            setOpen(false);
            setMessage("");
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
