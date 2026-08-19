"use client";

import { useState, useTransition } from "react";
import { submitHumanUnitResult } from "@/server/actions/human-unit-worker";
import type { WorkerUnitView } from "@/lib/queries/human-unit";
import { Card, CardBody, Field, SectionLabel, buttonPrimaryNight, inputClassNight } from "@/components/ui";

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function HumanWorkUnitWorker({
  unit,
  taskId,
  claimGeneration,
}: {
  unit: WorkerUnitView;
  taskId: string;
  claimGeneration: number;
}) {
  const [result, setResult] = useState("{}");
  const [fileIds, setFileIds] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (unit.kind === "status") {
    return (
      <Card tone="night">
        <CardBody>
          <SectionLabel tone="night">Human work unit</SectionLabel>
          <p className="mt-2 text-sm font-medium capitalize text-[#F7F6F3]">{unit.status}</p>
          <p className="mt-1 text-sm leading-relaxed text-[#8A9099]">
            {unit.nextAction === "wait_for_resume"
              ? "The operator accepted the result. The system is resuming the remaining work."
              : unit.nextAction === "wait_for_completion"
                ? "The remaining work is running. You do not need to take another action."
                : unit.nextAction === "contact_support"
                  ? "This unit needs an operator decision. Contact support if you need help."
                  : "This unit is complete."}
          </p>
        </CardBody>
      </Card>
    );
  }

  const canSubmit = !unit.readOnly && unit.state !== "in_review";

  return (
    <Card tone="night">
      <CardBody>
        <SectionLabel tone="night">Your declared human work unit</SectionLabel>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#F7F6F3]">
          {unit.instructions}
        </p>

        {unit.declaredInputs.length > 0 ? (
          <div className="mt-5 border-t border-white/[0.08] pt-4">
            <SectionLabel tone="night">Declared inputs</SectionLabel>
            <ul className="mt-2 space-y-2 text-sm text-[#C9CDD3]">
              {unit.declaredInputs.map((input) => (
                <li key={`${input.kind}:${input.label}`} className="rounded-md border border-white/[0.08] bg-white/[0.03] p-3">
                  <p className="font-medium text-[#F7F6F3]">{input.label}</p>
                  {input.fileRef ? (
                    <a
                      href={`/api/files/${input.fileRef.id}/download`}
                      className="mt-1 block truncate font-mono text-xs text-[#C9CDD3] underline decoration-white/30 underline-offset-2"
                    >
                      {input.fileRef.fileName}
                    </a>
                  ) : input.value ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[#C9CDD3]">{input.value}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 border-t border-white/[0.08] pt-4 sm:grid-cols-2">
          <div>
            <SectionLabel tone="night">Acceptance criteria</SectionLabel>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[#C9CDD3]">
              {unit.acceptanceCriteria.map((criterion) => <li key={criterion}>• {criterion}</li>)}
            </ul>
          </div>
          <div>
            <SectionLabel tone="night">Required deliverables</SectionLabel>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[#C9CDD3]">
              {unit.requiredArtifactKinds.map((kind) => <li key={kind}>• {kind}</li>)}
            </ul>
            <p className="mt-3 text-xs text-[#8A9099]">
              {unit.remainingRevisions} revision{unit.remainingRevisions === 1 ? "" : "s"} remaining
              {unit.submissionDeadlineAt ? ` · deadline ${unit.submissionDeadlineAt.toLocaleString()}` : ""}
            </p>
          </div>
        </div>

        {unit.revisionInstructions ? (
          <div className="mt-5 rounded-md border border-[#E8A854]/40 bg-[#E8A854]/[0.08] p-3">
            <SectionLabel tone="night">Revision instructions</SectionLabel>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#F7F6F3]">{unit.revisionInstructions}</p>
          </div>
        ) : null}

        {unit.latestOwnCandidate ? (
          <div className="mt-5 rounded-md border border-white/[0.08] bg-white/[0.03] p-3">
            <SectionLabel tone="night">Last submitted result · {unit.latestOwnCandidate.status}</SectionLabel>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#C9CDD3]">
              {pretty(unit.latestOwnCandidate.payload)}
            </pre>
          </div>
        ) : null}

        {canSubmit ? (
          <div className="mt-5 space-y-4 border-t border-white/[0.08] pt-4">
            <Field label="Result (JSON matching the declared output)" tone="night">
              <textarea rows={8} className={inputClassNight} value={result} onChange={(event) => setResult(event.target.value)} />
            </Field>
            <Field label="Uploaded file IDs (optional, comma-separated)" tone="night">
              <input className={inputClassNight} value={fileIds} onChange={(event) => setFileIds(event.target.value)} />
            </Field>
            <button
              className={buttonPrimaryNight}
              disabled={pending}
              onClick={() => start(async () => {
                let payload: unknown;
                try {
                  payload = JSON.parse(result);
                } catch {
                  setMessage("Enter valid JSON before submitting.");
                  return;
                }
                const response = await submitHumanUnitResult({
                  taskId,
                  claimGeneration,
                  result: payload,
                  fileIds: fileIds.split(",").map((value) => value.trim()).filter(Boolean),
                });
                setMessage(response.ok ? "Submitted for review." : response.error);
                if (response.ok) window.location.reload();
              })}
            >
              {pending ? "Submitting…" : "Submit for review"}
            </button>
            {message ? <p role="alert" className="text-sm text-[#C9CDD3]">{message}</p> : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
