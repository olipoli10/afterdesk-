import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { poolTaskForVa } from "@/lib/queries/tasks";
import { formatCents } from "@/lib/money";
import { familyOf } from "@/lib/families";
import { LocalTime } from "@/components/local-time";
import { ClaimButton } from "@/components/va-actions";
import { Card, CardBody, EmptyState, LinkButton, SectionLabel } from "@/components/ui";
import { hasGuide } from "@/lib/training/content";
import { duePill } from "../board-tile";
import { vaProfileFor } from "../../layout";

/**
 * The pre-claim reading room. A claim release is recorded on the worker's
 * record, so nobody should ever commit from a two-line tile — this page
 * carries the FULL brief, the spec, and the standard the delivery will be
 * judged against (the category's dispute criteria), with the claim as the
 * one action.
 *
 * RULE 2: poolTaskForVa() — no client identity, no client price, no client
 * deadline, and no filenames (a count only): the task is still unclaimed,
 * so this page is visible to every approved worker. The same high-value
 * gate as the board applies, so a URL can't leak a gated task.
 */

export const metadata = {
  title: "Task details",
  robots: { index: false, follow: false },
};

export default async function PoolTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("VA");
  const [profile, settings, { id }] = await Promise.all([
    vaProfileFor(user.id),
    getSettings(),
    params,
  ]);
  if (profile?.status !== "approved") redirect("/va");

  const task = await poolTaskForVa(id, {
    score: profile.scoreCache,
    ratedCount: profile.ratedCount,
    highValueThreshold: settings.highValueThreshold,
    minRatedDeliveries: settings.minRatedDeliveries,
  });

  if (!task) {
    // Claimed by someone else, or gone — a normal race on a first-come
    // board, not an error page.
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          title="This task has left the pool"
          body="Someone claimed it first, or it's no longer open. The board moves fast — everything still available is one tap away."
          action={<LinkButton href="/va/pool">Back to available work</LinkButton>}
        />
      </div>
    );
  }

  const fam = familyOf(task.category?.slug);
  const due = duePill(task.vaDeadlineUtc);
  const guide = task.category && hasGuide(task.category.slug) ? task.category.slug : null;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4">
        <Link
          href="/va/pool"
          className="-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
        >
          ← Available work
        </Link>
      </p>

      <Card>
        <CardBody>
          {/* category + stamps */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.07em]"
              style={{ color: fam.hue }}
            >
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full"
                style={{ backgroundColor: fam.hue }}
              />
              {task.category?.name ?? "Unfiled"}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {task.tier === "high_value" ? (
                <span className="rounded-[2px] border border-[#1B2740] px-1.5 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#1B2740]">
                  High value
                </span>
              ) : null}
              {due ? (
                <span
                  className={`whitespace-nowrap rounded-[2px] px-1.5 py-[3px] font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] tabular-nums ${
                    due.tone === "soon"
                      ? "bg-[#A82318] text-white"
                      : due.tone === "near"
                        ? "bg-[#EDEBE6] text-[#14161A]"
                        : "text-[#5B6069]"
                  }`}
                >
                  {due.label}
                </span>
              ) : null}
            </span>
          </div>

          <h1 className="mt-2 text-[22px] font-semibold leading-snug tracking-[-0.015em] text-[#14161A]">
            {task.title}
          </h1>

          {/* payout */}
          <div className="mt-3 flex items-baseline gap-3">
            <p className="font-mono text-[26px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#166049]">
              {task.vaPayoutCents != null ? formatCents(task.vaPayoutCents, task.currency) : "—"}
            </p>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#5B6069]">
              Your payout — fixed
            </p>
          </div>

          {/* spec */}
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-[#14161A]/[0.08] pt-3 sm:grid-cols-4">
            <div>
              <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#5B6069]">
                Due from you
              </dt>
              <dd className="mt-1 font-mono text-[13px] tabular-nums text-[#14161A]">
                {task.vaDeadlineUtc ? (
                  <LocalTime iso={task.vaDeadlineUtc} dateStyle="short" />
                ) : (
                  <>
                    <span aria-hidden>—</span>
                    <span className="sr-only">No fixed deadline</span>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#5B6069]">
                Volume
              </dt>
              <dd className="mt-1 font-mono text-[13px] tabular-nums text-[#14161A]">
                {task.quantity ?? <span aria-hidden>—</span>}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#5B6069]">
                Files
              </dt>
              <dd className="mt-1 font-mono text-[13px] tabular-nums text-[#14161A]">
                {task._count.files}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#5B6069]">
                Estimated effort
              </dt>
              <dd className="mt-1 font-mono text-[13px] tabular-nums text-[#14161A]">
                {task.estimatedMinutes != null
                  ? `~${(task.estimatedMinutes / 60).toFixed(1)} h`
                  : "—"}
              </dd>
            </div>
          </dl>
          {task._count.files > 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-[#5B6069]">
              File names and downloads unlock when you claim — until then the pool shows
              counts only.
            </p>
          ) : null}

          {/* the full brief */}
          <div className="mt-5 border-t border-[#14161A]/[0.08] pt-4">
            <SectionLabel as="h2">The brief</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-[1.65] text-[#14161A]">
              {task.description}
            </p>
          </div>

          {/* the standard it will be judged against */}
          {task.category?.disputeCriteria ? (
            <div
              className="mt-5 rounded-[4px] px-4 py-3.5"
              style={{ backgroundColor: fam.tint }}
            >
              <p
                className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: fam.hue }}
              >
                What counts as delivered
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#14161A]">
                {task.category.disputeCriteria}
              </p>
              {guide ? (
                <p className="mt-2">
                  <Link
                    href={`/va/training/${guide}`}
                    className="font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 transition-colors duration-150 hover:decoration-[#14161A]"
                  >
                    Read the {task.category.name} guide
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}

          {/* the one action */}
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#14161A]/[0.08] pt-4">
            <ClaimButton taskId={task.id} label="Claim this task" />
            <span className="text-xs leading-relaxed text-[#5B6069]">
              First come, first served. Releasing a claimed task is recorded on your record.
            </span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
