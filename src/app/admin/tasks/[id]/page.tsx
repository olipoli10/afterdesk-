import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { taskForAdmin, taskEventsForAdmin } from "@/lib/queries/tasks";
import { ADMIN_STATUS_LABELS, statusBadgeClass, TERMINAL_STATUSES } from "@/lib/status";
import { isAllowedTransition } from "@/lib/state";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { AdminCancel, AdminReturnToPool } from "@/components/admin-cancel";
import {
  Badge,
  Card,
  CardBody,
  PageTitle,
  SectionLabel,
  formatBytes,
  linkInline,
  moneyClient,
  moneyPayout,
} from "@/components/ui";

/** States where the task sits in a worker's hands and can be re-pooled. */
const REASSIGNABLE = ["claimed", "submitted_for_qc", "qc_rejected", "revision_requested"];

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
  const canReassign = REASSIGNABLE.includes(task.status) && task.claimedBy != null;
  // `completed` is non-terminal (dispute window) but cannot be cancelled —
  // never show a button that can only fail.
  const canCancel = isAllowedTransition(task.status, "cancelled");

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title={task.title}
        sub={`${task.client.name} (${task.client.email})${task.claimedBy ? ` → Worker: ${task.claimedBy.name}` : ""}`}
        action={
          <Badge className={statusBadgeClass(task.status)}>
            {ADMIN_STATUS_LABELS[task.status]}
          </Badge>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="!p-4">
            <SectionLabel>Client price</SectionLabel>
            <p className={`mt-1 text-lg font-medium ${moneyClient}`}>
              {task.clientPriceCents != null ? formatCents(task.clientPriceCents, task.currency) : "—"}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="!p-4">
            <SectionLabel>Worker payout</SectionLabel>
            <p className={`mt-1 text-lg font-medium ${moneyPayout}`}>
              {task.vaPayoutCents != null ? formatCents(task.vaPayoutCents, task.currency) : "—"}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="!p-4">
            <SectionLabel>Margin</SectionLabel>
            <p className={`mt-1 text-lg font-medium ${moneyClient}`}>
              {task.clientPriceCents != null && task.vaPayoutCents != null
                ? formatCents(task.clientPriceCents - task.vaPayoutCents, task.currency)
                : "—"}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardBody>
          <SectionLabel as="h2" className="mb-2">
            Description
          </SectionLabel>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#14161A]">
            {task.description}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#14161A]/[0.06] pt-3 text-sm sm:grid-cols-4">
            {task.quantity ? (
              <div>
                <dt className="text-xs text-[#5B6069]">Volume</dt>
                <dd className="text-[#14161A]">{task.quantity}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-[#5B6069]">Tier</dt>
              <dd className="text-[#14161A]">{task.tier === "high_value" ? "High-value" : "Standard"}</dd>
            </div>
            {task.clientDeadlineUtc ? (
              <div>
                <dt className="text-xs text-[#5B6069]">Client deadline</dt>
                <dd className="text-[#14161A]">
                  <LocalTime iso={task.clientDeadlineUtc} dateStyle="short" />
                </dd>
              </div>
            ) : null}
            {task.vaDeadlineUtc ? (
              <div>
                <dt className="text-xs text-[#5B6069]">Worker deadline (−QC buffer)</dt>
                <dd className="text-[#14161A]">
                  <LocalTime iso={task.vaDeadlineUtc} dateStyle="short" />
                </dd>
              </div>
            ) : null}
            {task.quoteExpiresAt ? (
              <div>
                <dt className="text-xs text-[#5B6069]">Quote valid until</dt>
                <dd className="text-[#14161A]">
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
            <SectionLabel as="h2" className="mb-2">
              Files
            </SectionLabel>
            <ul className="divide-y divide-[#14161A]/[0.06] text-sm">
              {task.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded-[3px] bg-[#14161A]/[0.04] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-[#5B6069]">
                      {f.kind}
                    </span>
                    <a href={`/api/files/${f.id}/download`} className={`truncate ${linkInline}`}>
                      {f.fileName}
                    </a>
                  </span>
                  <span className="shrink-0 pl-2 font-mono text-xs tabular-nums text-[#5B6069]">
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
          <SectionLabel as="h2" className="mb-2">
            Audit log
          </SectionLabel>
          <ul className="space-y-1.5 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-[#5B6069]">
              <span className="text-xs tabular-nums">
                <LocalTime iso={e.createdAt} dateStyle="short" />
              </span>
              <span className="font-mono text-xs text-[#14161A]">{e.action}</span>
              {e.fromStatus || e.toStatus ? (
                <span className="font-mono text-xs text-[#5B6069]">
                  {e.fromStatus ?? "∅"} → {e.toStatus ?? "∅"}
                </span>
              ) : null}
              {e.reason ? <span className="text-xs italic text-[#5B6069]">“{e.reason}”</span> : null}
            </li>
          ))}
          </ul>
        </CardBody>
      </Card>

      {canReassign || canCancel ? (
        <div className="space-y-4">
          {canReassign ? <AdminReturnToPool taskId={task.id} /> : null}
          {canCancel ? <AdminCancel taskId={task.id} /> : null}
        </div>
      ) : !isTerminal ? null : (
        <p className="text-xs text-[#5B6069]">
          Terminal state — no further transitions.
          {task.cancelReason ? ` Cancellation reason: “${task.cancelReason}”` : ""}
          {task.declineReason ? ` Client's decline reason: “${task.declineReason}”` : ""}
        </p>
      )}

      <p className="mt-6">
        <Link
          href="/admin/tasks"
          className="text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
        >
          ← All tasks
        </Link>
      </p>
    </div>
  );
}
