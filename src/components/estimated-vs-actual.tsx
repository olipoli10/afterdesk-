import { Badge, Card, CardBody, SectionLabel } from "@/components/ui";
import type { OperationalComparison } from "@/lib/queries/operational-intelligence";

/**
 * ESTIMATED VS ACTUAL — the admin task page's operational record. Server
 * component, ADMIN surface only.
 *
 * Display law: a missing number renders as "—" with a badge saying WHY
 * (absent / modeled / incomplete), never as a fabricated zero. The two
 * margins are labeled by what they contain — "on booked+metered costs" vs
 * "all-in incl. modeled" — and no figure on this panel is ever called a
 * "real" cost: metered means measured quantity times OUR tariff table, and
 * the modeled portion is itemized right under the totals.
 */

const dash = <span className="text-[#5B6069]">—</span>;

function usdFromMicros(micros: bigint | null): React.ReactNode {
  if (micros === null) return dash;
  const sign = micros < 0n ? "-" : "";
  const abs = micros < 0n ? -micros : micros;
  const cents = Number((abs + 4_999n) / 10_000n);
  return `${sign}$${(cents / 100).toFixed(2)}`;
}

function usdFromCents(cents: number | null): React.ReactNode {
  return cents === null ? dash : `$${(cents / 100).toFixed(2)}`;
}

function pct(bpsValue: number | null): React.ReactNode {
  return bpsValue === null ? dash : `${(bpsValue / 100).toFixed(1)}%`;
}

function minutes(min: number | null): React.ReactNode {
  return min === null ? dash : `${min} min`;
}

function fromSeconds(seconds: number | null): React.ReactNode {
  return seconds === null ? dash : `${Math.round(seconds / 60)} min`;
}

function Row({
  label,
  estimated,
  actual,
  note,
}: {
  label: string;
  estimated: React.ReactNode;
  actual: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr] items-baseline gap-2 py-1.5">
      <span className="text-sm text-[#5B6069]">
        {label}
        {note ? <span className="ml-1.5 text-xs text-[#955710]">({note})</span> : null}
      </span>
      <span className="font-mono text-sm tabular-nums text-[#14161A]">{estimated}</span>
      <span className="font-mono text-sm tabular-nums text-[#14161A]">{actual}</span>
    </div>
  );
}

