import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { tasksForVa, completedTasksForVa } from "@/lib/queries/tasks";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { Badge, Card, CardBody, EmptyState, LinkButton, PageTitle } from "@/components/ui";

const VA_STATUS_COPY: Record<string, { label: string; body: string; tone: string }> = {
  pending_test: {
    label: "Entry test required",
    body: "Before the task pool opens, you complete a short entry test — a few sample exercises graded personally by the operator. The test page is being finalised; you will see it here.",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
  pending_grading: {
    label: "Test submitted",
    body: "Your test is in the grading queue. You will see the result here — no need to check in.",
    tone: "border-blue-200 bg-blue-50 text-blue-800",
  },
  approved: {
    label: "Approved",
    body: "You can claim work from the pool.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  rejected: {
    label: "Not approved",
    body: "Your entry test did not pass this time. You can retake it after the cooldown period.",
    tone: "border-neutral-200 bg-neutral-100 text-neutral-600",
  },
  suspended: {
    label: "Suspended",
    body: "Your access to the pool is paused pending review. Tasks already in your hands are unaffected.",
    tone: "border-red-200 bg-red-50 text-red-800",
  },
};

export default async function VaHome() {
  const user = await requireRole("VA");
  const settings = await getSettings();

  const profile = await prisma.vaProfile.findUnique({
    where: { userId: user.id },
    select: {
      status: true,
      scoreCache: true,
      ratedCount: true,
      tasksCompleted: true,
      tasksAbandoned: true,
      suspensionReason: true,
    },
  });

  const status = profile?.status ?? "pending_test";
  const copy = VA_STATUS_COPY[status] ?? VA_STATUS_COPY.pending_test;
  const approved = status === "approved";

  const [active, history, owed] = await Promise.all([
    approved ? tasksForVa(user.id) : Promise.resolve([]),
    approved ? completedTasksForVa(user.id) : Promise.resolve([]),
    // Money owed to this worker — their own payouts only.
    prisma.payout.aggregate({
      where: { vaId: user.id, status: { in: ["owed", "released"] } },
      _sum: { amountCents: true },
    }),
  ]);

  const pendingCents = owed._sum.amountCents ?? 0;

  return (
    <div className="space-y-6">
      <PageTitle
        title="My work"
        action={approved ? <LinkButton href="/va/pool">Browse available work</LinkButton> : undefined}
      />

      {/* Account status */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-neutral-900">Account status</p>
            <Badge className={copy.tone}>{copy.label}</Badge>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">{copy.body}</p>
          {status === "suspended" && profile?.suspensionReason ? (
            <p className="mt-2 text-sm text-neutral-500">Reason: {profile.suspensionReason}</p>
          ) : null}
        </CardBody>
      </Card>

      {approved ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardBody className="!p-4">
              <p className="text-xs text-neutral-400">Quality score</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-neutral-900">
                {profile?.scoreCache != null ? profile.scoreCache.toFixed(2) : "—"}
              </p>
              <p className="text-[11px] text-neutral-400">
                {profile?.ratedCount ?? 0} rated {profile?.ratedCount === 1 ? "delivery" : "deliveries"}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="!p-4">
              <p className="text-xs text-neutral-400">Completed</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-neutral-900">
                {profile?.tasksCompleted ?? 0}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="!p-4">
              <p className="text-xs text-neutral-400">Pending payout</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-neutral-900">
                {formatCents(pendingCents)}
              </p>
              <p className="text-[11px] text-neutral-400">paid out manually</p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {approved ? (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-label text-neutral-400">
            In my hands
          </h2>
          {active.length === 0 ? (
            <EmptyState
              title="Nothing claimed"
              body="When you claim a task from the pool it appears here with the client's files and your deadline."
              action={<LinkButton href="/va/pool">Browse available work</LinkButton>}
            />
          ) : (
            <Card>
              <div className="divide-y divide-neutral-100">
                {active.map((t) => (
                  <Link
                    key={t.id}
                    href={`/va/tasks/${t.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900">{t.title}</p>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {t.vaDeadlineUtc ? (
                          <>
                            Due <LocalTime iso={t.vaDeadlineUtc} dateStyle="short" />
                          </>
                        ) : (
                          "No fixed deadline"
                        )}
                        {t.qcRounds > 0 ? ` · ${t.qcRounds} revision${t.qcRounds > 1 ? "s" : ""}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">
                      {t.vaPayoutCents != null ? formatCents(t.vaPayoutCents, t.currency) : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </section>
      ) : null}

      {history.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-label text-neutral-400">
            History
          </h2>
          <Card>
            <div className="divide-y divide-neutral-100">
              {history.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-neutral-800">{t.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      {t.completedAt ? <LocalTime iso={t.completedAt} dateStyle="short" /> : t.status}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-neutral-600">
                    {t.vaPayoutCents != null ? formatCents(t.vaPayoutCents, t.currency) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {approved ? (
        <p className="text-xs leading-relaxed text-neutral-400">
          You may hold up to {settings.maxActiveClaims} tasks at once. Payouts are released
          after the operator approves your delivery, then paid out manually.
        </p>
      ) : null}
    </div>
  );
}
