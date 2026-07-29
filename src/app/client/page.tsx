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
import { Badge, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";

const SECTION_ORDER: { key: ClientStatus; title: string }[] = [
  { key: "quote_ready", title: "Action needed — your price is ready" },
  { key: "being_priced", title: "Being priced" },
  { key: "in_progress", title: "In progress" },
  { key: "revision_in_progress", title: "Revision in progress" },
  { key: "completed", title: "Completed" },
  { key: "declined", title: "Declined" },
  { key: "expired", title: "Expired" },
  { key: "cancelled", title: "Cancelled" },
];

function TaskRow({ task }: { task: ClientTaskView }) {
  const cs = clientStatusOf(task.status);
  return (
    <Link
      href={`/client/tasks/${task.id}`}
      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900">{task.title}</p>
        <p className="mt-0.5 text-xs text-neutral-400">
          Submitted <LocalTime iso={task.createdAt} dateStyle="short" />
          {task.clientDeadlineUtc ? (
            <>
              {" · "}Deadline <LocalTime iso={task.clientDeadlineUtc} dateStyle="short" />
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {cs === "quote_ready" && task.clientPriceCents != null ? (
          <span className="text-sm font-semibold text-neutral-900">
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
    const cs = clientStatusOf(t.status);
    grouped.set(cs, [...(grouped.get(cs) ?? []), t]);
  }

  return (
    <>
      <PageTitle
        title="My tasks"
        action={<LinkButton href="/client/tasks/new">New task</LinkButton>}
      />
      <div className="space-y-6">
        {SECTION_ORDER.filter((s) => grouped.has(s.key)).map((section) => (
          <section key={section.key}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              {section.title}
            </h2>
            <Card>
              <div className="divide-y divide-neutral-100">
                {grouped.get(section.key)!.map((t) => (
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
