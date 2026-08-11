import Link from "next/link";
import { notFound } from "next/navigation";
import type { FileScanStatus } from "@prisma/client";
import { requireRole } from "@/lib/authz";
import { taskForAdmin, taskEventsForAdmin } from "@/lib/queries/tasks";
import { ADMIN_STATUS_LABELS, statusBadgeClass, TERMINAL_STATUSES } from "@/lib/status";
import { isAllowedTransition } from "@/lib/state";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { EstimatedVsActual } from "@/components/estimated-vs-actual";
import { operationalComparisonForAdmin } from "@/lib/queries/operational-intelligence";
import { AdminCancel, AdminReleaseToPool, AdminReturnToPool } from "@/components/admin-cancel";
import {
  ManualPaymentForm,
  ManualRefundForm,
  PayoutForm,
} from "@/components/admin-money-actions";
import { RecheckFileButton } from "@/components/admin-file-actions";
import { ExecutionPanel } from "@/components/execution-panel";
import { executionForAdmin } from "@/lib/queries/execution";
import {
  DisputeDecisionForm,
  RevisionInstructionsForm,
} from "@/components/admin-resolution-actions";
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

/** File-scan badge tone — green is reserved for a genuinely clean scan; a
 *  rejected or errored recheck must never read as passed. */
function scanStatusClass(status: FileScanStatus): string {
  switch (status) {
    case "clean":
      return "bg-[#1E7F5C]/10 text-[#166049]";
    case "pending":
      return "bg-[#14161A]/[0.04] text-[#5B6069]";
    case "rejected":
    case "error":
      return "bg-[#A23B2E]/10 text-[#8C2F23]";
    default: {
      const unreachable: never = status;
      throw new Error(`Unhandled file scan status: ${unreachable}`);
    }
  }
}

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
  // Null for every task quoted without an executable plan, which is most of
  // them: the panel simply does not render.
  const execution = await executionForAdmin(id);
  const operational = await operationalComparisonForAdmin(id);
  const isTerminal = TERMINAL_STATUSES.includes(task.status);
  const canReassign = REASSIGNABLE.includes(task.status) && task.claimedBy != null;
  // `completed` is non-terminal (dispute window) but cannot be cancelled —
  // never show a button that can only fail.
  const canCancel = isAllowedTransition(task.status, "cancelled");
  // LOT B: the release button renders only in the one state where it can
  // succeed — an ai_processing task whose automated run is paused.
  const runPaused = task.status === "ai_processing" && execution?.status === "paused";

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
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded-[3px] bg-[#14161A]/[0.04] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-[#5B6069]">
                      {f.kind}
                    </span>
                    <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase ${scanStatusClass(f.scanStatus)}`}>
                      {f.scanStatus}
                    </span>
                    <a href={`/api/files/${f.id}/download`} className={`truncate ${linkInline}`}>
                      {f.fileName}
                    </a>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs tabular-nums text-[#5B6069]">
                      {formatBytes(f.sizeBytes)}
                    </span>
                    {f.scanStatus !== "clean" ? <RecheckFileButton fileId={f.id} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <EstimatedVsActual data={operational} />

      {execution ? (
        <div className="mb-4">
          <ExecutionPanel run={execution} />
        </div>
      ) : null}

      <Card className="mb-4">
        <CardBody>
          <SectionLabel as="h2" className="mb-2">
            Client payment
          </SectionLabel>
          {task.payments.length > 0 ? (
            <ul className="mb-3 space-y-1 text-sm text-[#5B6069]">
              {task.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="space-y-1 border-b border-black/5 pb-2 last:border-0"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>
                      {payment.provider ?? payment.method} · {payment.status}
                      {payment.providerRef ? ` · ${payment.providerRef}` : ""}
                    </span>
                    <span className={moneyClient}>
                      {formatCents(payment.amountCents, task.currency)}
                    </span>
                  </div>
                  {payment.refunds.map((refund) => (
                    <p key={refund.id} className="text-xs text-[#8C2F23]">
                      Refund · {formatCents(refund.amountCents, task.currency)}
                      {refund.providerRef ? ` · ${refund.providerRef}` : ""}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-[#5B6069]">No payment recorded.</p>
          )}
          {task.status === "awaiting_payment" ? (
            <ManualPaymentForm taskId={task.id} />
          ) : null}
          {task.moneyIntents
            .filter(
              (intent) =>
                intent.kind === "refund_client" &&
                ["queued", "failed"].includes(intent.status)
            )
            .map((intent) => (
              <div
                key={intent.id}
                className="mt-4 rounded-md border border-[#D98324]/40 bg-[#D98324]/5 p-3"
              >
                <p className="mb-2 text-sm text-[#14161A]">
                  Refund due: {formatCents(intent.amountCents, intent.currency)}
                </p>
                {intent.lastError ? (
                  <p className="mb-2 text-xs text-[#8C2F23]">{intent.lastError}</p>
                ) : null}
                {task.payments.some((payment) => payment.provider === "manual") ? (
                  <ManualRefundForm intentId={intent.id} />
                ) : (
                  <p className="text-xs text-[#5B6069]">
                    Stripe refund is queued for the maintenance worker.
                  </p>
                )}
              </div>
            ))}
        </CardBody>
      </Card>

      {task.payouts.length > 0 ? (
        <Card className="mb-4">
          <CardBody>
            <SectionLabel as="h2" className="mb-2">
              Worker payout
            </SectionLabel>
            <div className="space-y-4">
              {task.payouts.map((payout) => (
                <div key={payout.id} className="space-y-2">
                  <p className="flex flex-wrap justify-between gap-2 text-sm text-[#5B6069]">
                    <span>
                      {payout.status}
                      {payout.reference ? ` · ${payout.reference}` : ""}
                    </span>
                    <span className={moneyPayout}>
                      {formatCents(payout.amountCents, payout.currency)}
                    </span>
                  </p>
                  {payout.status === "owed" || payout.status === "released" ? (
                    <PayoutForm payoutId={payout.id} />
                  ) : null}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {task.status === "revision_requested" && !task.revisionInstructions ? (
        <Card className="mb-4 border-[#D98324]/50">
          <CardBody>
            <SectionLabel as="h2" className="mb-2">
              Revision awaiting your summary
            </SectionLabel>
            <RevisionInstructionsForm taskId={task.id} />
          </CardBody>
        </Card>
      ) : null}

      {task.disputes.some((dispute) => dispute.outcome === "pending") ? (
        <Card className="mb-4 border-[#A82318]/40">
          <CardBody>
            <SectionLabel as="h2" className="mb-2">
              Open dispute
            </SectionLabel>
            {task.disputes
              .filter((dispute) => dispute.outcome === "pending")
              .map((dispute) => (
                <div key={dispute.id} className="space-y-3">
                  <p className="font-mono text-xs uppercase text-[#8C2F23]">
                    {dispute.reasonCode.replaceAll("_", " ")}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-[#14161A]">
                    {dispute.reasonDetail}
                  </p>
                  <DisputeDecisionForm disputeId={dispute.id} />
                </div>
              ))}
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

      {canReassign || canCancel || runPaused ? (
        <div className="space-y-4">
          {/* LOT B: a paused run no longer waits for the stall sweep. */}
          {runPaused ? <AdminReleaseToPool taskId={task.id} /> : null}
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
