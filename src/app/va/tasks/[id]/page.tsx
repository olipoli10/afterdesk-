import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { taskForVa } from "@/lib/queries/tasks";
import { vaProfileFor } from "@/lib/queries/va-profile";
import { formatCents } from "@/lib/money";
import { inputFileLabel } from "@/lib/filenames";
import { LocalTime } from "@/components/local-time";
import { DeliverableForm } from "@/components/deliverable-form";
import { ReleaseButton } from "@/components/va-actions";
import { AskAdminQuestionForm } from "@/components/ask-admin-question-form";
import { AssistantWidget } from "@/components/assistant-widget";
import {
  Badge,
  Card,
  CardBody,
  PageTitle,
  SectionLabel,
  formatBytes,
  moneyPayoutNight,
} from "@/components/ui";

const metaLabel = "font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#8A9099]";

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

  // Strictly "claimed" — the assistant's own gate is narrower than
  // canDeliver below (see sendAssistantMessage's doc comment).
  const assistantHistoryRows =
    task.status === "claimed"
      ? await prisma.assistantMessage.findMany({
          where: { vaId: user.id, taskId: id },
          orderBy: { createdAt: "asc" },
          take: 20,
          select: { role: true, content: true, requiresHumanReview: true },
        })
      : [];

  const canDeliver =
    ["claimed", "qc_rejected"].includes(task.status) ||
    (task.status === "revision_requested" && Boolean(task.revisionInstructions));
  const awaitingReview = task.status === "submitted_for_qc";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle
        title={task.title}
        tone="night"
        action={
          <span className="text-right">
            <span className={`block text-lg font-medium ${moneyPayoutNight}`}>
              {task.vaPayoutCents != null ? formatCents(task.vaPayoutCents, task.currency) : "—"}
            </span>
            <span className={metaLabel}>Your payout</span>
          </span>
        }
      />

      {awaitingReview ? (
        <Card tone="night">
          <CardBody>
            <p className="text-sm font-medium text-[#F7F6F3]">Sent for review.</p>
            <p className="mt-1 text-sm leading-relaxed text-[#8A9099]">
              The operator reviews every delivery before it reaches the client. You&apos;ll see
              the outcome here.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {task.status === "qc_rejected" ? (
        <Card tone="night">
          <CardBody>
            <p className="text-sm font-medium text-[#E8A854]">Changes needed</p>
            {lastReview?.qcStatus === "rejected" && lastReview.qcComment ? (
              <>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#F7F6F3]">
                  {lastReview.qcComment}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[#8A9099]">
                  Round{" "}
                  <span className="font-mono tabular-nums">{lastReview.attemptNo}</span> of{" "}
                  <span className="font-mono tabular-nums">{settings.maxQcRounds}</span>. After{" "}
                  <span className="font-mono tabular-nums">{settings.maxQcRounds}</span>, the task
                  goes back to the pool for someone else.
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm leading-relaxed text-[#8A9099]">
                The operator is writing up what to change — it will appear here.
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {task.status === "revision_requested" ? (
        <Card tone="night">
          <CardBody>
            <p className="text-sm font-medium text-[#E8A854]">Revision requested</p>
            <p className="mt-1 text-sm leading-relaxed text-[#8A9099]">
              The client asked for changes after delivery.
            </p>
            {task.revisionInstructions ? (
              <>
                <SectionLabel className="mt-3" tone="night">Operator&apos;s note</SectionLabel>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#F7F6F3]">
                  {task.revisionInstructions}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-[#8A9099]">
                The operator is writing up what to change — it will appear here.
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card tone="night">
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {task.category ? (
              <Badge className="border-white/15 bg-transparent text-[#8A9099]">
                {task.category.name}
              </Badge>
            ) : null}
            {task.tier === "high_value" ? (
              <Badge className="border-[#1B2740] bg-[#1B2740]/60 text-[#C9CDD3]">
                High-value
              </Badge>
            ) : null}
          </div>
          <SectionLabel tone="night">What to do</SectionLabel>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#F7F6F3]">
            {task.description}
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/[0.08] pt-3 text-sm">
            <div>
              <dt className={metaLabel}>Your deadline</dt>
              <dd className="mt-0.5 text-[#F7F6F3]">
                {task.vaDeadlineUtc ? <LocalTime iso={task.vaDeadlineUtc} /> : "No fixed deadline"}
              </dd>
            </div>
            {task.quantity ? (
              <div>
                <dt className={metaLabel}>Volume</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-[#F7F6F3]">{task.quantity}</dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      {task.category?.disputeCriteria ? (
        <Card tone="night">
          <CardBody>
            <SectionLabel tone="night">What counts as done</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#8A9099]">
              {task.category.disputeCriteria}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {task.files.length > 0 ? (
        <Card tone="night">
          <CardBody>
            <SectionLabel tone="night">Files to work from</SectionLabel>
            <ul className="mt-2 divide-y divide-white/[0.06] text-sm">
              {task.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2.5">
                  {/* RULE 1: never the client's own filename — it can name them. */}
                  <a
                    href={`/api/files/${f.id}/download`}
                    className="truncate font-mono text-[13px] font-medium text-[#F7F6F3] underline decoration-white/30 underline-offset-2 transition-colors duration-150 hover:decoration-white"
                  >
                    {inputFileLabel(f.fileName, task.id, f.id)}
                  </a>
                  <span className="shrink-0 pl-2 font-mono text-xs tabular-nums text-[#8A9099]">
                    {formatBytes(f.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-[#8A9099]">
              Your access to these ends when the task leaves your hands.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {canDeliver ? (
        <DeliverableForm
          taskId={task.id}
          categorySlug={task.category?.slug ?? null}
          maxFileSizeMB={settings.maxFileSizeMB}
          maxFiles={settings.maxFilesPerTask}
          allowedExtensions={settings.allowedExtensions}
          isResubmission={task.status !== "claimed"}
        />
      ) : null}

      {task.status === "claimed" ? (
        <AssistantWidget taskId={task.id} initialHistory={assistantHistoryRows} />
      ) : null}

      {canDeliver ? <AskAdminQuestionForm taskId={task.id} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Link
          href="/va"
          className="-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#8A9099] transition-colors duration-150 hover:text-[#F7F6F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]"
        >
          ← My work
        </Link>
        {task.status === "claimed" ? <ReleaseButton taskId={task.id} /> : null}
      </div>
    </div>
  );
}
