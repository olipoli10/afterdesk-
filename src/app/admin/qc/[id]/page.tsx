import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { taskForAdmin } from "@/lib/queries/tasks";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { QcForm } from "@/components/qc-form";
import { Card, CardBody, PageTitle, SectionLabel, formatBytes } from "@/components/ui";

export default async function QcReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;

  const task = await taskForAdmin(id);
  if (!task) notFound();
  if (task.status !== "submitted_for_qc") redirect(`/admin/tasks/${id}`);

  const settings = await getSettings();

  const submission = await prisma.submission.findFirst({
    where: { taskId: id, qcStatus: "pending" },
    select: {
      id: true,
      attemptNo: true,
      note: true,
      submittedAt: true,
      va: { select: { id: true, name: true } },
      files: {
        where: { purgedAt: null },
        select: { id: true, fileName: true, sizeBytes: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { attemptNo: "desc" },
  });
  if (!submission) redirect(`/admin/tasks/${id}`);

  const vaProfile = await prisma.vaProfile.findUnique({
    where: { userId: submission.va.id },
    select: { scoreCache: true, ratedCount: true, tasksCompleted: true, qcRejections: true },
  });

  const inputFiles = task.files.filter((f) => f.kind === "input");

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title={task.title}
        sub={`Delivered by ${submission.va.name} · attempt ${submission.attemptNo}`}
        action={
          <Link href="/admin/qc" className="text-sm font-medium text-neutral-500 hover:text-neutral-900">
            ← Queue
          </Link>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardBody>
            <SectionLabel>What was asked for</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
              {task.description}
            </p>
            {task.category?.name ? (
              <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                Category: {task.category.name}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardBody>
              <SectionLabel>Worker record</SectionLabel>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Score</dt>
                  <dd className="tabular-nums text-neutral-900">
                    {vaProfile?.scoreCache != null ? vaProfile.scoreCache.toFixed(2) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Completed</dt>
                  <dd className="tabular-nums text-neutral-900">{vaProfile?.tasksCompleted ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">QC rejections</dt>
                  <dd className="tabular-nums text-neutral-900">{vaProfile?.qcRejections ?? 0}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionLabel>Money</SectionLabel>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Client pays</dt>
                  <dd className="tabular-nums text-neutral-900">
                    {task.clientPriceCents != null
                      ? formatCents(task.clientPriceCents, task.currency)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Worker earns</dt>
                  <dd className="tabular-nums text-neutral-900">
                    {task.vaPayoutCents != null
                      ? formatCents(task.vaPayoutCents, task.currency)
                      : "—"}
                  </dd>
                </div>
              </dl>
              {task.clientDeadlineUtc ? (
                <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                  Client expects it by{" "}
                  <LocalTime iso={task.clientDeadlineUtc} dateStyle="short" />
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mb-4">
        <CardBody>
          <SectionLabel>The delivery</SectionLabel>
          <p className="mt-1 text-xs text-neutral-400">
            Submitted <LocalTime iso={submission.submittedAt} />
          </p>
          {submission.note ? (
            <p className="mt-3 whitespace-pre-wrap rounded-md bg-neutral-50 p-3 text-sm leading-relaxed text-neutral-700">
              {submission.note}
            </p>
          ) : null}
          {submission.files.length > 0 ? (
            <ul className="mt-3 divide-y divide-neutral-100 text-sm">
              {submission.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <a
                    href={`/api/files/${f.id}/download`}
                    className="truncate font-medium text-blue-700 hover:underline"
                  >
                    {f.fileName}
                  </a>
                  <span className="shrink-0 pl-2 text-xs text-neutral-400">
                    {formatBytes(f.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">No files — the note is the delivery.</p>
          )}
        </CardBody>
      </Card>

      {inputFiles.length > 0 ? (
        <Card className="mb-4">
          <CardBody>
            <SectionLabel>What they worked from</SectionLabel>
            <ul className="mt-2 divide-y divide-neutral-100 text-sm">
              {inputFiles.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <a
                    href={`/api/files/${f.id}/download`}
                    className="truncate text-neutral-700 hover:underline"
                  >
                    {f.fileName}
                  </a>
                  <span className="shrink-0 pl-2 text-xs text-neutral-400">
                    {formatBytes(f.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <QcForm
        submissionId={submission.id}
        qcRound={task.qcRounds}
        maxQcRounds={settings.maxQcRounds}
      />
    </div>
  );
}
