"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  assignWorker,
  recordPeriodPayment,
  recordWorkerPeriodPayout,
  setStandingCapacityStatus,
  publishContextNote,
  publishDraftContextNote,
  rejectDraftContextNote,
} from "@/server/actions/standing-capacity";
import { Field, inputClass, buttonPrimary, buttonSecondary } from "@/components/ui";

type Result = { ok: boolean; error?: string };

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  function run(fn: () => Promise<Result>, onOk?: () => void) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onOk?.();
      router.refresh();
    });
  }
  return { run, error, isPending };
}

export function ReassignForm({
  accountId,
  workers,
}: {
  accountId: string;
  workers: { id: string; name: string }[];
}) {
  const { run, error, isPending } = useAction();
  const [workerId, setWorkerId] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Reassign to">
        <select
          className={inputClass}
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
        >
          <option value="">Choose a worker…</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
      <button
        className={buttonSecondary}
        disabled={isPending || !workerId}
        onClick={() => run(() => assignWorker({ accountId, workerId }), () => setWorkerId(""))}
      >
        {isPending ? "Assigning…" : "Assign"}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The weeks an operator can record against, newest first, already labelled and
 * marked as settled or not. Built server-side from selectablePeriods, so the
 * dropdown can never offer a week the account did not actually have.
 */
export type PeriodOption = { value: string; label: string; settled: boolean };

/** Shared by both record forms: same list, same "already recorded" marking. */
function PeriodPicker({
  periods,
  value,
  onChange,
}: {
  periods: PeriodOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Week">
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {periods.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
            {p.settled ? " — already recorded" : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function RecordPaymentForm({
  accountId,
  periods,
}: {
  accountId: string;
  periods: PeriodOption[];
}) {
  const { run, error, isPending } = useAction();
  const [reference, setReference] = useState("");
  const [periodStart, setPeriodStart] = useState(periods[0]?.value ?? "");

  return (
    <div className="flex flex-wrap items-end gap-2">
      {/* Periods roll on their own whether or not the week was billed, so a
          week missed at the time is only recoverable from this list. */}
      <PeriodPicker periods={periods} value={periodStart} onChange={setPeriodStart} />
      <Field label="Payment reference">
        <input
          className={inputClass}
          placeholder="Wire / invoice reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </Field>
      <button
        className={buttonSecondary}
        disabled={isPending || reference.trim().length < 3}
        onClick={() =>
          run(() => recordPeriodPayment({ accountId, reference, periodStart }), () => setReference(""))
        }
      >
        {isPending ? "Recording…" : "Record payment"}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RecordWorkerPayoutForm({
  accountId,
  periods,
}: {
  accountId: string;
  periods: PeriodOption[];
}) {
  const { run, error, isPending } = useAction();
  const [reference, setReference] = useState("");
  const [periodStart, setPeriodStart] = useState(periods[0]?.value ?? "");
  const [done, setDone] = useState(false);

  return (
    <div className="flex flex-wrap items-end gap-2">
      {/* The payout goes to whoever held the account when the chosen week
          closed, not to today's assignee — see assigneeAtPeriodEnd. */}
      <PeriodPicker periods={periods} value={periodStart} onChange={setPeriodStart} />
      <Field label="Payout reference (optional)">
        <input
          className={inputClass}
          placeholder="Wire reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </Field>
      <button
        className={buttonSecondary}
        disabled={isPending}
        onClick={() =>
          run(
            () =>
              recordWorkerPeriodPayout({ accountId, reference: reference || undefined, periodStart }),
            () => {
              setReference("");
              setDone(true);
            }
          )
        }
      >
        {isPending ? "Recording…" : "Record worker payout"}
      </button>
      {done ? <span className="text-sm text-[#166049]">Recorded.</span> : null}
      {error ? (
        <p role="alert" className="w-full text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function StatusControl({
  accountId,
  status,
}: {
  accountId: string;
  status: "active" | "paused" | "cancelled";
}) {
  const { run, error, isPending } = useAction();

  return (
    <div className="flex items-center gap-2">
      {status !== "active" ? (
        <button
          className={buttonSecondary}
          disabled={isPending}
          onClick={() => run(() => setStandingCapacityStatus({ accountId, status: "active" }))}
        >
          Resume
        </button>
      ) : (
        <button
          className={buttonSecondary}
          disabled={isPending}
          onClick={() => run(() => setStandingCapacityStatus({ accountId, status: "paused" }))}
        >
          Pause
        </button>
      )}
      {status !== "cancelled" ? (
        <button
          className="min-h-11 px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#8C2F23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C2F23]"
          disabled={isPending}
          onClick={() => run(() => setStandingCapacityStatus({ accountId, status: "cancelled" }))}
        >
          Cancel
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ContextNoteControls({ accountId }: { accountId: string }) {
  const { run, error, isPending } = useAction();
  const [body, setBody] = useState("");

  return (
    <div className="space-y-2">
      <textarea
        rows={2}
        placeholder="Write or rewrite the account's history…"
        className={inputClass}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        className={buttonPrimary}
        disabled={isPending || body.trim().length < 1}
        onClick={() => run(() => publishContextNote({ accountId, body }), () => setBody(""))}
      >
        {isPending ? "Publishing…" : "Publish note"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function DraftNoteControls({ noteId }: { noteId: string }) {
  const { run, error, isPending } = useAction();

  return (
    <div className="flex items-center gap-2">
      <button
        className={buttonSecondary}
        disabled={isPending}
        onClick={() => run(() => publishDraftContextNote({ noteId }))}
      >
        Publish as-is
      </button>
      <button
        className="min-h-11 px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#8C2F23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C2F23]"
        disabled={isPending}
        onClick={() => run(() => rejectDraftContextNote({ noteId }))}
      >
        Reject
      </button>
      {error ? (
        <p role="alert" className="text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
