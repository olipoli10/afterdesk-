import { Badge, Card, CardBody, SectionLabel, formatBytes } from "@/components/ui";
import { microsToUsdString } from "@/lib/ai-work-engine/tool-cost";
import { formatCents } from "@/lib/money";
import type { ExecutionForAdmin } from "@/lib/queries/execution";

/**
 * THE OPERATOR'S VIEW OF ONE RUN. Admin-only, and the only place any of this
 * renders — metered costs, step errors, primitives, the reserved budget and the
 * residual arithmetic all live here and nowhere else.
 *
 * Numbers lead, words caption. Every figure is measured, not estimated: the
 * costs come from TaskToolInvocation rows written per attempt, and the
 * automated share is a count of units, not a percentage a model asserted.
 */

const RUN_TONE: Record<string, string> = {
  running: "border-[#1B2740] bg-[#1B2740]/50 text-[#3A4A66]",
  awaiting_human: "border-[#D8DCE2] bg-transparent text-[#5B6069]",
  paused: "border-[#F0DCC0] bg-[#FBF3E7] text-[#955710]",
  abandoned: "border-[#E4D7D5] bg-[#FAF2F1] text-[#8C2F23]",
  done: "border-[#CFE3DA] bg-[#EFF6F3] text-[#166049]",
  compiling: "border-[#D8DCE2] bg-transparent text-[#5B6069]",
};

const STEP_TONE: Record<string, string> = {
  done: "text-[#166049]",
  failed: "text-[#8C2F23]",
  running: "text-[#3A4A66]",
  handed_to_human: "text-[#5B6069]",
  pending: "text-[#8A9099]",
  ready: "text-[#8A9099]",
};

export function ExecutionPanel({ run }: { run: ExecutionForAdmin }) {
  const pkg = run.humanPackage;
  const total = run.unitsTotal ?? 0;
  const auto = run.unitsResolvedAutomatically ?? 0;
  const autoPct = total > 0 ? Math.round((auto / total) * 100) : 0;
  const spendMicros = run.actualAiCostMicros + run.actualToolCostMicros;

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Automated execution</SectionLabel>
          <Badge className={RUN_TONE[run.status] ?? RUN_TONE.compiling}>
            {run.status.replace(/_/g, " ")}
          </Badge>
        </div>

        {run.pausedReason ? (
          <p className="mt-3 rounded border border-[#F0DCC0] bg-[#FBF3E7] px-3 py-2 text-sm leading-relaxed text-[#955710]">
            {run.pausedReason}
          </p>
        ) : null}

        {/* What actually happened, in six measured numbers. */}
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-4">
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#5B6069]">
              Units automated
            </dt>
            <dd className="mt-0.5 font-mono text-[22px] font-semibold tabular-nums text-[#14161A]">
              {auto}/{total} <span className="text-sm font-normal text-[#5B6069]">({autoPct}%)</span>
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#5B6069]">
              Steps
            </dt>
            <dd className="mt-0.5 font-mono text-[22px] font-semibold tabular-nums text-[#14161A]">
              {run.automatedStepCount}
              <span className="text-sm font-normal text-[#5B6069]"> machine</span>{" "}
              {run.humanStepCount}
              <span className="text-sm font-normal text-[#5B6069]"> human</span>
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#5B6069]">
              Actual spend
            </dt>
            <dd className="mt-0.5 font-mono text-[22px] font-semibold tabular-nums text-[#14161A]">
              {microsToUsdString(spendMicros)}
            </dd>
            <dd className="text-xs text-[#5B6069]">
              {microsToUsdString(run.actualAiCostMicros)} model,{" "}
              {microsToUsdString(run.actualToolCostMicros)} search
            </dd>
          </div>
          {pkg ? (
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#5B6069]">
                Residual payout
              </dt>
              <dd className="mt-0.5 font-mono text-[22px] font-semibold tabular-nums text-[#14161A]">
                {formatCents(pkg.computedPayoutCents, "USD")}
              </dd>
              <dd className="text-xs text-[#5B6069]">
                {pkg.estimatedMinutes} min, against a reserve of{" "}
                {formatCents(pkg.reservedBudgetCents, "USD")}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-5 border-t border-[#14161A]/10 pt-4">
          <SectionLabel>Steps</SectionLabel>
          <ol className="mt-2 divide-y divide-[#14161A]/[0.07]">
            {run.steps.map((s) => (
              <li key={s.id} className="py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-mono text-xs tabular-nums text-[#5B6069]">
                    {String(s.order).padStart(2, "0")}
                  </span>
                  <span className="font-medium text-[#14161A]">{s.planStep.title}</span>
                  <span className={`font-mono text-xs ${STEP_TONE[s.status] ?? ""}`}>
                    {s.status.replace(/_/g, " ")}
                  </span>
                  {s.primitiveId ? (
                    <span className="font-mono text-xs text-[#5B6069]">
                      {s.primitiveId} v{s.primitiveVersion}
                    </span>
                  ) : null}
                  {s.attempts > 0 ? (
                    <span className="font-mono text-xs tabular-nums text-[#5B6069]">
                      {s.attempts} attempt{s.attempts === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {s.actualCostMicros > 0 ? (
                    <span className="font-mono text-xs tabular-nums text-[#5B6069]">
                      {microsToUsdString(s.actualCostMicros)}
                    </span>
                  ) : null}
                </div>
                {s.handoffReason ? (
                  <p className="mt-1 text-xs leading-relaxed text-[#5B6069]">{s.handoffReason}</p>
                ) : null}
                {s.lastError ? (
                  <p className="mt-1 font-mono text-xs leading-relaxed text-[#8C2F23]">
                    {s.lastError}
                  </p>
                ) : null}
                {s.outputSummary ? (
                  <p className="mt-1 font-mono text-xs leading-relaxed text-[#5B6069]">
                    {JSON.stringify(s.outputSummary)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        {run.artifacts.length > 0 ? (
          <div className="mt-5 border-t border-[#14161A]/10 pt-4">
            <SectionLabel>Artifacts</SectionLabel>
            <ul className="mt-2 divide-y divide-[#14161A]/[0.07] text-sm">
              {run.artifacts.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <a
                    href={`/api/files/${a.id}/download`}
                    className="truncate font-mono text-[13px] underline decoration-[#14161A]/25 underline-offset-2 hover:decoration-[#14161A]"
                  >
                    {a.workflowStepRun ? `${a.workflowStepRun.order}. ` : ""}
                    {a.fileName}
                  </a>
                  <span className="shrink-0 pl-2 font-mono text-xs tabular-nums text-[#5B6069]">
                    {a.artifactVisibility?.replace(/_/g, " ")} {formatBytes(a.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
