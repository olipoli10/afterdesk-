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
import { Badge, Card, CardBody, PageTitle, SectionLabel, formatBytes } from "@/components/ui";

export default async function VaTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("VA");
  const { id } = await params;

  const profile = await prisma.vaProfile.findUnique({
    where: { userId: user.id },
    select: { status: true },
  });
  if (profile?.status !== "approved") redirect("/va");

  const task = await taskForVa(id, user.id);
  if (!task) notFound();

  const settings = await getSettings();

  // The rejection comment on their latest reviewed delivery — the only thing
  // the worker sees about QC, written by the operator.
  const lastRejected = await prisma.submission.findFirst({
    where: { taskId: id, vaId: user.id, qcStatus: "rejected" },
    select: { qcComment: true, attemptNo: true, reviewedAt: true },
    orderBy: { attemptNo: "desc" },
  });

  const canDeliver = ["claimed", "qc_rejected", "revision_requested"].includes(task.status);
  const awaitingReview = task.status === "submitted_for_qc";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle
        title={task.title}
        action={
          <span className="text-right">
            <span className="block text-lg font-semibold tabular-nums text-neutral-900">
              {task.vaPayoutCents != null ? formatCents(task.vaPayoutCents, task.currency) : "—"}
            </span>
            <span className="text-[11px] text-neutral-400">you earn</span>
          </span>
        }
      />

      {awaitingReview ? (
        <Card className="border-violet-200 bg-violet-50/40">
          <CardBody>
            <p className="text-sm font-medium text-neutral-900">Sent for review.</p>
            <p className="mt-1 text-sm text-neutral-600">
              The operator checks it before the client sees anything. If something needs
              fixing you will see the note here.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {task.status === "qc_rejected" && lastRejected ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardBody>
            <p className="text-sm font-medium text-neutral-900">Changes needed</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
              {lastRejected.qcComment}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Round {lastRejected.attemptNo} of {settings.maxQcRounds}. After{" "}
              {settings.maxQcRounds}, the task goes back to the pool for someone else.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {task.status === "revision_requested" ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardBody>
            <p className="text-sm font-medium text-neutral-900">Revision requested</p>
            <p className="mt-1 text-sm text-neutral-600">
              The client asked for changes after delivery. The operator&apos;s note is above
              or will arrive shortly.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {task.category ? (
              <Badge className="border-neutral-200 bg-neutral-50 text-neutral-600">
                {task.category.name}
              </Badge>
            ) : null}
            {task.tier === "high_value" ? (
              <Badge className="border-indigo-200 bg-indigo-50 text-indigo-800">High-value</Badge>
            ) : null}
          </div>
          <SectionLabel>What to do</SectionLabel>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
            {task.description}
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-neutral-100 pt-3 text-sm">
            <div>
              <dt className="text-xs text-neutral-400">Your deadline</dt>
              <dd className="text-neutral-800">
                {task.vaDeadlineUtc ? <LocalTime iso={task.vaDeadlineUtc} /> : "No fixed deadline"}
              </dd>
            </div>
            {task.quantity ? (
              <div>
                <dt className="text-xs text-neutral-400">Volume</dt>
                <dd className="text-neutral-800">{task.quantity}</dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      {task.category?.disputeCriteria ? (
        <Card>
          <CardBody>
            <SectionLabel>What counts as done</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
              {task.category.disputeCriteria}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {task.files.length > 0 ? (
        <Card>
          <CardBody>
            <SectionLabel>Files to work from</SectionLabel>
            <ul className="mt-2 divide-y divide-neutral-100 text-sm">
              {task.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  {/* RULE 1: never the client's own filename — it can name them. */}
                  <a
                    href={`/api/files/${f.id}/download`}
                    className="truncate font-medium text-blue-700 hover:underline"
                  >
                    {inputFileLabel(f.fileName, task.id, f.id)}
                  </a>
                  <span className="shrink-0 pl-2 text-xs text-neutral-400">
                    {formatBytes(f.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-neutral-400">
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

      <div className="flex items-center justify-between pt-2">
        <Link href="/va" className="text-sm font-medium text-neutral-500 hover:text-neutral-900">
          ← My work
        </Link>
        {task.status === "claimed" ? <ReleaseButton taskId={task.id} /> : null}
      </div>
    </div>
  );
}
