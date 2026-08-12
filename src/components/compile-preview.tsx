import { Badge, Card, CardBody, SectionLabel } from "@/components/ui";
import type { CompilePreview } from "@/lib/queries/plan";

/**
 * LOT B — WHAT AFTERDESK THINKS IT CAN DO, SHOWN BEFORE OLIVIER SAYS YES.
 *
 * Server component, read-only, fed by compilePreviewForAdmin (a pure
 * compileDecisions call over stored rows — no run, no provider, no spend).
 * The badges are FACTS from existing signals, deliberately not a synthetic
 * confidence score: an operator who reads "MOSTLY HUMAN · UNPROVEN WORKFLOW"
 * knows exactly what they are about to sell.
 */

const BADGE_TONE: Record<string, string> = {
  // The only badge that invalidates the figures beside it — same ink as the
  // hardest refusals, because an operator must not price from this screen.
  "HUMAN COST UNKNOWN — PRICE MANUALLY": "border-[#8C2F23]/40 bg-[#8C2F23]/10 text-[#8C2F23]",
  "SENSITIVE / HUMAN ONLY": "border-[#8C2F23]/40 bg-[#8C2F23]/10 text-[#8C2F23]",
  "MISSING CAPABILITY": "border-[#8C2F23]/40 bg-[#8C2F23]/10 text-[#8C2F23]",
  "DEMOTED FOR BUDGET": "border-[#955710]/40 bg-[#D98324]/10 text-[#955710]",
  "MOSTLY HUMAN": "border-[#955710]/40 bg-[#D98324]/10 text-[#955710]",
  "UNPROVEN WORKFLOW": "border-[#955710]/40 bg-[#D98324]/10 text-[#955710]",
  "WEB FETCH": "border-black/12 bg-black/[0.03] text-[#5B6069]",
  "FILE AUTOMATION": "border-[#1E7F5C]/40 bg-[#1E7F5C]/10 text-[#166049]",
  UNCALIBRATED: "border-black/12 bg-black/[0.03] text-[#5B6069]",
};

export function CompilePreviewCard({ preview }: { preview: CompilePreview }) {
  return (
    <Card className="mb-4">
      <CardBody>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <SectionLabel as="h2">What would actually run</SectionLabel>
          <span className="font-mono text-xs tabular-nums text-[#5B6069]">
            {preview.automatedCount} machine · {preview.humanCount} human (
            {(preview.machineStepShareBps / 100).toFixed(0)}% of steps)
          </span>
        </div>

        {preview.badges.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {preview.badges.map((b) => (
              <Badge key={b} className={BADGE_TONE[b] ?? "border-black/12 text-[#5B6069]"}>
                {b}
              </Badge>
            ))}
          </div>
        ) : null}

        <ul className="space-y-1.5">
          {preview.steps.map((s) => (
            <li key={s.order} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-mono text-xs tabular-nums text-[#5B6069]">{s.order}.</span>
              <span className="text-[#14161A]">{s.title}</span>
              {s.executionMode === "automated" ? (
                <span className="font-mono text-xs text-[#166049]">
                  machine · {s.primitiveId}
                </span>
              ) : (
                <span className="font-mono text-xs text-[#955710]">human</span>
              )}
              {s.executionMode === "human" && s.handoffReason ? (
                <span className="text-xs italic text-[#5B6069]">{s.handoffReason}</span>
              ) : null}
              {s.demotedForBudget ? (
                <span className="text-xs text-[#955710]">(demoted for budget)</span>
              ) : null}
              {s.dependsOnOrder.length > 0 ? (
                <span className="font-mono text-[10px] text-[#5B6069]">
                  ← {s.dependsOnOrder.join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#14161A]/[0.06] pt-2 text-xs text-[#5B6069]">
          <span>
            Data class:{" "}
            <span className="font-mono">{preview.dataClass ?? "not computed (pre-1E plan)"}</span>
          </span>
          {preview.economics.policyVersion ? (
            <span>
              Automation economics ({preview.economics.policyVersion}): expected{" "}
              {preview.economics.expectedUsd ?? "—"} · worst pass{" "}
              {preview.economics.conservativeUsd ?? "—"} · funded ceiling{" "}
              {preview.economics.ceilingUsd ?? "—"}
            </span>
          ) : null}
        </div>
        {preview.dataClassSignals.length > 0 ? (
          <p className="mt-1 text-xs text-[#5B6069]">
            Class signals: {preview.dataClassSignals.join(" · ")}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
