import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { taskForVa } from "@/lib/queries/tasks";
import { formatCents } from "@/lib/money";
import { inputFileLabel } from "@/lib/filenames";
import { LocalTime } from "@/components/local-time";
import { DeliverableForm } from "@/components/deliverable-form";
import { ReleaseButton } from "@/components/va-actions";
import {
  Badge,
  Card,
  CardBody,
  PageTitle,
  SectionLabel,
  formatBytes,
  linkInline,
  moneyPayout,
} from "@/components/ui";
import { vaProfileFor } from "../../layout";

const metaLabel = "font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#5B6069]";

export default async function VaTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("VA");
  const { id } = await params;

  const profile = await vaProfileFor(user.id);
  if (profile?.status !== "approved") redirect("/va");

  // The three lookups are independent — never pay the waterfall.
  const [task, settings, lastReview] = await Promise.all([
    taskForVa(id, user.id),
    getSettings(),
    // The operator's most recent note on this worker's deliveries — the only
    // QC feedback the worker ever sees.
    prisma.submission.findFirst({
      where: { taskId: id, vaId: user.id, qcComment: { not: null } },
      select: { qcComment: true, qcStatus: true, attemptNo: true, reviewedAt: true },
      orderBy: { attemptNo: "desc" },
    }),
  ]);
  if (!task) notFound();

  const canDeliver =
    ["claimed", "qc_rejected"].includes(task.status) ||
    (task.status === "revision_requested" && Boolean(task.revisionInstructions));
  const awaitingReview = task.status === "submitted_for_qc";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle
        title={task.title}
        action={
          <span className="text-right">
            <span className={`block text-lg font-medium ${moneyPayout}`}>
              {task.vaPayoutCents != null ? formatCents(task.vaPayoutCents, task.currency) : "—"}
            </span>
            <span className={metaLabel}>Your payout</span>
          </span>
        }
      />

      {awaitingReview ? (
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-[#14161A]">Sent for review.</p>
            <p className="mt-1 text-sm leading-relaxed text-[#5B6069]">
              The operator reviews every delivery before it reaches the client. You&apos;ll see
              the outcome here.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {task.status === "qc_rejected" ? (
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-[#955710]">Changes needed</p>
            {lastReview?.qcStatus === "rejected" && lastReview.qcComment ? (
              <>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#14161A]">
                  {lastReview.qcComment}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[#5B6069]">
                  Round{" "}
                  <span className="font-mono tabular-nums">{lastReview.attemptNo}</span> of{" "}
                  <span className="font-mono tabular-nums">{settings.maxQcRounds}</span>. After{" "}
                  <span className="font-mono tabular-nums">{settings.maxQcRounds}</span>, the task
                  goes back to the pool for someone else.
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm leading-relaxed text-[#5B6069]">
                The operator is writing up what to change — it will appear here.
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {task.status === "revision_requested" ? (
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-[#955710]">Revision requested</p>
            <p className="mt-1 text-sm leading-relaxed text-[#5B6069]">
              The client asked for changes after delivery.
            </p>
            {task.revisionInstructions ? (
              <>
                <SectionLabel className="mt-3">Operator&apos;s note</SectionLabel>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#14161A]">
                  {task.revisionInstructions}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-[#5B6069]">
                The operator is writing up what to change — it will appear here.
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {task.category ? (
              <Badge className="border-[#14161A]/15 bg-transparent text-[#5B6069]">
                {task.category.name}
              </Badge>
            ) : null}
            {task.tier === "high_value" ? (
              <Badge className="border-[#1B2740]/30 bg-[#1B2740]/[0.06] text-[#1B2740]">
                High-value
              </Badge>
            ) : null}
          </div>
          <SectionLabel>What to do</SectionLabel>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#14161A]">
            {task.description}
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-[#14161A]/[0.08] pt-3 text-sm">
            <div>
              <dt className={metaLabel}>Your deadline</dt>
              <dd className="mt-0.5 text-[#14161A]">
                {task.vaDeadlineUtc ? <LocalTime iso={task.vaDeadlineUtc} /> : "No fixed deadline"}
              </dd>
            </div>
            {task.quantity ? (
              <div>
                <dt className={metaLabel}>Volume</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-[#14161A]">{task.quantity}</dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      {task.category?.disputeCriteria ? (
        <Card>
          <CardBody>
            <SectionLabel>What counts as done</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#5B6069]">
              {task.category.disputeCriteria}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {task.files.length > 0 ? (
        <Card>
          <CardBody>
            <SectionLabel>Files to work from</SectionLabel>
            <ul className="mt-2 divide-y divide-[#14161A]/[0.06] text-sm">
              {task.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2.5">
                  {/* RULE 1: never the client's own filename — it can name them. */}
                  <a
                    href={`/api/files/${f.id}/download`}
                    className={`truncate font-mono text-[13px] ${linkInline}`}
                  >
                    {inputFileLabel(f.fileName, task.id, f.id)}
                  </a>
                  <span className="shrink-0 pl-2 font-mono text-xs tabular-nums text-[#5B6069]">
                    {formatBytes(f.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-[#5B6069]">
              Your access to these ends when the task leaves your hands.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {canDeliver ? (
        <DeliverableForm
          taskId={task.id}
          maxFileSizeMB={settings.maxFileSizeMB}
          maxFiles={settings.maxFilesPerTask}
          allowedExtensions={settings.allowedExtensions}
          isResubmission={task.status !== "claimed"}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Link
          href="/va"
          className="-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
        >
          ← My work
        </Link>
        {task.status === "claimed" ? <ReleaseButton taskId={task.id} /> : null}
      </div>
    </div>
  );
}
