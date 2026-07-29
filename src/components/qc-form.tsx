"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { approveDeliverable, rejectDeliverable } from "@/server/actions/admin-qc";
import {
  Card,
  CardBody,
  Field,
  SectionLabel,
  inputClass,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";

/**
 * Batch-first QC: rating with 1-5 keys, Ctrl+Enter to approve, and
 * approve-and-advance straight to the next item. The operator's morning
 * throughput is the ceiling on the whole business.
 */
export function QcForm({
  submissionId,
  qcRound,
  maxQcRounds,
}: {
  submissionId: string;
  qcRound: number;
  maxQcRounds: number;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const lastRound = qcRound + 1 >= maxQcRounds;

  function approve() {
    if (rating === null) {
      setError("Rate the work from 1 to 5 before approving.");
      return;
    }
    setError(null);
    start(async () => {
      const result = await approveDeliverable({ submissionId, rating });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(result.nextId ? `/admin/qc/${result.nextId}` : "/admin/qc");
      router.refresh();
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (rejecting) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;

      if (e.key >= "1" && e.key <= "5") setRating(Number(e.key));
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        approve();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rating, rejecting, submissionId]);

  return (
    <Card>
      <CardBody>
        <SectionLabel>Quality check</SectionLabel>

        {!rejecting ? (
          <>
            <div className="mt-4">
              <span className="mb-2 block text-[13px] font-medium text-neutral-800">
                Rate this delivery
              </span>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    className={`h-10 w-10 rounded-md border text-sm font-medium tabular-nums transition-colors ${
                      rating === n
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-neutral-400">
                Press 1–5 to rate. This feeds the worker&apos;s rolling score — the client
                never sees it.
              </p>
            </div>

            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button className={buttonPrimary} disabled={isPending} onClick={approve}>
                {isPending ? "Approving…" : "Approve & next"}
              </button>
              <span className="text-xs text-neutral-400">Ctrl+Enter</span>
              <span className="flex-1" />
              <button
                className="text-sm font-medium text-neutral-400 hover:text-red-600"
                onClick={() => setRejecting(true)}
              >
                Send back for changes…
              </button>
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Approving releases the files to the client. Nothing has reached them yet.
            </p>
          </>
        ) : (
          <div className="mt-4 space-y-3">
            <Field
              label="What needs fixing"
              hint="The worker sees this verbatim. Be specific — vague notes come back wrong."
            >
              <textarea
                rows={4}
                autoFocus
                className={inputClass}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
            {lastRound ? (
              <p className="text-sm text-amber-700">
                This is the last round. Sending it back again returns the task to the pool
                for a different worker.
              </p>
            ) : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonSecondary}
                disabled={isPending || comment.trim().length < 5}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const result = await rejectDeliverable({ submissionId, comment });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    router.push(result.nextId ? `/admin/qc/${result.nextId}` : "/admin/qc");
                    router.refresh();
                  })
                }
              >
                {isPending ? "Sending back…" : "Send back for changes"}
              </button>
              <button
                className="px-2 text-sm text-neutral-500 hover:text-neutral-800"
                onClick={() => setRejecting(false)}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
