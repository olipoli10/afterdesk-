import Link from "next/link";
import type { TaskStatus } from "@prisma/client";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { runOperatorSweeps } from "@/server/sweeps";
import { Card, CardBody, PageTitle } from "@/components/ui";

export default async function AdminOverview() {
  await requireRole("ADMIN");
  await runOperatorSweeps();

  // One GROUP BY covers every tile — no per-tile count queries.
  const grouped = await prisma.task.groupBy({ by: ["status"], _count: { _all: true } });
  const countOf = (statuses: TaskStatus[]) =>
    grouped
      .filter((g) => statuses.includes(g.status))
      .reduce((sum, g) => sum + g._count._all, 0);

  const pricing = countOf(["submitted", "pricing_review"]);
  // A paid task the engine is still working on. It spends real money while it
  // sits here, and it is the one state that can stall on an operator decision,
  // so it gets its own tile rather than being folded into "in progress".
  const processing = countOf(["ai_processing"]);
  const tiles = [
    { label: "Needs pricing", value: pricing, href: "/admin/pricing", accent: pricing > 0 },
    {
      label: "Awaiting client decision",
      value: countOf(["quoted"]),
      href: "/admin/tasks?status=quoted",
      accent: false,
    },
    {
      label: "Automated processing",
      value: processing,
      href: "/admin/tasks?status=ai_processing",
      accent: processing > 0,
    },
    {
      label: "Open in pool",
      value: countOf(["open"]),
      href: "/admin/tasks?status=open",
      accent: false,
    },
    {
      label: "In progress / QC",
      value: countOf(["claimed", "submitted_for_qc", "qc_rejected", "revision_requested"]),
      href: "/admin/tasks",
      accent: false,
    },
    {
      label: "Completed",
      value: countOf(["completed"]),
      href: "/admin/tasks?status=completed",
      accent: false,
    },
  ];

  return (
    <>
      <PageTitle title="Overview" sub="Your queues, most urgent first. Morning throughput is the ceiling — clear pricing first." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className={t.accent ? "lift border-[#14161A]/40" : "lift hover:border-[#14161A]/20"}>
              <CardBody className="!p-4">
                <p className="font-mono text-2xl font-medium tabular-nums tracking-tight text-[#14161A]">
                  {t.value}
                </p>
                <p className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                  {t.label}
                </p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-[#5B6069]">
        Payouts and receivables arrive in the next build steps.
      </p>
    </>
  );
}
