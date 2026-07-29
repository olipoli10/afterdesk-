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
        <div className="divide-y divide-[#14161A]/[0.06]">
          {queue.map((t, i) => (
            <Link
              key={t.id}
              href={`/admin/qc/${t.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-[#14161A]/[0.02]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-[#5B6069]">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#14161A]">{t.title}</p>
                  <p className="mt-0.5 text-xs text-[#5B6069]">
                    {t.claimedBy?.name ?? "Unassigned"}
                    {t.qcRounds > 0 ? (
                      <>
                        {" · round "}
                        <span className="font-mono tabular-nums">{t.qcRounds + 1}</span>
                      </>
                    ) : null}
                    {" · "}
                    <span className="font-mono tabular-nums">{t._count.submissions}</span>{" "}
                    {t._count.submissions === 1 ? "delivery" : "deliveries"}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {t.clientDeadlineUtc ? (
                  <p className="text-xs font-medium text-[#14161A]">
                    Client deadline: <LocalTime iso={t.clientDeadlineUtc} dateStyle="short" />
                  </p>
                ) : (
                  <p className="text-xs text-[#5B6069]">No deadline</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
