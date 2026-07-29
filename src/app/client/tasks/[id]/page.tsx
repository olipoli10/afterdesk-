import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { taskForClient } from "@/lib/queries/tasks";
import { getSettings } from "@/lib/settings";
import { computeQuotedBy } from "@/lib/schedule";
import {
  clientStatusOf,
  clientBadgeClass,
  CLIENT_STATUS_LABELS,
} from "@/lib/status";
import { formatCents } from "@/lib/money";
import { deliverableFileLabel } from "@/lib/filenames";
import { LocalTime } from "@/components/local-time";
import { QuoteActions } from "@/components/quote-actions";
import { Badge, Card, CardBody, PageTitle, formatBytes } from "@/components/ui";

export default async function ClientTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("CLIENT");
  const { id } = await params;
  const task = await taskForClient(id, user.id);
  if (!task) notFound();

  const cs = clientStatusOf(task.status);
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title={task.title}
        action={<Badge className={clientBadgeClass(cs)}>{CLIENT_STATUS_LABELS[cs]}</Badge>}
      />

      {/* Status panel — honest expectations, computed from operator working hours. */}
      {cs === "being_priced" ? (
        <Card className="mb-4 border-amber-200 bg-amber-50/50">
          <CardBody>
            <p className="text-sm font-medium text-neutral-900">We&apos;re pricing your task.</p>
            <p className="mt-1 text-sm text-neutral-600">
              Expect your fixed quote by{" "}
              <span className="font-medium text-neutral-900">
                <LocalTime iso={computeQuotedBy(new Date(), settings)} />
              </span>
              . Quotes are prepared personally during our review hours — you&apos;ll see the
              price here and can approve or decline it.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {cs === "quote_ready" && task.clientPriceCents != null ? (
        <Card className="mb-4 border-blue-200">
          <CardBody>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Your fixed price
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
              {formatCents(task.clientPriceCents, task.currency)}
            </p>
            {task.quoteExpiresAt ? (
              <p className="mt-1 text-xs text-neutral-500">
                Valid until <LocalTime iso={task.quoteExpiresAt} />
              </p>
            ) : null}
            <div className="mt-4">
              <QuoteActions taskId={task.id} />
            </div>
          </CardBody>
        </Card>
      ) : null}

      {cs === "in_progress" ? (
        <Card className="mb-4 border-violet-200 bg-violet-50/40">
          <CardBody>
            <p className="text-sm font-medium text-neutral-900">Work is underway.</p>
            <p className="mt-1 text-sm text-neutral-600">
              {task.clientDeadlineUtc ? (
                <>
                  Delivery of the reviewed work is due by{" "}
                  <span className="font-medium text-neutral-900">
                    <LocalTime iso={task.clientDeadlineUtc} />
                  </span>
                  .
                </>
              ) : (
                <>Your deliverable will appear here once it passes our quality review.</>
              )}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {cs === "declined" ? (
        <Card className="mb-4">
          <CardBody>
            <p className="text-sm text-neutral-600">
              You declined this quote{task.declineReason ? <> — “{task.declineReason}”</> : null}.
              Submit a new task anytime.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardBody>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Task description
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
            {task.description}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-3 text-sm sm:grid-cols-3">
            {task.quantity ? (
              <div>
                <dt className="text-xs text-neutral-400">Volume</dt>
                <dd className="text-neutral-800">{task.quantity}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-neutral-400">Submitted</dt>
              <dd className="text-neutral-800">
                <LocalTime iso={task.createdAt} dateStyle="short" />
              </dd>
            </div>
            {task.clientDeadlineUtc ? (
              <div>
                <dt className="text-xs text-neutral-400">Your deadline</dt>
                <dd className="text-neutral-800">
                  <LocalTime iso={task.clientDeadlineUtc} dateStyle="short" />
                </dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      {task.submissions.length > 0 ? (
        <Card className="mb-4 border-emerald-200">
          <CardBody>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-label text-neutral-400">
              Your finished work
            </h2>
            <p className="mb-3 text-sm text-neutral-600">
              Reviewed and approved before it reached you.
            </p>
            <ul className="divide-y divide-neutral-100 text-sm">
              {task.submissions[0].files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  {/* RULE 1: never the worker's own filename — it can name them. */}
                  <a
                    href={`/api/files/${f.id}/download`}
                    className="truncate font-medium text-blue-700 hover:underline"
                  >
                    {deliverableFileLabel(f.fileName, task.id, f.id)}
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

      {task.files.length > 0 ? (
        <Card>
          <CardBody>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Your files
            </h2>
            <ul className="divide-y divide-neutral-100 text-sm">
              {task.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <a
                    href={`/api/files/${f.id}/download`}
                    className="truncate font-medium text-indigo-600 hover:underline"
                  >
                    {f.fileName}
                  </a>
                  <span className="shrink-0 text-xs text-neutral-400">
                    {formatBytes(f.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
