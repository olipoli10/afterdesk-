import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { allTasksForAdmin } from "@/lib/queries/tasks";
import { ADMIN_STATUS_LABELS, statusBadgeClass } from "@/lib/status";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { Badge, Card, EmptyState, PageTitle, moneyClient, moneyPayout } from "@/components/ui";
import type { TaskStatus } from "@prisma/client";

const FILTERS: (TaskStatus | "all")[] = [
  "all",
  "pricing_review",
  "quoted",
  "open",
  "claimed",
  "submitted_for_qc",
  "qc_rejected",
  "revision_requested",
  "completed",
  "declined",
  "cancelled",
  "expired",
];

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole("ADMIN");
  const { status } = await searchParams;
  const filter = status && FILTERS.includes(status as TaskStatus) ? status : "all";
  const tasks = await allTasksForAdmin(filter);

  return (
    <>
      <PageTitle title="All tasks" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/admin/tasks" : `/admin/tasks?status=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] ${
              filter === f
                ? "border-[#14161A] bg-[#14161A] text-[#F7F6F3]"
                : "border-[#14161A]/20 bg-white text-[#5B6069] hover:bg-[#F7F6F3] hover:text-[#14161A]"
            }`}
          >
            {f === "all" ? "All" : ADMIN_STATUS_LABELS[f as TaskStatus]}
          </Link>
        ))}
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="Nothing here"
          body={
            filter === "all"
              ? "No tasks exist yet. They appear here the moment a client submits one."
              : "No tasks in this state right now."
          }
        />
      ) : (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[#14161A]/[0.06] text-left font-mono text-[11px] uppercase tracking-[0.14em] text-[#5B6069]">
                    <th className="px-4 py-2.5 font-medium">Task</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Client price</th>
                    <th className="px-4 py-2.5 text-right font-medium">Worker payout</th>
                    <th className="px-4 py-2.5 text-right font-medium">Deadline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#14161A]/[0.06]">
                  {tasks.map((t) => (
                    <tr key={t.id} className="transition-colors duration-150 hover:bg-[#14161A]/[0.02]">
                      <td className="max-w-[280px] px-4 py-2.5">
                        <Link href={`/admin/tasks/${t.id}`} className="block">
                          <span className="block truncate font-medium text-[#14161A]">
                            {t.title}
                          </span>
                          <span className="text-xs text-[#5B6069]">
                            {t.client.name}
                            {t.claimedBy ? ` → ${t.claimedBy.name}` : ""}
                            {t.tier === "high_value" ? " · high-value" : ""}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={statusBadgeClass(t.status)}>
                          {ADMIN_STATUS_LABELS[t.status]}
                        </Badge>
                      </td>
                      <td className={`px-4 py-2.5 text-right ${moneyClient}`}>
                        {t.clientPriceCents != null ? formatCents(t.clientPriceCents, t.currency) : "—"}
                      </td>
                      <td className={`px-4 py-2.5 text-right ${moneyPayout}`}>
                        {t.vaPayoutCents != null ? formatCents(t.vaPayoutCents, t.currency) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-[#5B6069]">
                        {t.clientDeadlineUtc ? (
                          <LocalTime iso={t.clientDeadlineUtc} dateStyle="short" />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {tasks.length === 200 ? (
            <p className="mt-3 text-xs text-[#5B6069]">
              Showing the 200 most recent — filter to narrow.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
