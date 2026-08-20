import Link from "next/link";
import type { TaskStatus } from "@prisma-client";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { runOperatorSweeps } from "@/server/sweeps";

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

  const needsJudgment = tiles.filter((tile) => tile.accent);
  const primaryQueue = needsJudgment[0] ?? tiles[0];

  return (
    <div data-endvera-operator-overview className="space-y-5 sm:space-y-7">
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.025)_48%,rgba(232,125,27,0.12))] px-5 py-6 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.9)] sm:px-7 sm:py-8">
        <div aria-hidden className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#E87D1B]/15 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#E8A35B]">Operator control</p>
            <h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.035em] text-[#F7F6F3] sm:text-4xl">
              The work that needs your judgment.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#B8BDC6] sm:text-base">
              Clear the decisions that unblock a client. Pricing, quality review and exceptions stay visible; the rest of the workflow keeps its place.
            </p>
          </div>
          <Link
            href={primaryQueue.href}
            className="group rounded-xl border border-[#E8A35B]/35 bg-[#E87D1B]/10 p-4 transition-colors hover:bg-[#E87D1B]/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A35B]"
          >
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[#E8A35B]">Action now</p>
            <p className="mt-3 text-3xl font-medium tabular-nums tracking-tight text-[#F7F6F3]">{primaryQueue.value}</p>
            <p className="mt-1 text-sm text-[#D7DAE0]">{primaryQueue.label}</p>
            <p className="mt-4 text-[12px] font-medium text-[#F7F6F3] group-hover:text-[#F5C38C]">Open queue →</p>
          </Link>
        </div>
      </section>

      <section aria-labelledby="operator-signal" className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-[0_18px_48px_-38px_rgba(0,0,0,0.95)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A9099]">Workflow signal</p>
            <h2 id="operator-signal" className="mt-1 text-lg font-medium tracking-[-0.02em] text-[#F7F6F3]">Queues, not noise.</h2>
          </div>
          <p className="max-w-sm text-right text-xs leading-relaxed text-[#8A9099]">Counts are live workflow states. Opening a queue never changes a task.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <Link
              key={tile.label}
              href={tile.href}
              className={`group min-h-28 rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A35B] ${
                tile.accent
                  ? "border-[#E87D1B]/40 bg-[#E87D1B]/10 hover:bg-[#E87D1B]/16"
                  : "border-white/[0.09] bg-[#0A0B0D]/30 hover:border-white/20 hover:bg-white/[0.055]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className={`font-mono text-[10px] font-medium uppercase tracking-[0.13em] ${tile.accent ? "text-[#E8A35B]" : "text-[#8A9099]"}`}>{tile.label}</p>
                <span aria-hidden className="text-sm text-[#8A9099] transition-transform group-hover:translate-x-0.5">→</span>
              </div>
              <p className="mt-4 text-3xl font-medium tabular-nums tracking-tight text-[#F7F6F3]">{tile.value}</p>
            </Link>
          ))}
        </div>
      </section>

      <p className="px-1 text-xs leading-relaxed text-[#8A9099]">
        ENDVERA keeps the operating picture clear. Price approval, quality decisions and task actions remain explicit human controls.
      </p>
    </div>
  );
}
