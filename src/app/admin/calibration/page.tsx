import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { calibrationOverviewForAdmin } from "@/lib/queries/operational-intelligence";
import { Badge, Card, CardBody, EmptyState, PageTitle } from "@/components/ui";

export const metadata = { title: "Calibration" };

/**
 * WORKFLOW CALIBRATION — the operational moat, read-only. Every number here
 * is derived from the actuals and entirely rebuildable; every rate is shown
 * WITH its own sample size, because "62% automated" over n=2 and over n=200
 * are different facts wearing the same percentage. No decorative charts:
 * a table an operator prices from.
 */

const LEVEL_TONE: Record<string, string> = {
  uncalibrated: "border-black/12 bg-black/[0.03] text-[#5B6069]",
  early_signal: "border-[#955710]/40 bg-[#D98324]/10 text-[#955710]",
  partially_calibrated: "border-[#1E7F5C]/30 bg-[#1E7F5C]/[0.06] text-[#166049]",
  calibrated: "border-[#1E7F5C]/40 bg-[#1E7F5C]/10 text-[#166049]",
};

const pctOf = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toFixed(1)}%`);
const usdOf = (micros: bigint | null) =>
  micros === null ? "—" : `$${(Number(micros / 10_000n) / 100).toFixed(2)}`;

export default async function CalibrationPage() {
  await requireRole("ADMIN");
  const profiles = await calibrationOverviewForAdmin();

  return (
    <>
      <PageTitle
        title="Calibration"
        sub="What each workflow actually costs, automates and earns — pooled across pricing policies, stratified where the policy matters. Recommendations are read-only; nothing here changes a price."
      />

      {profiles.length === 0 ? (
        <EmptyState
          title="No workflow profiles yet"
          body="Profiles appear once accepted tasks with an execution plan finish and their operational actuals are computed."
        />
      ) : (
        <Card>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#14161A]/10 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                    <th className="py-2 pr-3">Workflow</th>
                    <th className="py-2 pr-3">Level</th>
                    <th className="py-2 pr-3">n (rel / cost / margin)</th>
                    <th className="py-2 pr-3">Delivered</th>
                    <th className="py-2 pr-3">Tech. reliability</th>
                    <th className="py-2 pr-3">First-pass QC</th>
                    <th className="py-2 pr-3">Automation (med.)</th>
                    <th className="py-2 pr-3">Cost all-in (med.)</th>
                    <th className="py-2 pr-3">Margin all-in (med.)</th>
                    <th className="py-2">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#14161A]/[0.05]">
                  {profiles.map((p) => (
                    <tr key={p.executionWorkflowHash}>
                      <td className="max-w-[280px] py-2 pr-3">
                        <Link
                          className="font-mono text-xs text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 hover:decoration-[#14161A]"
                          href={`/admin/calibration/${p.executionWorkflowHash}`}
                        >
                          {p.executionWorkflowKey.split("|").slice(0, 3).join(" · ")}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge className={LEVEL_TONE[p.calibrationLevel]}>{p.calibrationLevel}</Badge>
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {p.sampleSizeReliability} / {p.sampleSizeCostPerf} / {p.sampleSizeMargin}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {pctOf(p.commercialSuccessRateBps)}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {pctOf(p.technicalReliabilityRateBps)}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{pctOf(p.firstPassQcRateBps)}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {pctOf(p.medianAutomatedUnitRateBps)}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {usdOf(p.medianAllInCostMicros)}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {pctOf(p.medianGrossMarginAllInBps)}
                      </td>
                      <td className="py-2 font-mono text-xs text-[#955710]">
                        {p.driftFlags.join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#5B6069]">
              Delivered = commercial success over every accepted mandate, failures included.
              Technical reliability excludes client cancellations, admin cancellations and payment
              failures — a client changing their mind says nothing about whether the workflow
              holds. Cost and margin medians run over delivered, well-measured tasks only.
            </p>
          </CardBody>
        </Card>
      )}
    </>
  );
}
