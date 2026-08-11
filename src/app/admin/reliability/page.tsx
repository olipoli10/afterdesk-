import { requireRole } from "@/lib/authz";
import { exceptionMetricsForAdmin } from "@/lib/queries/exception-metrics";
import { budgetHealthForAdmin } from "@/lib/queries/budget-health";
import { Card, CardBody, EmptyState, PageTitle } from "@/components/ui";

export const metadata = { title: "Reliability" };

/**
 * N1 / N2, READ AT LAST. `exceptionMetricsForAdmin` existed with no caller,
 * which meant the number every capability purchase is supposed to be judged
 * on had never been on a screen: 1E-beta1 ships this page BEFORE the first
 * fetch-bearing plan runs, so the before-window is observed live rather than
 * reconstructed after the fact.
 *
 * Every rate is shown WITH its denominator (the calibration page's rule), and
 * a null rate renders as an em-dash, never as zero: a rate over nothing is
 * unknown. The fetch arms are intention-to-treat — a mandate whose plan
 * carried web.fetch counts as `intended` even when every fetch failed,
 * because dropping the hard-page mandates from the arm is precisely the
 * survivorship bias that would flatter the capability being judged.
 */

const pctOf = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toFixed(1)}%`);
const usdOf = (micros: bigint) => `$${(Number(micros / 10_000n) / 100).toFixed(2)}`;

export default async function ReliabilityPage() {
  await requireRole("ADMIN");
  const [m, budget] = await Promise.all([exceptionMetricsForAdmin(), budgetHealthForAdmin()]);

  return (
    <>
      <PageTitle
        title="Reliability"
        sub="Exception causes observed in production, with their denominators. These are facts the engine saw, never estimates of what a tool would have fixed."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#5B6069]">
              Sample
            </p>
            <p className="mt-1 font-mono text-2xl tabular-nums">{m.taskCount}</p>
            <p className="text-xs text-[#5B6069]">
              eligible tasks · {m.totalRowsSeen} rows seen · {m.rowsWithCause} rows with a cause
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#5B6069]">
              N1 · email-only rows
            </p>
            <p className="mt-1 font-mono text-2xl tabular-nums">{pctOf(m.n1EmailOnlyBps)}</p>
            <p className="text-xs text-[#5B6069]">of exception-bearing rows</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#5B6069]">
              N2 · second source missing
            </p>
            <p className="mt-1 font-mono text-2xl tabular-nums">
              {pctOf(m.n2SecondSourceMissingBps)}
            </p>
            <p className="text-xs text-[#5B6069]">of observed causes</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#5B6069]">
              Fetch arms (intention-to-treat)
            </p>
            <p className="mt-1 font-mono text-2xl tabular-nums">
              {m.fetchArms.intended} / {m.fetchArms.withUsablePages}
            </p>
            <p className="text-xs text-[#5B6069]">
              plans that carried web.fetch / of those, plans where at least one page was
              actually read
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#5B6069]">
              Causes, absolute counts
            </p>
            {m.byCause.length === 0 ? (
              <EmptyState
                title="No causes recorded yet"
                body="Counts appear once eligible mandates run split.exceptions@2 in production."
              />
            ) : (
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-[#14161A]/[0.05]">
                  {m.byCause.map((c) => (
                    <tr key={c.cause}>
                      <td className="py-1.5 pr-3 font-mono text-xs">{c.cause}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#5B6069]">
              By field · cause (client field names — admin eyes only)
            </p>
            {m.byField.length === 0 ? (
              <EmptyState title="Nothing yet" body="Per-field counts appear with the causes." />
            ) : (
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-[#14161A]/[0.05]">
                  {m.byField.slice(0, 30).map((f) => (
                    <tr key={`${f.field}::${f.cause}`}>
                      <td className="max-w-[220px] truncate py-1.5 pr-3 font-mono text-xs">
                        {f.field}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs text-[#5B6069]">{f.cause}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{f.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#5B6069]">
              Unresolved holds (spend we are not sure about)
            </p>
            <p className="mt-1 font-mono text-2xl tabular-nums">
              {budget.unresolvedHolds} · {usdOf(budget.unresolvedHeldMicros)}
            </p>
            <p className="text-xs text-[#5B6069]">
              reservations still held for attempts whose provider-side spend is unknown
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#5B6069]">
              Settle over hold (the fetch residual tripwire)
            </p>
            <p className="mt-1 font-mono text-2xl tabular-nums">
              {budget.settleOverHolds} · {usdOf(budget.settleOverExcessMicros)}
            </p>
            <p className="text-xs text-[#5B6069]">
              attempts whose measured spend exceeded their own reservation. This must stay at
              zero; a non-zero row is a real event to investigate (a disguised binary on a
              fetch is the known cause), never a display artifact.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardBody>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#5B6069]">
            Collection readiness
          </p>
          <p className="mt-1 text-sm">
            {m.readiness.successfulTasks} / {m.readiness.successfulTasksTarget} successful tasks ·{" "}
            {m.readiness.rowsSeen} / {m.readiness.rowsTarget} rows ·{" "}
            {m.readiness.ready ? "ready to read" : "still collecting"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#5B6069]">
            CONFLICTING_VALUES has no emitter yet: when two sources disagree, the extraction
            model picks one and the disagreement is invisible to these counts. Fetch increases
            the surface where that can happen. Making conflicts observable is the beta2
            decision, recorded here so this page never reads as claiming otherwise.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
