import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { taskForAdmin } from "@/lib/queries/tasks";
import { formatMetricsForClient, qcChecks } from "@/lib/delivery-metrics";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { QcForm } from "@/components/qc-form";
import { WorkSessionTimer } from "@/components/work-session-timer";
import { openSessionFor } from "@/server/work-sessions";
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
  const qcAdmin = await requireRole("ADMIN");
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
        deliveryMetrics: true,
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
  // Same formatter the client sees, so the reviewer is shown exactly the rows
  // approving will publish. A blob that fails to parse yields null and the
  // card is simply absent, which is also what the client would get.
  const metricRows = formatMetricsForClient(submission.deliveryMetrics);
  const metricChecks = qcChecks(submission.deliveryMetrics);

  const reviewerSession = await openSessionFor(task.id, qcAdmin.id, "reviewer");

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

      {/* The numbers the worker is claiming, read BEFORE the decision. Approving
          releases these to the client verbatim, so a reviewer who never saw
          them would be certifying an assertion they did not check. `checks`
          are derived here and never leave this page. */}
      {metricRows ? (
        <Card className="mb-4">
          <CardBody>
            <SectionLabel as="h2">The numbers they are claiming</SectionLabel>
            <p className="mt-1 text-xs text-[#5B6069]">
              Shown to the client once you approve. Check them against the files first.
              {task.quantity ? (
                <>
                  {" "}
                  The brief asked for{" "}
                  <span className="font-mono text-[#14161A]">{task.quantity}</span>.
                </>
              ) : null}
            </p>
            <dl className="mt-3 divide-y divide-[#14161A]/[0.06] text-sm">
              {metricRows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-[#5B6069]">{r.label}</dt>
                  <dd className="shrink-0 font-mono tabular-nums text-[#14161A]">{r.value}</dd>
                </div>
              ))}
            </dl>
            {metricChecks.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-[#14161A]/[0.06] pt-3 text-xs leading-relaxed">
                {metricChecks.map((c) => (
                  <li key={c.label} className={c.tone === "flag" ? "text-[#8C2F23]" : "text-[#5B6069]"}>
                    {c.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

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

      {/* Phase 1C — the reviewer's timer. The reviewer IS the admin today;
          the session records role "reviewer", phase "qc", and closes
          automatically with the decision. */}
      <div className="mb-4">
        <WorkSessionTimer
          taskId={task.id}
          scope="reviewer"
          initialSession={
            reviewerSession
              ? {
                  id: reviewerSession.id,
                  status: reviewerSession.status as "active" | "paused",
                  accumulatedSeconds: reviewerSession.accumulatedSeconds,
                  lastResumedAt: reviewerSession.lastResumedAt?.toISOString() ?? null,
                }
              : null
          }
        />
      </div>

      <QcForm
        submissionId={submission.id}
        qcRound={task.qcRounds}
        maxQcRounds={settings.maxQcRounds}
      />
    </div>
  );
}
