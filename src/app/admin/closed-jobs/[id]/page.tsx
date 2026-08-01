import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { closedJobLogDetail } from "@/lib/queries/closed-jobs";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { Card, CardBody, PageTitle, SectionLabel, Badge, moneyClient, moneyPayout } from "@/components/ui";

export const metadata = {
  title: "Closed job",
  robots: { index: false, follow: false },
};

const LOST_REASON_LABEL: Record<string, string> = {
  price_declined: "Price declined",
  deadline_at_risk: "Deadline at risk",
  worker_unavailable: "Worker unavailable",
  client_cancelled_no_reason: "Cancelled, no reason",
  qc_failed_repeatedly: "Failed QC repeatedly",
  expired: "Expired",
  other: "Other",
};

export default async function AdminClosedJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;
  const detail = await closedJobLogDetail(id);
  if (!detail) notFound();
  const { job, events, conversations, examAttempts } = detail;

  return (
    <>
      <PageTitle
        title={job.task.title}
        sub={job.task.category?.name ?? "Uncategorized"}
        action={
          <Link href="/admin/closed-jobs" className="text-sm font-medium text-[#5B6069] hover:text-[#14161A]">
            ← Closed jobs
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardBody>
              <SectionLabel as="h2" className="mb-2">
                Outcome
              </SectionLabel>
              <div className="flex flex-wrap items-center gap-3">
                <Badge
                  className={
                    job.outcome === "won"
                      ? "border-[#166049]/30 bg-[#166049]/10 text-[#166049]"
                      : "border-[#8C2F23]/25 bg-[#8C2F23]/[0.08] text-[#8C2F23]"
                  }
                >
                  {job.outcome === "won" ? "Won" : "Lost"}
                </Badge>
                {job.outcome === "lost" && job.lostReasonCategory ? (
                  <span className="text-sm text-[#5B6069]">
                    {LOST_REASON_LABEL[job.lostReasonCategory]}
                    {job.lostReasonDetail ? ` — "${job.lostReasonDetail}"` : ""}
                  </span>
                ) : null}
                {job.outcome === "won" && job.finalRating ? (
                  <span className="text-sm text-[#5B6069]">Rated {job.finalRating}/5</span>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-[#5B6069]">
                Closed <LocalTime iso={job.closedAt} dateStyle="medium" /> · {job.qcRoundsAtClose} QC round
                {job.qcRoundsAtClose === 1 ? "" : "s"}
                {job.revisionRequestedBeforeClose ? " · had a revision before closing" : ""}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionLabel as="h2" className="mb-2">
                Price
              </SectionLabel>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-[#5B6069]">Client price</p>
                  <p className={moneyClient}>
                    {job.task.clientPriceCents != null ? formatCents(job.task.clientPriceCents) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#5B6069]">Worker payout</p>
                  <p className={moneyPayout}>
                    {job.task.vaPayoutCents != null ? formatCents(job.task.vaPayoutCents) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#5B6069]">Margin</p>
                  <p className="font-mono tabular-nums text-[#14161A]">
                    {job.marginCents != null ? formatCents(job.marginCents) : "—"}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionLabel as="h2" className="mb-2">
                Audit log
              </SectionLabel>
              <ul className="space-y-1.5 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-[#5B6069]">
                    <span className="text-xs tabular-nums">
                      <LocalTime iso={e.createdAt} dateStyle="short" />
                    </span>
                    <span className="font-mono text-xs text-[#14161A]">{e.action}</span>
                    {e.fromStatus || e.toStatus ? (
                      <span className="font-mono text-xs text-[#5B6069]">
                        {e.fromStatus ?? "∅"} → {e.toStatus ?? "∅"}
                      </span>
                    ) : null}
                    {e.reason ? <span className="text-xs italic text-[#5B6069]">“{e.reason}”</span> : null}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardBody>
              <SectionLabel as="h2" className="mb-2">
                Assigned worker
              </SectionLabel>
              <p className="text-sm text-[#14161A]">{job.task.claimedBy?.name ?? "Never claimed"}</p>
              {examAttempts.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5B6069]">
                    Entry exam history
                  </p>
                  {examAttempts.map((a, i) => (
                    <p key={i} className="text-xs text-[#5B6069]">
                      {a.courseSlug}: {a.score}/{a.total} ({a.passed ? "passed" : "failed"}) ·{" "}
                      <LocalTime iso={a.createdAt} dateStyle="short" />
                    </p>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>

          {conversations.length > 0 ? (
            <Card>
              <CardBody>
                <SectionLabel as="h2" className="mb-2">
                  Assistant conversations ({conversations.length})
                </SectionLabel>
                <div className="space-y-2">
                  {conversations.map((c) => (
                    <div key={c.id} className="border-b border-[#14161A]/[0.06] pb-2 text-xs last:border-0">
                      <p className="text-[#14161A]">{c.content}</p>
                      <p className="mt-0.5 text-[#8A9099]">
                        {c.category ?? "uncategorized"} · <LocalTime iso={c.createdAt} dateStyle="short" />
                      </p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
