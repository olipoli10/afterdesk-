import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import {
  tasksForVa,
  completedTasksForVa,
  returnedSubmissionsForVa,
} from "@/lib/queries/tasks";
import { formatCents } from "@/lib/money";
import { statusBadgeClass, vaBadgeClass, type VaProfileStatus } from "@/lib/status";
import { LocalTime } from "@/components/local-time";
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  LinkButton,
  PageTitle,
  SectionLabel,
  moneyPayout,
} from "@/components/ui";
import { vaProfileFor } from "./layout";

/**
 * Honest onboarding copy: the funnel today is application → operator review.
 * There is no entry test yet — never promise one.
 */
const VA_STATUS_COPY: Record<VaProfileStatus, { label: string; body: string }> = {
  pending_test: {
    label: "Application received",
    body: "Your application is with the operator, who reviews every application personally. You'll see the decision here — no need to check in.",
  },
  pending_grading: {
    label: "Under review",
    body: "The operator is reviewing your application. You'll see the result here — no need to check in.",
  },
  approved: {
    label: "Approved",
    body: "You can claim work from the pool.",
  },
  rejected: {
    label: "Not approved",
    body: "Your application wasn't approved this time.",
  },
  suspended: {
    label: "Suspended",
    body: "Your access is paused pending review. Tasks in your hands are on hold — the operator will restore or reassign them.",
  },
};

/** Worker-facing labels for the tasks currently in their hands. */
const VA_TASK_LABELS: Record<string, string> = {
  claimed: "In progress",
  submitted_for_qc: "Sent for review",
  qc_rejected: "Changes needed",
  revision_requested: "Revision requested",
  disputed: "On hold",
};

/** Action-required rows first, waiting rows last. */
const ACTION_WEIGHT: Record<string, number> = {
  qc_rejected: 0,
  revision_requested: 0,
  claimed: 1,
  disputed: 2,
  submitted_for_qc: 3,
};

/** Worker-facing labels for closed history rows. */
const VA_HISTORY_LABELS: Record<string, string> = {
  completed: "Approved",
  cancelled: "Cancelled",
  expired: "Expired",
};

type HistoryRow = {
  key: string;
  title: string;
  when: Date | null;
  badgeClass: string;
  badgeLabel: string;
  amountCents: number | null;
  currency: string;
  note: string | null;
};

