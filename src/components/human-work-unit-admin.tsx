"use client";

import { useState, useTransition } from "react";
import {
  continuePausedHumanUnitRun,
  decideHumanUnitCandidate,
  openHumanUnitReview,
} from "@/server/actions/human-unit-admin";
import type { AdminUnitView } from "@/lib/queries/human-unit";
import { Card, CardBody, Field, SectionLabel, buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

function candidateId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

function DateValue({ value }: { value: Date | null }) {
  return value ? <>{value.toLocaleString()}</> : <>No applicable deadline</>;
}

export function HumanWorkUnitAdmin({ view }: { view: AdminUnitView }) {
  const [instructions, setInstructions] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const activeCandidateId = view.candidates.map(candidateId).find((id): id is string => id !== null) ?? null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const result = await action();
      setMessage(result.ok ? "Recorded." : (result.error ?? "The action could not be completed."));
      if (result.ok) window.location.reload();
    });
  }

  return (
    <Card className="mb-4">
      <CardBody>
        <SectionLabel as="h2">Human work unit</SectionLabel>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[#5B6069]">State</dt><dd className="mt-0.5 font-medium text-[#14161A]">{view.answers.state}</dd></div>
          <div><dt className="text-xs text-[#5B6069]">Who may act</dt><dd className="mt-0.5 text-[#14161A]">{view.answers.whoMayAct}</dd></div>
          <div><dt className="text-xs text-[#5B6069]">Applicable deadline</dt><dd className="mt-0.5 text-[#14161A]"><DateValue value={view.answers.applicableDeadline} /></dd></div>
          <div><dt className="text-xs text-[#5B6069]">Remaining revisions</dt><dd className="mt-0.5 text-[#14161A]">{view.answers.remainingRevisions ?? "—"}</dd></div>
        </dl>
        <div className="mt-4 rounded-md border border-[#14161A]/10 bg-[#F7F6F3] p-3 text-sm">
          <p><span className="font-medium">Why:</span> {view.answers.why || "No wait reason recorded."}</p>
          {view.answers.pausedDetail ? <p className="mt-1 text-[#5B6069]">{view.answers.pausedDetail}</p> : null}
          <p className="mt-1 text-[#5B6069]"><span className="font-medium text-[#14161A]">Safe next action:</span> {view.answers.safeNextAction}</p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {view.answers.state === "submitted" ? <button className={buttonSecondary} disabled={pending} onClick={() => run(() => openHumanUnitReview(view.taskId))}>Open review</button> : null}
          {activeCandidateId && ["submitted", "in_review"].includes(view.answers.state) ? (
            <>
              <button className={buttonPrimary} disabled={pending} onClick={() => run(() => decideHumanUnitCandidate({ candidateId: activeCandidateId, outcome: "accept" }))}>Accept candidate</button>
              <button className={buttonSecondary} disabled={pending || instructions.trim().length < 5} onClick={() => run(() => decideHumanUnitCandidate({ candidateId: activeCandidateId, outcome: "reject", revisionInstructions: instructions }))}>Request revision</button>
            </>
          ) : null}
          {view.answers.state === "paused" ? (
            <>
              <button className={buttonPrimary} disabled={pending || reason.trim().length < 3} onClick={() => run(() => continuePausedHumanUnitRun({ taskId: view.taskId, decision: "continue_within_ceiling", reason }))}>Continue within ceiling</button>
              <button className={buttonSecondary} disabled={pending || reason.trim().length < 3} onClick={() => run(() => continuePausedHumanUnitRun({ taskId: view.taskId, decision: "fail_closed_to_manual", reason }))}>Fail closed to manual</button>
            </>
          ) : null}
        </div>
        {activeCandidateId && ["submitted", "in_review"].includes(view.answers.state) ? <div className="mt-4"><Field label="Revision instructions"><textarea rows={3} className={inputClass} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></Field></div> : null}
        {view.answers.state === "paused" ? <div className="mt-4"><Field label="Operator reason"><textarea rows={3} className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field></div> : null}
        {message ? <p role="alert" className="mt-3 text-sm text-[#5B6069]">{message}</p> : null}
      </CardBody>
    </Card>
  );
}
