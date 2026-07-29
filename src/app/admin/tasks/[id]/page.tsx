import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { taskForAdmin, taskEventsForAdmin } from "@/lib/queries/tasks";
import { ADMIN_STATUS_LABELS, statusBadgeClass, TERMINAL_STATUSES } from "@/lib/status";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { AdminCancel } from "@/components/admin-cancel";
import { Badge, Card, CardBody, PageTitle, formatBytes } from "@/components/ui";

export default async function AdminTaskDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const task = await taskForAdmin(id);
  if (!task) notFound();
  const events = await taskEventsForAdmin(id);
  const isTerminal = TERMINAL_STATUSES.includes(task.status);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title={task.title}
        sub={`${task.client.name} (${task.client.email})${task.claimedBy ? ` → VA: ${task.claimedBy.name}` : ""}`}
        action={
          <Badge className={statusBadgeClass(task.status)}>
            {ADMIN_STATUS_LABELS[task.status]}
          </Badge>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="!p-4">
            <p className="text-xs text-neutral-400">Client price</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {task.clientPriceCents != null ? formatCents(task.clientPriceCents, task.currency) : "—"}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="!p-4">
            <p className="text-xs text-neutral-400">VA payout</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {task.vaPayoutCents != null ? formatCents(task.vaPayoutCents, task.currency) : "—"}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="!p-4">
            <p className="text-xs text-neutral-400">Margin</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {task.clientPriceCents != null && task.vaPayoutCents != null
                ? formatCents(task.clientPriceCents - task.vaPayoutCents, task.currency)
                : "—"}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardBody>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Description
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
            {task.description}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-3 text-sm sm:grid-cols-4">
            {task.quantity ? (
              <div>
                <dt className="text-xs text-neutral-400">Volume</dt>
                <dd className="text-neutral-800">{task.quantity}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-neutral-400">Tier</dt>
              <dd className="text-neutral-800">{task.tier === "high_value" ? "High-value" : "Standard"}</dd>
            </div>
            {task.clientDeadlineUtc ? (
              <div>
                <dt className="text-xs text-neutral-400">Client deadline</dt>
                <dd className="text-neutral-800">
                  <LocalTime iso={task.clientDeadlineUtc} dateStyle="short" />
                </dd>
              </div>
            ) : null}
            {task.vaDeadlineUtc ? (
              <div>
                <dt className="text-xs text-neutral-400">VA deadline (−QC buffer)</dt>
                <dd className="text-neutral-800">
                  <LocalTime iso={task.vaDeadlineUtc} dateStyle="short" />
                </dd>
              </div>
            ) : null}
            {task.quoteExpiresAt ? (
              <div>
                <dt className="text-xs text-neutral-400">Quote valid until</dt>
                <dd className="text-neutral-800">
                  <LocalTime iso={task.quoteExpiresAt} dateStyle="short" />
                </dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      {task.files.length > 0 ? (
        <Card className="mb-4">
          <CardBody>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Files
            </h2>
            <ul className="divide-y divide-neutral-100 text-sm">
              {task.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-500">
                      {f.kind}
                    </span>
                    <a
                      href={`/api/files/${f.id}/download`}
                      className="truncate font-medium text-indigo-600 hover:underline"
                    >
                      {f.fileName}
                    </a>
                  </span>
                  <span className="shrink-0 pl-2 text-xs text-neutral-400">
                    {formatBytes(f.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardBody>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Audit log
          </h2>
          <ul className="space-y-1.5 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-neutral-600">
              <span className="text-xs tabular-nums text-neutral-400">
                <LocalTime iso={e.createdAt} dateStyle="short" />
              </span>
              <span className="font-mono text-xs text-neutral-500">{e.action}</span>
              {e.fromStatus || e.toStatus ? (
                <span className="text-xs text-neutral-500">
                  {e.fromStatus ?? "∅"} → {e.toStatus ?? "∅"}
                </span>
              ) : null}
              {e.reason ? <span className="text-xs italic text-neutral-400">“{e.reason}”</span> : null}
            </li>
          ))}
          </ul>
        </CardBody>
      </Card>

      {!isTerminal ? (
        <AdminCancel taskId={task.id} />
      ) : (
        <p className="text-xs text-neutral-400">
          Terminal state — no further transitions.
          {task.cancelReason ? ` Cancellation reason: “${task.cancelReason}”` : ""}
          {task.declineReason ? ` Client's decline reason: “${task.declineReason}”` : ""}
        </p>
      )}

      <p className="mt-6">
        <Link href="/admin/tasks" className="text-sm font-medium text-neutral-500 hover:text-neutral-900">
          ← All tasks
        </Link>
      </p>
    </div>
  );
}