export default async function VaHome() {
  const user = await requireRole("VA");

  const [profile, settings] = await Promise.all([vaProfileFor(user.id), getSettings()]);

  const status: VaProfileStatus = profile?.status ?? "pending_test";
  const copy = VA_STATUS_COPY[status];
  const approved = status === "approved";

  const [active, history, returned, owed] = await Promise.all([
    approved ? tasksForVa(user.id) : Promise.resolve([]),
    approved ? completedTasksForVa(user.id) : Promise.resolve([]),
    approved ? returnedSubmissionsForVa(user.id) : Promise.resolve([]),
    // Money owed to this worker — their own payouts only.
    prisma.payout.aggregate({
      where: { vaId: user.id, status: { in: ["owed", "released"] } },
      _sum: { amountCents: true },
    }),
  ]);

  const pendingCents = owed._sum.amountCents ?? 0;

  const sortedActive = [...active].sort(
    (a, b) => (ACTION_WEIGHT[a.status] ?? 4) - (ACTION_WEIGHT[b.status] ?? 4)
  );

  // History = finished tasks PLUS deliveries that left the worker's hands
  // after a final rejection — those must not silently vanish.
  const historyRows: HistoryRow[] = [
    ...history.map((t) => ({
      key: `t-${t.id}`,
      title: t.title,
      when: t.completedAt,
      badgeClass: statusBadgeClass(t.status),
      badgeLabel: VA_HISTORY_LABELS[t.status] ?? "Closed",
      // Only an approved delivery is paid — never show a payout figure on a
      // cancelled or expired task.
      amountCents: t.status === "completed" ? t.vaPayoutCents : null,
      currency: t.currency,
      note: null,
    })),
    ...returned.map((s) => ({
      key: `s-${s.id}`,
      title: s.task.title,
      when: s.reviewedAt,
      badgeClass: statusBadgeClass("qc_rejected"),
      badgeLabel: "Returned",
      amountCents: null,
      currency: "USD",
      note: "Returned to the pool after review — this delivery wasn't paid.",
    })),
  ].sort((a, b) => (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0));

  return (
    <div className="space-y-6">
      <PageTitle
        title="My work"
        action={approved ? <LinkButton href="/va/pool">Find work</LinkButton> : undefined}
      />

      {/* Account status */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-[#14161A]">Account status</p>
            <Badge className={vaBadgeClass(status)}>{copy.label}</Badge>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#5B6069]">{copy.body}</p>
          {status === "suspended" && profile?.suspensionReason ? (
            <p className="mt-2 text-sm text-[#5B6069]">Reason: {profile.suspensionReason}</p>
          ) : null}
        </CardBody>
      </Card>

      {approved ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardBody className="!p-4">
              <SectionLabel>Quality score</SectionLabel>
              <p className="mt-1 font-mono text-xl font-medium tabular-nums text-[#14161A]">
                {profile?.scoreCache != null ? profile.scoreCache.toFixed(2) : "—"}
              </p>
              <p className="font-mono text-[11px] tabular-nums text-[#5B6069]">
                {profile?.ratedCount ?? 0} rated {profile?.ratedCount === 1 ? "delivery" : "deliveries"}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="!p-4">
              <SectionLabel>Completed</SectionLabel>
              <p className="mt-1 font-mono text-xl font-medium tabular-nums text-[#14161A]">
                {profile?.tasksCompleted ?? 0}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="!p-4">
              <SectionLabel>Pending payout</SectionLabel>
              <p className={`mt-1 text-xl font-medium ${moneyPayout}`}>
                {formatCents(pendingCents)}
              </p>
              <p className="text-[11px] text-[#5B6069]">paid out manually</p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {approved ? (
        <section>
          <SectionLabel as="h2" className="mb-2">
            In my hands
          </SectionLabel>
          {sortedActive.length === 0 ? (
            <EmptyState
              title="Nothing claimed"
              body="When you claim a task from the pool it appears here with the client's files and your deadline."
              action={<LinkButton href="/va/pool">Find work</LinkButton>}
            />
          ) : (
            <Card>
              <div className="divide-y divide-[#14161A]/[0.06]">
                {sortedActive.map((t) => (
                  <Link
                    key={t.id}
                    href={`/va/tasks/${t.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-[#14161A]/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#14161A]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#14161A]">{t.title}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge className={statusBadgeClass(t.status)}>
                          {VA_TASK_LABELS[t.status] ?? "In progress"}
                        </Badge>
                        <span className="font-mono text-xs tabular-nums text-[#5B6069]">
                          {t.vaDeadlineUtc ? (
                            <>
                              Due <LocalTime iso={t.vaDeadlineUtc} dateStyle="short" />
                            </>
                          ) : (
                            "No fixed deadline"
                          )}
                          {t.qcRounds > 0 ? ` · ${t.qcRounds} revision${t.qcRounds > 1 ? "s" : ""}` : ""}
                        </span>
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm ${moneyPayout}`}>
                      {t.vaPayoutCents != null ? formatCents(t.vaPayoutCents, t.currency) : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </section>
      ) : null}

      {historyRows.length > 0 ? (
        <section>
          <SectionLabel as="h2" className="mb-2">
            History
          </SectionLabel>
          <Card>
            <div className="divide-y divide-[#14161A]/[0.06]">
              {historyRows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[#14161A]">{row.title}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge className={row.badgeClass}>{row.badgeLabel}</Badge>
                      {row.when ? (
                        <span className="font-mono text-xs tabular-nums text-[#5B6069]">
                          <LocalTime iso={row.when} dateStyle="short" />
                        </span>
                      ) : null}
                    </p>
                    {row.note ? (
                      <p className="mt-1 text-xs leading-relaxed text-[#5B6069]">{row.note}</p>
                    ) : null}
                  </div>
                  <span
                    className={
                      row.amountCents != null
                        ? `shrink-0 text-sm ${moneyPayout}`
                        : "shrink-0 font-mono text-sm text-[#5B6069]"
                    }
                  >
                    {row.amountCents != null ? formatCents(row.amountCents, row.currency) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {approved ? (
        <p className="text-xs leading-relaxed text-[#5B6069]">
          You may hold up to{" "}
          <span className="font-mono tabular-nums">{settings.maxActiveClaims}</span> tasks at
          once. Payouts are released after the operator approves your delivery, then paid out
          manually.
        </p>
      ) : null}
    </div>
  );
}
