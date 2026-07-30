"use client";

import { useState, useTransition } from "react";
import {
  markPayoutPaid,
  recordManualRefund,
  recordManualPayment,
} from "@/server/actions/admin-payments";
import { Field, buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

export function ManualPaymentForm({ taskId }: { taskId: string }) {
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <Field label="Payment reference">
        <input
          className={inputClass}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Bank transfer or invoice reference"
        />
      </Field>
      <button
        type="button"
        className={buttonSecondary}
        disabled={pending || reference.trim().length < 3}
        onClick={() =>
          start(async () => {
            const result = await recordManualPayment({ taskId, reference });
            setError(result.ok ? null : result.error);
            if (result.ok) window.location.reload();
          })
        }
      >
        {pending ? "Recording…" : "Record received payment"}
      </button>
      {error ? <p role="alert" className="text-sm text-[#8C2F23]">{error}</p> : null}
    </div>
  );
}

export function ManualRefundForm({ intentId }: { intentId: string }) {
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <Field label="Refund reference">
        <input
          className={inputClass}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Bank refund reference"
        />
      </Field>
      <button
        type="button"
        className={buttonSecondary}
        disabled={pending || reference.trim().length < 3}
        onClick={() =>
          start(async () => {
            const result = await recordManualRefund({ intentId, reference });
            setError(result.ok ? null : result.error);
            if (result.ok) window.location.reload();
          })
        }
      >
        {pending ? "Recording…" : "Record manual refund"}
      </button>
      {error ? <p role="alert" className="text-sm text-[#8C2F23]">{error}</p> : null}
    </div>
  );
}

export function PayoutForm({ payoutId }: { payoutId: string }) {
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <Field label="Payout method">
        <input
        className={inputClass}
        value={method}
        onChange={(event) => setMethod(event.target.value)}
        placeholder="Method (Wise, bank…)"
        />
      </Field>
      <Field label="Payout reference">
        <input
        className={inputClass}
        value={reference}
        onChange={(event) => setReference(event.target.value)}
        placeholder="Payout reference"
        />
      </Field>
      <button
        type="button"
        className={buttonPrimary}
        disabled={pending || method.trim().length < 2 || reference.trim().length < 3}
        onClick={() =>
          start(async () => {
            const result = await markPayoutPaid({ payoutId, method, reference });
            setError(result.ok ? null : result.error);
            if (result.ok) window.location.reload();
          })
        }
      >
        {pending ? "Saving…" : "Mark paid"}
      </button>
      {error ? <p role="alert" className="text-sm text-[#8C2F23] sm:col-span-3">{error}</p> : null}
    </div>
  );
}
