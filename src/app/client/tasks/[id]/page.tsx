import { notFound } from "next/navigation";
import type { PaymentStatus } from "@prisma/client";
import { requireRole } from "@/lib/authz";
import {
  taskForClient,
  executionReportForClient,
  latestPaymentStatusForClient,
} from "@/lib/queries/tasks";
import { expireStaleQuotes } from "@/server/sweeps";
import { quotedScopeForClient } from "@/lib/queries/plan";
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
import { PaymentActions } from "@/components/payment-actions";
import { ClientResolutionActions } from "@/components/client-resolution-actions";
import { ExecutionReportCard } from "@/components/execution-report";
import {
  Badge,
  Card,
  CardBody,
  LinkButton,
  PageTitle,
  SectionLabel,
  formatBytes,
  linkInline,
  moneyClient,
} from "@/components/ui";

/**
 * The 48h capture window and the 72h dispute window are misaligned, so a
 * dispute can still land on a task whose payment was already captured. A
 * task cancelled from that state was charged and then refunded, not "never
 * charged" — this picks the sentence that matches what actually happened to
 * the money instead of assuming the payment was still just a hold.
 */
function cancelledPaymentNote(status: PaymentStatus | null): string {
  switch (status) {
    case "authorized":
      return "Your card was authorized but never charged.";
    case "received":
    case "partially_refunded":
    case "refunded":
    case "chargeback":
      return "Your payment was refunded.";
    case "pending":
    case "cancelled":
    case null:
      return "You were not charged.";
    default: {
      const unreachable: never = status;
      throw new Error(`Unhandled payment status: ${unreachable}`);
    }
  }
}

