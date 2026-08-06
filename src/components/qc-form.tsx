"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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

/** True when a keydown originates from a typing context — never steal those keys. */
function isTypingTarget(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  if (!t) return false;
  return (
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable
  );
}

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
  const [identityVerified, setIdentityVerified] = useState(false);
  const [showTally, setShowTally] = useState(false);
  // Phase 1C — the structured QC tally. Counts by severity, no composite
  // score, so a critical error can never hide behind an average. Optional
  // on the wire; always sent when touched.
  const [tally, setTally] = useState({
    unitsChecked: "",
    totalUnits: "",
    criticalErrorCount: "0",
    majorErrorCount: "0",
    minorErrorCount: "0",
    duplicateCount: "0",
    invalidSourceCount: "0",
    missingSourceCount: "0",
    formattingErrorCount: "0",
    correctedByReviewerCount: "0",
    reviewerNotes: "",
  });
  const [isPending, start] = useTransition();

  const num = (v: string) => (v === "" ? 0 : Number(v));
  const qualityPayload = () => ({
    totalUnits: tally.totalUnits === "" ? null : Number(tally.totalUnits),
    unitsChecked: tally.unitsChecked === "" ? null : Number(tally.unitsChecked),
    unitsCorrect: null,
    unitsIncomplete: null,
    unitsUnverifiable: null,
    criticalErrorCount: num(tally.criticalErrorCount),
    majorErrorCount: num(tally.majorErrorCount),
    minorErrorCount: num(tally.minorErrorCount),
    duplicateCount: num(tally.duplicateCount),
    invalidSourceCount: num(tally.invalidSourceCount),
    missingSourceCount: num(tally.missingSourceCount),
    formattingErrorCount: num(tally.formattingErrorCount),
    correctedByReviewerCount: num(tally.correctedByReviewerCount),
    reviewerNotes: tally.reviewerNotes.trim() || null,
  });
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const lastRound = qcRound + 1 >= maxQcRounds;

  function approve() {
    if (rating === null) {
      setError("Rate the work from 1 to 5 before approving.");
      return;
    }
    // Deliberately blocks the Ctrl+Enter path too: this batch-first form was
    // designed so a whole queue could be cleared from the keyboard, and that
    // is exactly how a signed deliverable would slip through to the client.
    if (!identityVerified) {
      setError("Confirm you checked the delivery for the worker's identity before releasing it.");
      return;
    }
    setError(null);
    start(async () => {
      const result = await approveDeliverable({ submissionId, rating, identityVerified, quality: qualityPayload() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(result.nextId ? `/admin/qc/${result.nextId}` : "/admin/qc");
      router.refresh();
    });
  }

  /** Radiogroup arrow-key navigation: move selection AND focus together. */
  function onRadioKeyDown(e: React.KeyboardEvent) {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min((rating ?? 0) + 1, 5);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max((rating ?? 2) - 1, 1);
    if (e.key === "Home") next = 1;
    if (e.key === "End") next = 5;
    if (next !== null) {
      e.preventDefault();
      setRating(next);
      radioRefs.current[next - 1]?.focus();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (rejecting) return;
      if (isTypingTarget(e.target)) return;

      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= "1" && e.key <= "5") {
        setRating(Number(e.key));
      }
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
        <SectionLabel as="h2">Quality check</SectionLabel>

        {!rejecting ? (
          <>
            <div className="mt-4">
              <span id="qc-rating-label" className="mb-2 block text-[13px] font-medium text-[#14161A]">
                Rate this delivery
              </span>
              <div
                role="radiogroup"
                aria-labelledby="qc-rating-label"
                className="flex gap-2"
                onKeyDown={onRadioKeyDown}
              >
                {[1, 2, 3, 4, 5].map((n) => {
                  const selected = rating === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${n} out of 5`}
                      tabIndex={selected || (rating === null && n === 1) ? 0 : -1}
                      ref={(el) => {
                        radioRefs.current[n - 1] = el;
                      }}
                      onClick={() => setRating(n)}
                      className={`inline-flex h-11 w-11 items-center justify-center gap-0.5 rounded-md border font-mono text-sm font-medium tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                        selected
                          ? "border-[#14161A] bg-[#14161A] text-[#F7F6F3]"
                          : "border-[#14161A]/20 bg-white text-[#14161A] hover:border-[#14161A]/40"
                      }`}
                    >
                      {selected ? <span aria-hidden="true">✓</span> : null}
                      {n}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-[#5B6069]">
                Press 1–5 to rate. This feeds the worker&apos;s rolling score — the client
                never sees it.
              </p>
            </div>

            {/* Phase 1C — the structured tally. Collapsed so the batch
                keyboard flow stays untouched; the counts land on
                TaskQualityReview and feed calibration. */}
            <div className="mt-5">
              <button
                type="button"
                className="text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
                onClick={() => setShowTally((v) => !v)}
              >
                {showTally ? "Hide quality tally" : "Quality tally (errors found)…"}
              </button>
              {showTally ? (
                <div className="mt-3 space-y-3 rounded-[6px] border border-[#14161A]/10 p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        ["unitsChecked", "Units checked"],
                        ["totalUnits", "Units total"],
                        ["criticalErrorCount", "Critical errors"],
                        ["majorErrorCount", "Major errors"],
                        ["minorErrorCount", "Minor errors"],
                        ["duplicateCount", "Duplicates"],
                        ["invalidSourceCount", "Invalid sources"],
                        ["missingSourceCount", "Missing sources"],
                        ["formattingErrorCount", "Formatting"],
                        ["correctedByReviewerCount", "Corrected by you"],
                      ] as const
                    ).map(([key, label]) => (
                      <Field key={key} label={label}>
                        <input
                          inputMode="numeric"
                          className={inputClass}
                          value={tally[key]}
                          onChange={(e) =>
                            setTally((t) => ({ ...t, [key]: e.target.value.replace(/\D/g, "") }))
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <Field label="Reviewer notes (internal)">
                    <textarea
                      rows={2}
                      className={inputClass}
                      value={tally.reviewerNotes}
                      onChange={(e) => setTally((t) => ({ ...t, reviewerNotes: e.target.value }))}
                    />
                  </Field>
                  {num(tally.criticalErrorCount) > 0 ? (
                    <p className="text-sm text-[#955710]">
                      Critical errors are recorded as such — no score averages them away.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* RULE 1's last gate, mirroring the pricing side's own
                attestation (admin.ts approvePricing). Metadata scrubbing
                cannot read the visible content of a delivery — only a human
                can catch a worker who signed their work or invited the
                client to go direct. */}
            <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-[6px] border border-[#14161A]/10 bg-[#14161A]/[0.02] p-3">
              <input
                type="checkbox"
                checked={identityVerified}
                onChange={(e) => setIdentityVerified(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#14161A]"
              />
              <span className="text-[13px] leading-snug text-[#30343A]">
                I opened the delivery and checked it for the worker&apos;s name, contacts, or any
                invitation to work directly.
              </span>
            </label>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-[#8C2F23]">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button className={buttonPrimary} disabled={isPending} onClick={approve}>
                {isPending ? "Approving…" : "Approve & next"}
              </button>
              <span className="font-mono text-xs text-[#5B6069]">Ctrl+Enter</span>
              <span className="flex-1" />
              <button
                className="min-h-11 px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#955710] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]"
                onClick={() => setRejecting(true)}
              >
                Send back for changes…
              </button>
            </div>
            <p className="mt-3 text-xs text-[#5B6069]">
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
              <p className="text-sm text-[#955710]">
                This is the last round. Sending it back again returns the task to the pool
                for a different worker.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-[#8C2F23]">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonSecondary}
                disabled={isPending || comment.trim().length < 5}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const result = await rejectDeliverable({ submissionId, comment, quality: qualityPayload() });
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
                className="min-h-11 px-2 text-sm text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]"
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
