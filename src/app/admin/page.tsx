import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { runOperatorSweeps } from "@/server/sweeps";
import { Card, CardBody, PageTitle } from "@/components/ui";

async function count(where: object): Promise<number> {
  return prisma.task.count({ where });
}

export default async function AdminOverview() {
  await requireRole("ADMIN");
  await runOperatorSweeps();

  const [pricing, quoted, open, working, terminalDone] = await Promise.all([
    count({ status: { in: ["submitted", "pricing_review"] } }),
    count({ status: "quoted" }),
    count({ status: "open" }),
    count({ status: { in: ["claimed", "submitted_for_qc", "qc_rejected", "revision_requested"] } }),
    count({ status: "completed" }),
  ]);

  const tiles = [
    { label: "Needs pricing", value: pricing, href: "/admin/pricing", accent: pricing > 0 },
    { label: "Awaiting client decision", value: quoted, href: "/admin/tasks?status=quoted", accent: false },
    { label: "Open in pool", value: open, href: "/admin/tasks?status=open", accent: false },
    { label: "In progress / QC", value: working, href: "/admin/tasks", accent: false },
    { label: "Completed", value: terminalDone, href: "/admin/tasks?status=completed", accent: false },
  ];

  return (
    <>
      <PageTitle title="Overview" sub="Your queues, most urgent first. Morning throughput is the ceiling — clear pricing first." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className={t.accent ? "border-indigo-300" : ""}>
              <CardBody className="!p-4">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-900">
                  {t.value}
                </p>
                <p className="mt-0.5 text-xs font-medium text-neutral-500">{t.label}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-neutral-400">
        QC queue, entry-test grading, VA roster, payouts and receivables arrive in the next
        build steps — nothing here is a placeholder for working features.
      </p>
    </>
  );
}
