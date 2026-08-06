import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { calibrationProfileForAdmin } from "@/lib/queries/operational-intelligence";
import { Badge, Card, CardBody, PageTitle, SectionLabel } from "@/components/ui";
import { LocalTime } from "@/components/local-time";

export const metadata = { title: "Workflow profile" };

/**
 * ONE WORKFLOW'S PROFILE. Distributions with their sample sizes, strata per
 * policy version, the read-only recommendation, and the recent executions
 * INCLUDING failures — survivorship bias is fought by showing the whole
 * outcome ledger, not by filtering it.
 */

const pctOf = (bps: number | null | undefined) =>
  bps === null || bps === undefined ? "—" : `${(bps / 100).toFixed(1)}%`;
const usdOf = (micros: bigint | null | undefined) =>
  micros === null || micros === undefined
    ? "—"
    : `$${(Number(micros / 10_000n) / 100).toFixed(2)}`;

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[#5B6069]">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-[#14161A]">{value}</dd>
    </div>
  );
}

export default async function CalibrationProfilePage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  await requireRole("ADMIN");
  const { hash } = await params;
  const data = await calibrationProfileForAdmin(hash);
  if (!data) notFound();
  const { profile, recentExecutions } = data;
  const rec = profile.recommendation as {
    price?: {
      recommendedMinCents: number;
      recommendedMaxCents: number;
      sampleSize: number;
      warnings: string[];
    } | null;
    priceUnavailableReason?: string | null;
    payoutNote?: string | null;
    missingData?: string[];
  } | null;

  return (
    <>
      <PageTitle
        title="Workflow profile"
        sub={profile.executionWorkflowKey}
        action={
          <Link className="text-sm text-[#5B6069] hover:text-[#14161A]" href="/admin/calibration">
            ← All workflows
          </Link>
        }
      />

      <Card className="mb-4">
        <CardBody>
          <div className="mb-2 flex items-center justify-between gap-2">
            <SectionLabel as="h2">Calibration</SectionLabel>
            <Badge className="border-black/12 bg-black/[0.03] text-[#5B6069]">
              {profile.calibrationLevel}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="n reliability" value={profile.sampleSizeReliability} />
            <Stat label="n cost/perf" value={profile.sampleSizeCostPerf} />
            <Stat label="n margin" value={profile.sampleSizeMargin} />
            <Stat label="n repeat resolved" value={profile.sampleSizeRepeatResolved} />
            <Stat label="n recent (90d)" value={profile.sampleSizeRecent} />
            <Stat label="Delivered (commercial)" value={pctOf(profile.commercialSuccessRateBps)} />
            <Stat label="Technical reliability" value={pctOf(profile.technicalReliabilityRateBps)} />
            <Stat label="First-pass QC" value={pctOf(profile.firstPassQcRateBps)} />
            <Stat label="Revision rate" value={pctOf(profile.revisionRateBps)} />
            <Stat label="Dispute rate" value={pctOf(profile.disputeRateBps)} />
            <Stat label="Automation median (p25–p75)" value={`${pctOf(profile.medianAutomatedUnitRateBps)} (${pctOf(profile.p25AutomatedUnitRateBps)}–${pctOf(profile.p75AutomatedUnitRateBps)})`} />
            <Stat label="Exception median" value={pctOf(profile.medianExceptionRateBps)} />
            <Stat label="AI cost / unit (med · p75)" value={`${usdOf(profile.medianAiCostPerUnitMicros)} · ${usdOf(profile.p75AiCostPerUnitMicros)}`} />
            <Stat label="All-in cost (med · p75 · p90)" value={`${usdOf(profile.medianAllInCostMicros)} · ${usdOf(profile.p75AllInCostMicros)} · ${usdOf(profile.p90AllInCostMicros)}`} />
            <Stat label="Margin all-in (med · p25)" value={`${pctOf(profile.medianGrossMarginAllInBps)} · ${pctOf(profile.p25GrossMarginAllInBps)}`} />
            <Stat label="No-correction rate" value={pctOf(profile.noCorrectionRateBps)} />
            <Stat label="Repeat ≤90d" value={pctOf(profile.repeatWithin90dRateBps)} />
            <Stat label="Telemetry completeness" value={pctOf(profile.metricsCompletenessBps)} />
          </dl>
          {profile.driftFlags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.driftFlags.map((f) => (
                <Badge key={f} className="border-[#955710]/40 bg-[#D98324]/10 text-[#955710]">
                  {f}
                </Badge>
              ))}
            </div>
          ) : null}
          <p className="mt-3 text-xs text-[#5B6069]">
            Outcomes:{" "}
            {Object.entries((profile.outcomeCounts as Record<string, number>) ?? {})
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ") || "none recorded"}
          </p>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardBody>
          <SectionLabel as="h2">Recommendation (read-only)</SectionLabel>
          {rec?.price ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-[#14161A]">
                Suggested price range{" "}
                <span className="font-mono tabular-nums">
                  ${(rec.price.recommendedMinCents / 100).toFixed(0)}–$
                  {(rec.price.recommendedMaxCents / 100).toFixed(0)}
                </span>{" "}
                from the all-in cost p75/p90 of {rec.price.sampleSize} execution(s) under the
                active pricing policy.
                {rec.price.warnings.length > 0 ? ` Warnings: ${rec.price.warnings.join(", ")}.` : ""}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-[#5B6069]">
              No price recommendation: {rec?.priceUnavailableReason ?? "not generated yet"}. It is
              withheld rather than padded from pooled or stale-policy numbers.
            </p>
          )}
          {rec?.payoutNote ? <p className="mt-1.5 text-sm text-[#5B6069]">{rec.payoutNote}</p> : null}
          {rec?.missingData && rec.missingData.length > 0 ? (
            <p className="mt-1.5 text-xs text-[#955710]">Missing: {rec.missingData.join(" · ")}</p>
          ) : null}
          <p className="mt-3 text-xs text-[#5B6069]">
            Nothing on this page writes to pricing, payouts, settings or QC. Applying a
            recommendation is a human decision made in the pricing screen.
          </p>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardBody>
          <SectionLabel as="h2">Strata by policy version</SectionLabel>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#14161A]/10 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                  <th className="py-2 pr-3">Dimension</th>
                  <th className="py-2 pr-3">Policy</th>
                  <th className="py-2 pr-3">n</th>
                  <th className="py-2 pr-3">First-pass</th>
                  <th className="py-2 pr-3">Critical err.</th>
                  <th className="py-2 pr-3">Cost var. (med)</th>
                  <th className="py-2 pr-3">Payout var. (med)</th>
                  <th className="py-2">Cost p75 / p90</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#14161A]/[0.05]">
                {profile.strata.map((st) => (
                  <tr key={st.id} className="font-mono text-xs tabular-nums">
                    <td className="py-2 pr-3">{st.dimension}</td>
                    <td className="py-2 pr-3">{st.policyVersion}</td>
                    <td className="py-2 pr-3">{st.n}</td>
                    <td className="py-2 pr-3">{pctOf(st.firstPassQcRateBps)}</td>
                    <td className="py-2 pr-3">{pctOf(st.criticalErrorRateBps)}</td>
                    <td className="py-2 pr-3">{pctOf(st.medianCostVarianceBps)}</td>
                    <td className="py-2 pr-3">{pctOf(st.medianPayoutVarianceBps)}</td>
                    <td className="py-2">
                      {usdOf(st.allInCostP75Micros)} / {usdOf(st.allInCostP90Micros)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[#5B6069]">
            Variances compare each task&apos;s actual against ITS OWN baseline, which only makes sense
            within one pricing policy. Cost distributions pool across policies above; here they are
            restricted per policy because the recommendation prices from the active one only.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionLabel as="h2">Recent executions — failures included</SectionLabel>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#14161A]/10 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                  <th className="py-2 pr-3">Task</th>
                  <th className="py-2 pr-3">Outcome</th>
                  <th className="py-2 pr-3">Delivered</th>
                  <th className="py-2 pr-3">All-in cost</th>
                  <th className="py-2 pr-3">Margin</th>
                  <th className="py-2 pr-3">Automation</th>
                  <th className="py-2 pr-3">Telemetry</th>
                  <th className="py-2">In cost stats?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#14161A]/[0.05]">
                {recentExecutions.map((e) => (
                  <tr key={e.taskId} className="font-mono text-xs tabular-nums">
                    <td className="py-2 pr-3">
                      <Link
                        className="underline decoration-[#14161A]/30 underline-offset-2 hover:decoration-[#14161A]"
                        href={`/admin/tasks/${e.taskId}`}
                      >
                        {e.taskId.slice(-8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{e.outcomeClass ?? "in flight"}</td>
                    <td className="py-2 pr-3">
                      {e.deliveredAt ? <LocalTime iso={e.deliveredAt} /> : "—"}
                    </td>
                    <td className="py-2 pr-3">{usdOf(e.allInCostWithModeledMicros)}</td>
                    <td className="py-2 pr-3">{pctOf(e.grossMarginAllInModeledBps)}</td>
                    <td className="py-2 pr-3">{pctOf(e.automatedUnitRateBps)}</td>
                    <td className="py-2 pr-3">{pctOf(e.metricsCompletenessBps)}</td>
                    <td className="py-2">
                      {e.eligibleForCostAndPerformanceCalibration
                        ? "yes"
                        : `no (${e.dataQualityFlags.slice(0, 2).join(", ") || e.outcomeClass || "…"})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
