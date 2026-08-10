import type { TaskStatus } from "@prisma/client";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { standingCapacityForClient } from "@/lib/queries/standing-capacity";
import { EmptyState, LinkButton, Card, CardBody, SectionLabel } from "@/components/ui";
import { StandingTaskForm } from "@/components/standing-task-form";
import { StandingPreferenceForm } from "@/components/standing-preference-form";

export const metadata = {
  title: "My standing capacity",
  robots: { index: false, follow: false },
};

/**
 * Only the statuses a Standing Capacity task can actually reach (see
 * src/lib/state.ts — it never enters pricing_review/quoted/awaiting_payment/
 * open). Deliberately not src/lib/status.ts's clientStatusOf: that function
 * maps "submitted" to "Being priced", which is true for a one-off task and
 * false here — this account was never billed per task.
 */
const STANDING_STATUS_LABELS: Partial<Record<TaskStatus, string>> = {
  // "Waiting for assignment" was the honest word here and stays: nothing runs
  // until an operator routes the task, so anything suggesting work in flight
  // would be a promise the account cannot keep.
  submitted: "Waiting for assignment",
  // Reachable: a QC round that runs out of attempts, or a specialist releasing
  // the task, sends it to `open` (admin-qc.ts, va-tasks.ts) with no standing
  // exemption. The client's honest view of that state is the same one.
  open: "Waiting for assignment",
  claimed: "In progress",
  submitted_for_qc: "In review",
  qc_rejected: "In progress",
  revision_requested: "Revision in progress",
  completed: "Completed",
  disputed: "Under review",
  cancelled: "Cancelled",
};

export default async function StandingCapacityPage() {
  const user = await requireRole("CLIENT");
  const [account, settings] = await Promise.all([
    standingCapacityForClient(user.id),
    getSettings(),
  ]);

  if (!account) {
    return (
      <EmptyState
        title="No standing capacity account yet"
        body="Standing capacity is a recurring weekly block of hours, set up by an operator. Ask us about it from Our Services."
        action={
          <LinkButton href="/services/standing-capacity" variant="secondary">
            Learn how it works
          </LinkButton>
        }
      />
    );
  }

  const capacityMinutes = account.tierHours * 60;
  const remainingMinutes = Math.max(capacityMinutes - account.minutesUsedThisPeriod, 0);
  const usedPct = Math.min(100, Math.round((account.minutesUsedThisPeriod / capacityMinutes) * 100));

  return (
    <div className="space-y-8">
      <div>
        <SectionLabel>Standing capacity</SectionLabel>
        <h1 className="mt-1 text-2xl font-semibold text-[#14161A]">
          {account.tierHours}h / week
        </h1>
        <p className="mt-1 text-sm text-[#5B6069]">
          {account.status === "active"
            ? "Active"
            : account.status === "paused"
              ? "Paused — new tasks are not accepted right now."
              : "Cancelled."}
        </p>
      </div>

      <Card>
        <CardBody>
          <p className="text-sm font-medium text-[#14161A]">
            {Math.round(account.minutesUsedThisPeriod / 60)}h used of {account.tierHours}h this week
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#14161A]/8">
            <div
              className="h-full rounded-full bg-[#14161A]"
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[#5B6069]">
            Period resets {account.currentPeriodEnd.toLocaleDateString()}.
          </p>
        </CardBody>
      </Card>

      {account.status === "active" ? (
        <div>
          <h2 className="mb-3 text-[15px] font-medium text-[#14161A]">Submit a task</h2>
          <StandingTaskForm
            remainingMinutes={remainingMinutes}
            maxFileSizeMB={settings.maxFileSizeMB}
            maxFiles={settings.maxFilesPerTask}
            allowedExtensions={settings.allowedExtensions}
          />
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-[15px] font-medium text-[#14161A]">Preferences</h2>
        <StandingPreferenceForm initial={account.preference} />
      </div>

      <div>
        <h2 className="mb-3 text-[15px] font-medium text-[#14161A]">Task history</h2>
        {account.tasks.length === 0 ? (
          <EmptyState
            title="No tasks submitted yet"
            body="Tasks you submit into this block show up here."
          />
        ) : (
          <div className="space-y-2">
            {account.tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-[4px] border border-[#14161A]/10 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#14161A]">{task.title}</p>
                  <p className="text-xs text-[#5B6069]">
                    {task.createdAt.toLocaleDateString()}
                    {task.estimatedMinutes ? ` · ~${task.estimatedMinutes} min` : ""}
                  </p>
                </div>
                {/*
                  NO RAW ENUM CAN REACH THE CLIENT.

                  This fell back to `task.status`, which prints the database
                  value itself — "awaiting_payment", "ai_processing",
                  "pricing_review". The comment above argues those states are
                  unreachable for a standing task, and that is true today; the
                  fallback existed precisely for the day it stops being true,
                  and it chose to leak internals rather than say less.
                */}
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-[#5B6069]">
                  {STANDING_STATUS_LABELS[task.status] ?? "In progress"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