export function EstimatedVsActual({ data }: { data: OperationalComparison }) {
  const { baseline, actual } = data;
  if (!baseline && !actual) return null;
  const flags = new Set([...(baseline?.dataQualityFlags ?? []), ...(actual?.dataQualityFlags ?? [])]);

  return (
    <Card className="mb-4">
      <CardBody>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <SectionLabel as="h2">Estimated vs actual</SectionLabel>
          <span className="flex flex-wrap items-center gap-1.5">
            {actual?.outcomeClass ? (
              <Badge className="border-black/12 bg-black/[0.03] text-[#5B6069]">
                {actual.outcomeClass}
              </Badge>
            ) : (
              <Badge className="border-black/12 bg-black/[0.03] text-[#5B6069]">in flight</Badge>
            )}
            {actual ? (
              <Badge className="border-black/12 bg-black/[0.03] text-[#5B6069]">
                telemetry {((actual.metricsCompletenessBps ?? 0) / 100).toFixed(0)}%
              </Badge>
            ) : null}
          </span>
        </div>

        {baseline ? (
          <p className="mb-3 text-xs leading-relaxed text-[#5B6069]">
            Baseline frozen at acceptance ({baseline.pricingPolicyVersion} ·{" "}
            {baseline.qualityPolicyVersion} · calibration at quote:{" "}
            {baseline.calibrationLevelAtQuote ?? "none"}). Metered = measured usage at our tariff
            table, not a provider invoice. Modeled figures are assumptions and say so.
          </p>
        ) : (
          <p className="mb-3 text-xs leading-relaxed text-[#955710]">
            No baseline exists for this task (accepted before Phase 1C, or never accepted). The
            estimated column cannot be reconstructed honestly and shows nothing.
          </p>
        )}

        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 border-b border-[#14161A]/[0.08] pb-1">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
            Metric
          </span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
            Estimated
          </span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
            Actual
          </span>
        </div>

        <div className="divide-y divide-[#14161A]/[0.05]">
          <Row
            label="Internal cost (likely)"
            estimated={usdFromCents(baseline?.estimatedInternalCostLikelyCents ?? null)}
            actual={usdFromMicros(actual?.allInCostWithModeledMicros ?? null)}
            note={actual != null && actual.paymentFeeModeledMicros !== null ? "actual incl. modeled add-ons" : undefined}
          />
          <Row
            label="· of which metered AI + tools"
            estimated={dash}
            actual={
              actual
                ? usdFromMicros(actual.aiCostMeteredMicros + actual.toolCostMeteredMicros)
                : dash
            }
          />
          <Row
            label="· of which modeled (fee, reviewer rate)"
            estimated={dash}
            actual={usdFromMicros(actual?.modeledCostAddonMicros ?? null)}
            note={flags.has("FEE_MODELED") ? "FEE_MODELED" : undefined}
          />
          <Row
            label="Worker payout"
            estimated={usdFromCents(baseline?.estimatedWorkerPayoutCents ?? null)}
            actual={
              // A dash until an obligation exists: partitionPayouts returns
              // 0 for "no payout rows yet", and printing $0.00 there would
              // be exactly the fabricated zero this panel forbids.
              actual &&
              (actual.workerPayoutNetIncurredCents > 0 || actual.workerPayoutVoidedCents > 0)
                ? usdFromCents(actual.workerPayoutNetIncurredCents)
                : dash
            }
            note={flags.has("PAYOUT_REARMED") ? "re-armed; history in events" : undefined}
          />
          <Row
            label="Worker minutes"
            estimated={minutes(baseline?.estimatedWorkerMinutesAtQuote ?? null)}
            actual={fromSeconds(actual?.workerActiveSeconds ?? null)}
            note={flags.has("MISSING_WORKER_TIME") ? "no timer used" : undefined}
          />
          <Row
            label="Reviewer minutes"
            estimated={
              baseline
                ? `${baseline.plannedReviewerMinutes ?? baseline.modeledReviewerMinutesAtQuote} min${baseline.plannedReviewerMinutes === null ? " (modeled)" : ""}`
                : dash
            }
            actual={fromSeconds(actual?.reviewerActiveSeconds ?? null)}
          />
          <Row
            label="Units requested"
            estimated={baseline?.unitsRequested ?? dash}
            actual={actual?.unitsRequested ?? dash}
          />
          <Row
            label="Prefilled / resolved by machine"
            estimated={dash}
            actual={
              actual && actual.unitsPrefilled !== null
                ? `${actual.unitsPrefilled} / ${actual.unitsResolvedAutomatically ?? 0}`
                : dash
            }
          />
          <Row label="Automation rate" estimated={dash} actual={pct(actual?.automatedUnitRateBps ?? null)} />
          <Row
            label="Client price / revenue recognized"
            estimated={usdFromCents(baseline?.clientPriceCents ?? null)}
            actual={usdFromMicros(actual?.recognizedRevenueMicros ?? null)}
            note={flags.has("PAYMENT_NOT_CAPTURED") ? "authorization is not revenue" : undefined}
          />
          <Row
            label="Margin on booked+metered costs"
            estimated={
              // Derived from THIS mandate's own numbers — the catalog's 60%
              // target is a policy, not an estimate, and showing it here
              // made a definitional gap read as an execution gap.
              baseline &&
              baseline.estimatedInternalCostLikelyCents !== null &&
              baseline.clientPriceCents > 0
                ? pct(
                    Math.floor(
                      ((baseline.clientPriceCents - baseline.estimatedInternalCostLikelyCents) *
                        10_000) /
                        baseline.clientPriceCents
                    )
                  )
                : dash
            }
            actual={pct(actual?.grossMarginBookedMeteredBps ?? null)}
          />
          <Row
            label="Margin all-in incl. modeled"
            estimated={dash}
            actual={pct(actual?.grossMarginAllInModeledBps ?? null)}
          />
          <Row
            label="QC first pass / revisions / critical errors"
            estimated={dash}
            actual={
              actual
                ? `${actual.passedQcFirstAttempt === null ? "—" : actual.passedQcFirstAttempt ? "yes" : "no"} / ${actual.revisionRounds ?? "—"} / ${actual.criticalErrorCount ?? "—"}`
                : dash
            }
          />
          <Row
            label="Delivered without correction"
            estimated={dash}
            actual={
              actual
                ? actual.clientAcceptedWithoutCorrection === null
                  ? "window open"
                  : actual.clientAcceptedWithoutCorrection
                    ? "yes"
                    : "no"
                : dash
            }
          />
          <Row
            label="Repeat within 90 days"
            estimated={dash}
            actual={
              actual
                ? actual.repeatWithin90Days === null
                  ? "window open"
                  : actual.repeatWithin90Days
                    ? "yes"
                    : "no"
                : dash
            }
          />
        </div>

        {flags.size > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#14161A]/[0.06] pt-3">
            {[...flags].sort().map((f) => (
              <Badge key={f} className="border-[#955710]/40 bg-[#D98324]/10 text-[#955710]">
                {f}
              </Badge>
            ))}
          </div>
        ) : null}
        {actual ? (
          <p className="mt-2 text-xs text-[#5B6069]">
            Recomputed {actual.computedAt.toISOString().slice(0, 16).replace("T", " ")} UTC · v
            {actual.computationVersion} · every change is journaled as
            operational_actual_recomputed with before/after hashes.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
