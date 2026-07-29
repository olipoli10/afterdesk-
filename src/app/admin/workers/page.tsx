import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { WorkerActions } from "@/components/worker-actions";
import { Badge, Card, CardBody, EmptyState, PageTitle } from "@/components/ui";

const STATUS_TONE: Record<string, string> = {
  pending_test: "border-amber-200 bg-amber-50 text-amber-800",
  pending_grading: "border-blue-200 bg-blue-50 text-blue-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-neutral-200 bg-neutral-100 text-neutral-600",
  suspended: "border-red-200 bg-red-50 text-red-800",
};

const STATUS_LABEL: Record<string, string> = {
  pending_test: "Entry test required",
  pending_grading: "Test submitted",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

export default async function WorkersPage() {
  await requireRole("ADMIN");
  const settings = await getSettings();

  const profiles = await prisma.vaProfile.findMany({
    select: {
      userId: true,
      status: true,
      timezone: true,
      scoreCache: true,
      ratedCount: true,
      tasksCompleted: true,
      tasksAbandoned: true,
      deadlinesMissed: true,
      qcRejections: true,
      suspensionReason: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  // Money owed per worker, so the payout column is real rather than derived
  // from task status.
  const owed = await prisma.payout.groupBy({
    by: ["vaId"],
    where: { status: { in: ["owed", "released"] } },
    _sum: { amountCents: true },
  });
  const owedByVa = new Map(owed.map((o) => [o.vaId, o._sum.amountCents ?? 0]));

  const waiting = profiles.filter((p) =>
    ["pending_test", "pending_grading"].includes(p.status)
  );

  if (profiles.length === 0) {
    return (
      <>
        <PageTitle title="Workers" />
        <EmptyState
          title="No applications yet"
          body="Anyone who applies through the worker sign-up appears here. Nobody reaches the task pool until you approve them."
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Workers"
        sub={
          waiting.length > 0
            ? `${waiting.length} waiting on your decision. Nobody sees the pool until approved.`
            : "Everyone here has been reviewed. Suspension is reversible."
        }
      />

      <div className="space-y-3">
        {profiles.map((p) => (
          <Card key={p.userId}>
            <CardBody>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-medium text-neutral-900">{p.user.name}</h2>
                    <Badge className={STATUS_TONE[p.status] ?? STATUS_TONE.pending_test}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {p.user.email} · {p.timezone} · joined{" "}
                    <LocalTime iso={p.createdAt} dateStyle="short" />
                  </p>
                  {p.status === "suspended" && p.suspensionReason ? (
                    <p className="mt-2 text-sm text-neutral-600">{p.suspensionReason}</p>
                  ) : null}
                </div>

                <dl className="flex shrink-0 gap-5 text-sm">
                  <div className="text-right">
                    <dt className="text-xs text-neutral-400">Score</dt>
                    <dd className="tabular-nums text-neutral-900">
                      {p.scoreCache != null ? p.scoreCache.toFixed(2) : "—"}
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-xs text-neutral-400">Done</dt>
                    <dd className="tabular-nums text-neutral-900">{p.tasksCompleted}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-xs text-neutral-400">Dropped</dt>
                    <dd className="tabular-nums text-neutral-900">{p.tasksAbandoned}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-xs text-neutral-400">Owed</dt>
                    <dd className="tabular-nums text-neutral-900">
                      {formatCents(owedByVa.get(p.userId) ?? 0)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-4 border-t border-neutral-100 pt-3">
                <WorkerActions vaUserId={p.userId} status={p.status} />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-neutral-400">
        A rolling score below {settings.suspensionFloor.toFixed(1)} across{" "}
        {settings.minRatedDeliveries} rated deliveries suspends a worker automatically.
        High-value tasks need {settings.highValueThreshold.toFixed(1)}.
      </p>
    </>
  );
}
