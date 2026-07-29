import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { allTasksForAdmin } from "@/lib/queries/tasks";
import { ADMIN_STATUS_LABELS, statusBadgeClass } from "@/lib/status";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
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
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              filter === f
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
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
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wider text-neutral-400">
                <th className="px-4 py-2.5 font-semibold">Task</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Client price</th>
                <th className="px-4 py-2.5 text-right font-semibold">VA payout</th>
                <th className="px-4 py-2.5 text-right font-semibold">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-neutral-50">
                  <td className="max-w-[280px] px-4 py-2.5">
                    <Link href={`/admin/tasks/${t.id}`} className="block">
                      <span className="block truncate font-medium text-neutral-900">
                        {t.title}
                      </span>
                      <span className="text-xs text-neutral-400">
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
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {t.clientPriceCents != null ? formatCents(t.clientPriceCents, t.currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {t.vaPayoutCents != null ? formatCents(t.vaPayoutCents, t.currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-neutral-500">
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
        </Card>
      )}
    </>
  );
}
