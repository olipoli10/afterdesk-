import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { tasksForClient, type ClientTaskView } from "@/lib/queries/tasks";
import {
  clientStatusOf,
  clientBadgeClass,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
} from "@/lib/status";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageTitle,
  SectionLabel,
  moneyClient,
} from "@/components/ui";

/**
 * Section titles in display order. Typed as Record<ClientStatus, string> so a
 * new client status can never be silently unlisted — the compiler forces an
 * entry here, and Object.keys preserves this insertion order.
 */
const SECTION_TITLES: Record<ClientStatus, string> = {
  quote_ready: "Action needed — your price is ready",
  awaiting_payment: "Awaiting your payment",
  being_priced: "Being priced",
  awaiting_routing: "Waiting to be scheduled",
  in_progress: "In progress",
  revision_in_progress: "Revision in progress",
  under_review: "Under review",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

const SECTION_ORDER = Object.keys(SECTION_TITLES) as ClientStatus[];

function TaskRow({ task }: { task: ClientTaskView }) {
  const cs = clientStatusOf(task.status, task.standingCapacityAccountId !== null);
  return (
    <Link
      href={`/client/tasks/${task.id}`}
      className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-[#14161A]/[0.02]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#14161A]">{task.title}</p>
        <p className="mt-0.5 text-xs text-[#5B6069]">
          Submitted <LocalTime iso={task.createdAt} dateStyle="short" />
          {task.clientDeadlineUtc ? (
            <>
              {" · "}Deadline <LocalTime iso={task.clientDeadlineUtc} dateStyle="short" />
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {(cs === "quote_ready" || cs === "awaiting_payment") &&
        task.clientPriceCents != null ? (
          <span className={`text-sm font-medium ${moneyClient}`}>
            {formatCents(task.clientPriceCents, task.currency)}
          </span>
        ) : null}
        <Badge className={clientBadgeClass(cs)}>{CLIENT_STATUS_LABELS[cs]}</Badge>
      </div>
    </Link>
  );
}

export default async function ClientDashboard() {
  const user = await requireRole("CLIENT");
  const tasks = await tasksForClient(user.id);

  if (tasks.length === 0) {
    return (
      <>
        <PageTitle title="My tasks" />
        <EmptyState
          title="No tasks yet"
          body="Describe what you need done — CRM cleanup, data entry, list research, prospecting — and attach the files it operates on. We review it, you get one fixed price to approve, and the work comes back quality-checked."
          action={<LinkButton href="/client/tasks/new">Submit your first task</LinkButton>}
        />
      </>
    );
  }

  const grouped = new Map<ClientStatus, ClientTaskView[]>();
  for (const t of tasks) {
    const cs = clientStatusOf(t.status, t.standingCapacityAccountId !== null);
    grouped.set(cs, [...(grouped.get(cs) ?? []), t]);
  }

  return (
    <>
      <PageTitle
        title="My tasks"
        action={<LinkButton href="/client/tasks/new">New task</LinkButton>}
      />
      <div className="space-y-6">
        {SECTION_ORDER.filter((key) => grouped.has(key)).map((key) => (
          <section key={key}>
            <SectionLabel as="h2" className="mb-2">
              {SECTION_TITLES[key]}
            </SectionLabel>
            <Card>
              <div className="divide-y divide-[#14161A]/[0.06]">
                {grouped.get(key)!.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
