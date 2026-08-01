"use client";

import { useState, useTransition } from "react";
import { runClosedJobAnalysis } from "@/server/actions/admin-closed-jobs";
import type { Observation } from "@/lib/closed-job-analysis";
import { buttonSecondary, Card, CardBody } from "@/components/ui";

/**
 * On-demand only — no auto-refresh, no polling, nothing pushed. The admin
 * clicks this, or nothing happens. See runClosedJobAnalysis's doc comment.
 */
export function AnalyzeButton() {
  const [observations, setObservations] = useState<Observation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  return (
    <div>
      <button
        className={buttonSecondary}
        disabled={isPending}
        onClick={() =>
          start(async () => {
            setError(null);
            setObservations(null);
            const result = await runClosedJobAnalysis();
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setObservations(result.observations);
          })
        }
      >
        {isPending ? "Analyzing…" : "Analyze patterns"}
      </button>

      {error ? <p className="mt-2 text-sm text-[#8C2F23]">{error}</p> : null}

      {observations && observations.length > 0 ? (
        <div className="mt-4 space-y-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
            Observations — read and decide, nothing here acts on its own
          </p>
          {observations.map((o, i) => (
            <Card key={i}>
              <CardBody>
                <p className="text-sm font-medium text-[#14161A]">{o.finding}</p>
                <p className="mt-1 text-xs text-[#5B6069]">{o.evidence}</p>
                <p className="mt-2 text-sm text-[#14161A]">{o.suggestion}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
