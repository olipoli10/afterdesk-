import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { taskForAdmin } from "@/lib/queries/tasks";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { QcForm } from "@/components/qc-form";
import {
  Card,
  CardBody,
  PageTitle,
  SectionLabel,
  formatBytes,
  linkInline,
  moneyClient,
  moneyPayout,
} from "@/components/ui";

export default async function QcReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;

  // The operator's highest-frequency drill-down: task, settings and the
  // pending submission are independent — fetch them together. Only the
  // worker profile genuinely depends on the submission.
  const [task, settings, submission] = await Promise.all([
    taskForAdmin(id),
    getSettings(),
    prisma.submission.findFirst({
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
    }),
  ]);
  if (!task) notFound();
  if (task.status !== "submitted_for_qc") redirect(`/admin/tasks/${id}`);
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
          <Link
            href="/admin/qc"
            className="text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
          >
            ← Queue
          </Link>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardBody>
            <SectionLabel as="h2">What was asked for</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#14161A]">
              {task.description}
            </p>
            {task.category?.name ? (
              <p className="mt-3 border-t border-[#14161A]/[0.06] pt-3 text-xs text-[#5B6069]">
                Category: {task.category.name}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardBody>
              <SectionLabel as="h2">Worker record</SectionLabel>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#5B6069]">Score</dt>
                  <dd className="font-mono tabular-nums text-[#14161A]">
                    {vaProfile?.scoreCache != null ? vaProfile.scoreCache.toFixed(2) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5B6069]">Completed</dt>
                  <dd className="font-mono tabular-nums text-[#14161A]">
                    {vaProfile?.tasksCompleted ?? 0}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5B6069]">QC rejections</dt>
                  <dd className="font-mono tabular-nums text-[#14161A]">
                    {vaProfile?.qcRejections ?? 0}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionLabel as="h2">Money</SectionLabel>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#5B6069]">Client pays</dt>
                  <dd className={moneyClient}>
                    {task.clientPriceCents != null
                      ? formatCents(task.clientPriceCents, task.currency)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5B6069]">Worker earns</dt>
                  <dd className={moneyPayout}>
                    {task.vaPayoutCents != null
                      ? formatCents(task.vaPayoutCents, task.currency)
                      : "—"}
                  </dd>
                </div>
              </dl>
              {task.clientDeadlineUtc ? (
                <p className="mt-3 border-t border-[#14161A]/[0.06] pt-3 text-xs text-[#5B6069]">
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
          <SectionLabel as="h2">The delivery</SectionLabel>
          <p className="mt-1 text-xs text-[#5B6069]">
            Submitted <LocalTime iso={submission.submittedAt} />
          </p>
          {submission.note ? (
            <p className="mt-3 whitespace-pre-wrap rounded-md bg-[#14161A]/[0.03] p-3 text-sm leading-relaxed text-[#14161A]">
              {submission.note}
            </p>
          ) : null}
          {submission.files.length > 0 ? (
            <ul className="mt-3 divide-y divide-[#14161A]/[0.06] text-sm">
              {submission.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <a href={`/api/files/${f.id}/download`} className={`truncate ${linkInline}`}>
                    {f.fileName}
                  </a>
                  <span className="shrink-0 pl-2 font-mono text-xs tabular-nums text-[#5B6069]">
                    {formatBytes(f.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[#5B6069]">No files — the note is the delivery.</p>
          )}
        </CardBody>
      </Card>

      {inputFiles.length > 0 ? (
        <Card className="mb-4">
          <CardBody>
            <SectionLabel as="h2">What they worked from</SectionLabel>
            <ul className="mt-2 divide-y divide-[#14161A]/[0.06] text-sm">
              {inputFiles.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <a href={`/api/files/${f.id}/download`} className={`truncate ${linkInline}`}>
                    {f.fileName}
                  </a>
                  <span className="shrink-0 pl-2 font-mono text-xs tabular-nums text-[#5B6069]">
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
