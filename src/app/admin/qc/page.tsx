import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { runOperatorSweeps } from "@/server/sweeps";
import { LocalTime } from "@/components/local-time";
import { Card, EmptyState, PageTitle } from "@/components/ui";

export default async function QcQueuePage() {
  await requireRole("ADMIN");
  await runOperatorSweeps();

  const queue = await prisma.task.findMany({
    where: { status: "submitted_for_qc" },
    select: {
      id: true,
      title: true,
      qcRounds: true,
      clientDeadlineUtc: true,
      createdAt: true,
      claimedBy: { select: { name: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: [{ clientDeadlineUtc: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  if (queue.length === 0) {
    return (
      <>
        <PageTitle title="QC queue" />
        <EmptyState
          title="Queue clear"
          body="Every delivery has been reviewed. New ones land here the moment a worker sends their work, sorted by the client deadline so the urgent ones are on top."
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="QC queue"
        sub={`${queue.length} ${queue.length > 1 ? "deliveries" : "delivery"} waiting. Nothing has reached a client yet — open the first and work down with Approve & next.`}
      />
      <Card>
        <div className="divide-y divide-neutral-100">
          {queue.map((t, i) => (
            <Link
              key={t.id}
              href={`/admin/qc/${t.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-neutral-300">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{t.title}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {t.claimedBy?.name ?? "Unassigned"}
                    {t.qcRounds > 0 ? ` · round ${t.qcRounds + 1}` : ""}
                    {` · ${t._count.submissions} ${t._count.submissions === 1 ? "delivery" : "deliveries"}`}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {t.clientDeadlineUtc ? (
                  <p className="text-xs font-medium text-neutral-700">
                    Client deadline: <LocalTime iso={t.clientDeadlineUtc} dateStyle="short" />
                  </p>
                ) : (
                  <p className="text-xs text-neutral-400">No deadline</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
