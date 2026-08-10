"use client";

import { useState, useTransition } from "react";
import { openDispute, requestRevision } from "@/server/actions/client-tasks";
import { Field, buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

const REASONS = [
  ["missing_work", "Required work is missing"],
  ["incorrect_output", "The output is materially incorrect"],
  ["format_not_followed", "The requested format was not followed"],
  ["fabricated_or_unverifiable", "Content is fabricated or cannot be verified"],
] as const;

export function ClientResolutionActions({
  taskId,
  revisionsLeft,
}: {
  taskId: string;
  revisionsLeft: number;
}) {
  const [mode, setMode] = useState<"revision" | "dispute" | null>(null);
  const [detail, setDetail] = useState("");
  const [reasonCode, setReasonCode] =
    useState<(typeof REASONS)[number][0]>("missing_work");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const result =
        mode === "revision"
          ? await requestRevision({ taskId, detail })
          : await openDispute({ taskId, detail, reasonCode });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.reload();
    });
  }

  if (!mode) {
    return (
      <div className="mt-4 flex flex-wrap gap-2 border-t border-[#14161A]/[0.06] pt-4">
        {revisionsLeft > 0 ? (
          <button className={buttonSecondary} onClick={() => setMode("revision")}>
            Request a revision ({revisionsLeft} left)
          </button>
        ) : null}
        <button className={buttonSecondary} onClick={() => setMode("dispute")}>
          Open a dispute
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 border-t border-[#14161A]/[0.06] pt-4">
      {mode === "dispute" ? (
        <Field label="Which written standard was missed?">
          <select
            className={inputClass}
            value={reasonCode}
            onChange={(event) =>
              setReasonCode(event.target.value as (typeof REASONS)[number][0])
            }
          >
            {REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label={mode === "revision" ? "What exactly needs changing?" : "Evidence and details"}>
        <textarea
          className={inputClass}
          rows={4}
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          placeholder="Point to the file, row, section, requested format, or acceptance criterion."
        />
      </Field>
      <p className="text-xs leading-relaxed text-[#5B6069]">
        Your note goes to the operator, not directly to the specialist. Remove personal contact
        details; the operator writes an identity-safe instruction if rework is needed.
      </p>
      {error ? <p role="alert" className="text-sm text-[#8C2F23]">{error}</p> : null}
      <div className="flex gap-2">
        <button
          className={buttonPrimary}
          disabled={pending || detail.trim().length < (mode === "revision" ? 10 : 20)}
          onClick={submit}
        >
          {pending ? "Sending…" : mode === "revision" ? "Send revision request" : "Open dispute"}
        </button>
        <button className={buttonSecondary} disabled={pending} onClick={() => setMode(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
