import { Card, CardBody, SectionLabel, formatBytes } from "@/components/ui";
import type { HumanPackageForVa } from "@/lib/queries/execution";

/**
 * THE RESIDUAL MANDATE, as the worker reads it.
 *
 * Rendered instead of nothing when a machine block ran before them. It answers
 * the two questions a partly-finished job raises and a generic brief cannot:
 * what is already done, and which rows are mine.
 *
 * What is deliberately absent: every cost, the reserved budget, the client
 * price, the run's status, the step list, the primitives, the AI spend. The
 * worker's payout is the one on their task header, unchanged since they saw it
 * in the pool and frozen by a database trigger the moment they claimed. None
 * of it is filtered out in this component — it is never selected
 * (src/lib/queries/execution.ts) and pinned out by test/price-wall.test.ts.
 */
export function HumanPackagePanel({ pkg }: { pkg: HumanPackageForVa }) {
  const done = Math.max(0, pkg.unitsTotal - pkg.unitsRemaining);
  const pct = pkg.unitsTotal > 0 ? Math.round((done / pkg.unitsTotal) * 100) : 0;

  return (
    <Card tone="night">
      <CardBody>
        <SectionLabel tone="night">What is left for you</SectionLabel>

        <p className="mt-2 text-[15px] leading-relaxed text-[#F7F6F3]">{pkg.objective}</p>

        {/* Numbers lead, words caption. */}
        <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-3">
          <div>
            <div className="font-mono text-[28px] font-semibold leading-none tabular-nums text-[#F7F6F3]">
              {pkg.unitsRemaining}
            </div>
            <div className="mt-1 text-xs text-[#8A9099]">records to finish</div>
          </div>
          <div>
            <div className="font-mono text-[28px] font-semibold leading-none tabular-nums text-[#8A9099]">
              {done}
            </div>
            <div className="mt-1 text-xs text-[#8A9099]">already done for you ({pct}%)</div>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[#C9CDD3]">{pkg.whatIsAlreadyDone}</p>
        <p className="mt-3 text-sm leading-relaxed text-[#C9CDD3]">{pkg.instructions}</p>

        {pkg.checklist.length > 0 ? (
          <ol className="mt-4 space-y-1.5 text-sm text-[#C9CDD3]">
            {pkg.checklist.map((item, i) => (
              <li key={item} className="flex gap-2.5">
                <span className="shrink-0 font-mono text-xs tabular-nums text-[#8A9099]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {pkg.artifacts.length > 0 ? (
          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <SectionLabel tone="night">Work from these</SectionLabel>
            <ul className="mt-2 divide-y divide-white/[0.06] text-sm">
              {pkg.artifacts.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2.5">
                  <a
                    href={`/api/files/${a.id}/download`}
                    className="truncate font-mono text-[13px] font-medium text-[#F7F6F3] underline decoration-white/30 underline-offset-2 transition-colors duration-150 hover:decoration-white"
                  >
                    {a.fileName}
                  </a>
                  <span className="shrink-0 pl-2 font-mono text-xs tabular-nums text-[#8A9099]">
                    {a.artifactVisibility === "deliverable_candidate" ? "finish this one" : ""}{" "}
                    {formatBytes(a.sizeBytes)}
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