export default async function ClientTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("CLIENT");
  const { id } = await params;
  await expireStaleQuotes(id);
  const task = await taskForClient(id, user.id);
  if (!task) notFound();

  const cs = clientStatusOf(task.status, task.standingCapacityAccountId !== null);
  const settings = await getSettings();
  // Ownership is re-checked inside the query rather than trusted from the read
  // above, so this stays safe if it is ever reused on another page.
  const report = await executionReportForClient(id, user.id);
  const cancelledPaymentStatus =
    cs === "cancelled" ? await latestPaymentStatusForClient(id, user.id) : null;
  // The scope the quote is based on — a sanitized allowlist projection of
  // the admin-approved plan version, never the plan itself. Null for a task
  // quoted without the work engine; the card renders exactly as before.
  const quotedScope = cs === "quote_ready" ? await quotedScopeForClient(id, user.id) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title={task.title}
        action={<Badge className={clientBadgeClass(cs)}>{CLIENT_STATUS_LABELS[cs]}</Badge>}
      />

      {/* Status panel — honest expectations, computed from operator working hours. */}
      {cs === "being_priced" ? (
        <Card className="mb-4">
          <CardBody>
            <p className="text-sm font-medium text-[#14161A]">We&apos;re pricing your task.</p>
            <p className="mt-1 text-sm text-[#5B6069]">
              Expect your fixed price by{" "}
              <LocalTime iso={computeQuotedBy(new Date(), settings)} />. Prices are prepared
              personally during our review hours — you&apos;ll see the number here and can
              approve or decline it.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {/*
        A standing task is never quoted: its cost was minutes already drawn
        from the weekly block at submission, and approvePricing refuses to
        price one. It used to land in the card above and promise a fixed price
        that was never coming.
      */}
      {cs === "awaiting_routing" ? (
        <Card className="mb-4">
          <CardBody>
            <p className="text-sm font-medium text-[#14161A]">This is queued on your weekly block.</p>
            <p className="mt-1 text-sm text-[#5B6069]">
              It draws on the capacity you already hold, so there is no separate price to
              approve. We will schedule it and you will see it move here.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {cs === "quote_ready" && task.clientPriceCents != null ? (
        <Card className="mb-4 border-[#14161A]/20">
          <CardBody>
            <SectionLabel>Your fixed price</SectionLabel>
            <p className={`mt-1 text-2xl font-medium ${moneyClient}`}>
              {formatCents(task.clientPriceCents, task.currency)}
            </p>
            {task.quoteExpiresAt ? (
              <p className="mt-1 text-xs text-[#5B6069]">
                Valid until <LocalTime iso={task.quoteExpiresAt} />
              </p>
            ) : null}

            {/* What this price covers — from the operator-approved plan,
                projected through an allowlist and sanitized. Accepting the
                quote freezes exactly this into the acceptance record. */}
            {quotedScope ? (
              <div className="mt-4 rounded-[4px] bg-[#14161A]/[0.02] px-3 py-2.5">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                  What this price covers
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-[#14161A]">
                  {quotedScope.deliverable}
                </p>
                {quotedScope.assumptions.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-[#5B6069]">Working assumptions</p>
                    <ul className="mt-0.5 list-disc pl-4 text-sm leading-relaxed text-[#14161A]">
                      {quotedScope.assumptions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {quotedScope.exclusions.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-[#5B6069]">Not included</p>
                    <ul className="mt-0.5 list-disc pl-4 text-sm leading-relaxed text-[#14161A]">
                      {quotedScope.exclusions.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="mt-2 border-t border-[#14161A]/[0.06] pt-2 text-xs leading-relaxed text-[#5B6069]">
                  Includes review before delivery, and up to {settings.maxRevisionRounds}{" "}
                  correction {settings.maxRevisionRounds === 1 ? "round" : "rounds"} within{" "}
                  {settings.revisionWindowHours} hours if the delivery misses the accepted brief.
                  Anything we cannot find is marked unavailable, never invented.
                </p>
              </div>
            ) : null}

            <div className="mt-4">
              <QuoteActions taskId={task.id} />
            </div>
          </CardBody>
        </Card>
      ) : null}

      {cs === "awaiting_payment" && task.clientPriceCents != null ? (
        <Card className="mb-4 border-[#14161A]/20">
          <CardBody>
            <p className="text-sm font-medium text-[#14161A]">
              Payment is the next step.
            </p>
            <p className="mt-1 text-sm text-[#5B6069]">
              You approved{" "}
              <span className={moneyClient}>
                {formatCents(task.clientPriceCents, task.currency)}
              </span>
              . Work starts once your card is authorized, and nothing is
              actually charged until your dispute window closes.
            </p>
            <PaymentActions taskId={task.id} />
          </CardBody>
        </Card>
      ) : null}

      {cs === "in_progress" ? (
        <Card className="mb-4 border-[#1B2740]/30">
          <CardBody>
            <p className="text-sm font-medium text-[#14161A]">Work is underway.</p>
            <p className="mt-1 text-sm text-[#5B6069]">
              {task.clientDeadlineUtc ? (
                <>
                  Delivery of the reviewed work is due by{" "}
                  <LocalTime iso={task.clientDeadlineUtc} />.
                </>
              ) : (
                <>Your deliverable will appear here once it passes our quality review.</>
              )}
            </p>
            {task.clientPriceCents != null ? (
              <p className="mt-1 text-sm text-[#5B6069]">
                Approved price:{" "}
                <span className={moneyClient}>
                  {formatCents(task.clientPriceCents, task.currency)}
                </span>
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {cs === "revision_in_progress" ? (
        <Card className="mb-4 border-[#1B2740]/30">
          <CardBody>
            <p className="text-sm font-medium text-[#14161A]">
              The revision is being worked on.
            </p>
            <p className="mt-1 text-sm text-[#5B6069]">
              The updated delivery will appear here once it passes our quality review.
            </p>
            {task.clientPriceCents != null ? (
              <p className="mt-1 text-sm text-[#5B6069]">
                Approved price:{" "}
                <span className={moneyClient}>
                  {formatCents(task.clientPriceCents, task.currency)}
                </span>
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {cs === "under_review" ? (
        <Card className="mb-4 border-[#D98324]/50">
          <CardBody>
            <p className="text-sm font-medium text-[#14161A]">
              We&apos;re reviewing this delivery.
            </p>
            <p className="mt-1 text-sm text-[#5B6069]">
              The operator is re-checking the work against your description. You&apos;ll see
              the outcome here.
            </p>
            {task.clientPriceCents != null ? (
              <p className="mt-1 text-sm text-[#5B6069]">
                Approved price:{" "}
                <span className={moneyClient}>
                  {formatCents(task.clientPriceCents, task.currency)}
                </span>
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {cs === "declined" ? (
        <Card className="mb-4">
          <CardBody>
            <p className="text-sm text-[#5B6069]">
              You declined this price
              {task.declineReason ? <> — &ldquo;{task.declineReason}&rdquo;</> : null}. Every
              submission is priced fresh, so you can send the same task again anytime.
            </p>
            <div className="mt-3">
              <LinkButton href="/client/tasks/new" variant="secondary">
                Submit it again
              </LinkButton>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {cs === "expired" ? (
        <Card className="mb-4">
          <CardBody>
            <p className="text-sm text-[#5B6069]">
              This price lapsed
              {task.expiredAt ?? task.quoteExpiresAt ? (
                <>
                  {" "}
                  on <LocalTime iso={(task.expiredAt ?? task.quoteExpiresAt)!} />
                </>
              ) : null}
              . Prices are calculated fresh each time — submit the task again and we&apos;ll
              re-price it.
            </p>
            <div className="mt-3">
              <LinkButton href="/client/tasks/new" variant="secondary">
                Submit it again
              </LinkButton>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {cs === "cancelled" ? (
        <Card className="mb-4">
          <CardBody>
            <p className="text-sm text-[#5B6069]">
              We cancelled this task
              {task.cancelledAt ? (
                <>
                  {" "}
                  on <LocalTime iso={task.cancelledAt} dateStyle="short" />
                </>
              ) : null}
              . {cancelledPaymentNote(cancelledPaymentStatus)} If you still need it done, submit
              it again.
            </p>
            <div className="mt-3">
              <LinkButton href="/client/tasks/new" variant="secondary">
                Submit a new task
              </LinkButton>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardBody>
          <SectionLabel as="h2" className="mb-2">
            Task description
          </SectionLabel>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#14161A]">
            {task.description}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#14161A]/[0.06] pt-3 text-sm sm:grid-cols-3">
            {task.quantity ? (
              <div>
                <dt className="text-xs text-[#5B6069]">Volume</dt>
                <dd className="text-[#14161A]">{task.quantity}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-[#5B6069]">Submitted</dt>
              <dd className="text-[#14161A]">
                <LocalTime iso={task.createdAt} dateStyle="short" />
              </dd>
            </div>
            {task.clientDeadlineUtc ? (
              <div>
                <dt className="text-xs text-[#5B6069]">Your deadline</dt>
                <dd className="text-[#14161A]">
                  <LocalTime iso={task.clientDeadlineUtc} dateStyle="short" />
                </dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      {task.submissions.length > 0 ? (
        <Card className="mb-4 border-[#1E7F5C]/40">
          <CardBody>
            <SectionLabel as="h2" className="mb-2">
              Your finished work
            </SectionLabel>
            <p className="mb-3 text-sm text-[#5B6069]">
              Reviewed and approved before it reached you.
            </p>
            <ul className="divide-y divide-[#14161A]/[0.06] text-sm">
              {task.submissions[0].files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  {/* RULE 1: never the worker's own filename — it can name them. */}
                  <a href={`/api/files/${f.id}/download`} className={`truncate ${linkInline}`}>
                    {deliverableFileLabel(f.fileName, task.id, f.id)}
                  </a>
                  <span className="shrink-0 pl-2 font-mono text-xs tabular-nums text-[#5B6069]">
                    {formatBytes(f.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-[#14161A]/[0.06] pt-3 font-mono text-xs text-[#5B6069]">
              Something not right? Use the review controls below. Your note goes to the
              operator and never directly to the specialist.
            </p>
            {task.status === "completed" &&
            task.revisionWindowEndsAt &&
            task.revisionWindowEndsAt > new Date() ? (
              <ClientResolutionActions
                taskId={task.id}
                revisionsLeft={Math.max(
                  0,
                  settings.maxRevisionRounds - task.revisionRounds
                )}
              />
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {report ? <ExecutionReportCard report={report} /> : null}

      {task.files.length > 0 ? (
        <Card>
          <CardBody>
            <SectionLabel as="h2" className="mb-2">
              Your files
            </SectionLabel>
            <ul className="divide-y divide-[#14161A]/[0.06] text-sm">
              {task.files.map((f) => (
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
    </div>
  );
}
