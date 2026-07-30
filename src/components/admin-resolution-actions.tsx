"use client";

import { useState, useTransition } from "react";
import {
  decideDispute,
  publishRevisionInstructions,
} from "@/server/actions/admin-resolutions";
import { Field, buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

function ErrorLine({ children }: { children: string | null }) {
  return children ? <p role="alert" className="text-sm text-[#8C2F23]">{children}</p> : null;
}

export function RevisionInstructionsForm({ taskId }: { taskId: string }) {
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Field label="Worker revision instructions">
        <textarea
          className={inputClass}
          rows={4}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Identity-safe instructions shown to the worker"
        />
      </Field>
      <p className="text-xs text-[#5B6069]">
        Remove names, companies, emails, URLs and any other identifying detail.
      </p>
      <button
        className={buttonPrimary}
        disabled={pending || summary.trim().length < 10}
        onClick={() =>
          start(async () => {
            const result = await publishRevisionInstructions({ taskId, summary });
            setError(result.ok ? null : result.error);
            if (result.ok) window.location.reload();
          })
        }
      >
        {pending ? "Publishing…" : "Publish to worker"}
      </button>
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}

export function DisputeDecisionForm({ disputeId }: { disputeId: string }) {
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function decide(outcome: "rejected" | "rework" | "upheld") {
    setError(null);
    start(async () => {
      const result = await decideDispute({ disputeId, outcome, summary });
      setError(result.ok ? null : result.error);
      if (result.ok) window.location.reload();
    });
  }

  return (
    <div className="space-y-2">
      <Field label="Identity-safe worker summary">
        <textarea
          className={inputClass}
          rows={4}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Required only when ordering rework"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button className={buttonSecondary} disabled={pending} onClick={() => decide("rejected")}>
          Delivery stands
        </button>
        <button
          className={buttonPrimary}
          disabled={pending || summary.trim().length < 10}
          onClick={() => decide("rework")}
        >
          Order rework
        </button>
        <button className={buttonSecondary} disabled={pending} onClick={() => decide("upheld")}>
          Uphold & refund
        </button>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}
