import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { pricingQueue } from "@/lib/queries/tasks";
import { runOperatorSweeps } from "@/server/sweeps";
import { LocalTime } from "@/components/local-time";
import { Card, EmptyState, PageTitle } from "@/components/ui";

export default async function PricingQueuePage() {
  await requireRole("ADMIN");
  // The scheduler is primary; this opportunistic run keeps the queue correct
  // even when the maintenance job is briefly delayed.
  await runOperatorSweeps();
  const queue = await pricingQueue();

  if (queue.length === 0) {
    return (
      <>
        <PageTitle title="Pricing queue" />
        <EmptyState
          title="Queue clear"
          body="Every submitted task has been priced. New client submissions land here automatically, sorted by closest client deadline so the urgent ones are always on top."
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Pricing queue"
        sub={`${queue.length} task${queue.length > 1 ? "s" : ""} waiting — sorted by urgency. Open the first one and work down with Approve & next.`}
      />
      <Card>
        <div className="divide-y divide-[#14161A]/[0.06]">
          {queue.map((t, i) => (
            <Link
              key={t.id}
              href={`/admin/pricing/${t.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-[#14161A]/[0.02]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-[#5B6069]">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#14161A]">{t.title}</p>
                  <p className="mt-0.5 text-xs text-[#5B6069]">
                    {t.client.name} ·{" "}
                    <span className="font-mono tabular-nums">{t._count.files}</span> file
                    {t._count.files === 1 ? "" : "s"} · submitted{" "}
                    <LocalTime iso={t.createdAt} dateStyle="short" />
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
