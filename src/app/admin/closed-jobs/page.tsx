import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { closedJobLogList } from "@/lib/queries/closed-jobs";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { Card, EmptyState, PageTitle, Badge, moneyClient } from "@/components/ui";
import { AnalyzeButton } from "@/components/closed-job-analyze";

export const metadata = {
  title: "Closed jobs",
  robots: { index: false, follow: false },
};

const LOST_REASON_LABEL: Record<string, string> = {
  price_declined: "Price declined",
  deadline_at_risk: "Deadline at risk",
  worker_unavailable: "Worker unavailable",
  client_cancelled_no_reason: "Cancelled, no reason",
  qc_failed_repeatedly: "Failed QC repeatedly",
  expired: "Expired",
  out_of_scope: "Out of scope",
  other: "Other",
};

export default async function AdminClosedJobsPage() {
  await requireRole("ADMIN");
  const jobs = await closedJobLogList();

  const won = jobs.filter((j) => j.outcome === "won").length;
  const lost = jobs.length - won;

  return (
    <>
      <PageTitle
        title="Closed jobs"
        sub={`${jobs.length} closed (${won} won, ${lost} lost) — the foundation for future pattern analysis. Advisory only; nothing here decides anything.`}
      />

      <div className="mb-4">
        <AnalyzeButton />
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="Nothing closed yet"
          body="Every task that completes, gets cancelled, gets declined, or expires will land here automatically."
        />
      ) : (
        <Card>
          <div className="divide-y divide-[#14161A]/[0.06]">
            {jobs.map((j) => (
              <Link
                key={j.id}
                href={`/admin/closed-jobs/${j.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-[#14161A]/[0.02]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#14161A]">{j.task.title}</p>
                  <p className="mt-0.5 text-xs text-[#5B6069]">
                    {j.task.category?.name ?? "Uncategorized"} · closed{" "}
                    <LocalTime iso={j.closedAt} dateStyle="short" />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {j.outcome === "won" ? (
                    j.marginCents != null ? (
                      <span className={`text-sm ${moneyClient}`}>+{formatCents(j.marginCents)}</span>
                    ) : null
                  ) : (
                    <span className="text-xs text-[#5B6069]">
                      {j.lostReasonCategory ? LOST_REASON_LABEL[j.lostReasonCategory] : "—"}
                    </span>
                  )}
                  <Badge
                    className={
                      j.outcome === "won"
                        ? "border-[#166049]/30 bg-[#166049]/10 text-[#166049]"
                        : "border-[#8C2F23]/25 bg-[#8C2F23]/[0.08] text-[#8C2F23]"
                    }
                  >
                    {j.outcome === "won" ? "Won" : "Lost"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
