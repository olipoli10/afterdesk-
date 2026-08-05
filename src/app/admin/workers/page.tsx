import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { vaBadgeClass } from "@/lib/status";
import { LocalTime } from "@/components/local-time";
import { WorkerActions } from "@/components/worker-actions";
import { Badge, Card, CardBody, EmptyState, PageTitle, moneyPayout } from "@/components/ui";

const STATUS_LABEL: Record<string, string> = {
  pending_test: "Application received",
  pending_grading: "Awaiting your decision",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

export default async function WorkersPage() {
  await requireRole("ADMIN");
  const settings = await getSettings();

  // Money owed per worker, so the payout column is real rather than derived
  // from task status. Certifications are loaded alongside because /workers
  // promises the applicant "your certificates are on your application when we
  // read it" — a promise this page did not keep until now: it never queried
  // the table, so the reviewer decided blind on the one signal the Academy
  // exists to produce.
  const [profiles, owed, certs, categories] = await Promise.all([
    prisma.vaProfile.findMany({
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
        experienceSummary: true,
        specialties: true,
        weeklyAvailability: true,
        portfolioUrl: true,
        applicationSubmittedAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    prisma.payout.groupBy({
      by: ["vaId"],
      where: { status: { in: ["owed", "released"] } },
      _sum: { amountCents: true },
    }),
    prisma.certification.findMany({
      select: { userId: true, courseSlug: true, earnedAt: true },
      orderBy: { earnedAt: "asc" },
    }),
    // The real category list, not a copy: a course slug matches a pool
    // category exactly (data-cleanup, research, writing...), so reading the
    // table means this marking cannot drift when a category is added.
    prisma.taskCategory.findMany({ select: { slug: true } }),
  ]);
  const CATEGORY_COURSES = new Set(categories.map((c) => c.slug));
  const owedByVa = new Map(owed.map((o) => [o.vaId, o._sum.amountCents ?? 0]));
  const certsByVa = new Map<string, { courseSlug: string; earnedAt: Date }[]>();
  for (const c of certs) {
    const list = certsByVa.get(c.userId) ?? [];
    list.push({ courseSlug: c.courseSlug, earnedAt: c.earnedAt });
    certsByVa.set(c.userId, list);
  }

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
                    <h2 className="text-[15px] font-medium text-[#14161A]">{p.user.name}</h2>
                    <Badge className={vaBadgeClass(p.status)}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-[#5B6069]">
                    <span className="font-mono">{p.user.email}</span> · {p.timezone} · joined{" "}
                    <LocalTime iso={p.createdAt} dateStyle="short" />
                  </p>
                  {p.status === "suspended" && p.suspensionReason ? (
                    <p className="mt-2 text-sm text-[#5B6069]">{p.suspensionReason}</p>
                  ) : null}
                  {p.experienceSummary ? (
                    <div className="mt-3 max-w-2xl space-y-1 text-sm text-[#5B6069]">
                      <p className="whitespace-pre-wrap text-[#14161A]">{p.experienceSummary}</p>
                      <p>
                        <span className="font-medium text-[#14161A]">Specialties:</span>{" "}
                        {p.specialties}
                      </p>
                      <p>
                        <span className="font-medium text-[#14161A]">Availability:</span>{" "}
                        {p.weeklyAvailability}
                      </p>
                      {p.portfolioUrl ? (
                        <a
                          href={p.portfolioUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block underline underline-offset-2"
                        >
                          Open work sample
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {/* The certificates the applicant was told you would see.
                      Category-course certificates are listed first and marked,
                      because those are the ones that map 1:1 onto a pool
                      category: a data-cleanup certificate is evidence for
                      data-cleanup work specifically. */}
                  <div className="mt-3 max-w-2xl text-sm">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                      Academy certificates
                    </p>
                    {(certsByVa.get(p.userId) ?? []).length === 0 ? (
                      <p className="mt-1 text-[#5B6069]">None earned yet.</p>
                    ) : (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {(certsByVa.get(p.userId) ?? []).map((c) => {
                          const isCategory = CATEGORY_COURSES.has(c.courseSlug);
                          return (
                            <li
                              key={c.courseSlug}
                              title={`Earned ${c.earnedAt.toISOString().slice(0, 10)}`}
                              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                                isCategory
                                  ? "border-[#1E7F5C]/40 bg-[#1E7F5C]/10 text-[#166049]"
                                  : "border-black/12 bg-black/[0.03] text-[#5B6069]"
                              }`}
                            >
                              {c.courseSlug}
                              {isCategory ? " ✓" : ""}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                <dl className="flex shrink-0 gap-5 text-sm">
                  <div className="text-right">
                    <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                      Score
                    </dt>
                    <dd className="font-mono tabular-nums text-[#14161A]">
                      {p.scoreCache != null ? p.scoreCache.toFixed(2) : "—"}
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                      Done
                    </dt>
                    <dd className="font-mono tabular-nums text-[#14161A]">{p.tasksCompleted}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                      Dropped
                    </dt>
                    <dd className="font-mono tabular-nums text-[#14161A]">{p.tasksAbandoned}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                      Owed
                    </dt>
                    <dd className={moneyPayout}>{formatCents(owedByVa.get(p.userId) ?? 0)}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-4 border-t border-[#14161A]/[0.06] pt-3">
                <WorkerActions vaUserId={p.userId} status={p.status} />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-[#5B6069]">
        A rolling score below{" "}
        <span className="font-mono tabular-nums">{settings.suspensionFloor.toFixed(1)}</span> across{" "}
        <span className="font-mono tabular-nums">{settings.minRatedDeliveries}</span> rated
        deliveries suspends a worker automatically. High-value tasks need{" "}
        <span className="font-mono tabular-nums">{settings.highValueThreshold.toFixed(1)}</span>.
      </p>
    </>
  );
}
