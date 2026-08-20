import Link from "next/link";
import { headers } from "next/headers";
import { requireRole } from "@/lib/authz";
import { tasksForClient, type ClientTaskView } from "@/lib/queries/tasks";
import {
  clientStatusOf,
  clientBadgeClass,
  type ClientStatus,
} from "@/lib/status";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { A2PortalPresence } from "@/components/a2-portal-presence";
import { Badge, Card, moneyClient } from "@/components/ui";
import {
  CLIENT_PORTAL_I18N,
  clientPortalLangOf,
} from "@/lib/i18n/client-portal";

const SECTION_ORDER: ClientStatus[] = [
  "quote_ready",
  "awaiting_payment",
  "being_priced",
  "awaiting_routing",
  "in_progress",
  "revision_in_progress",
  "under_review",
  "completed",
  "declined",
  "expired",
  "cancelled",
];

type DashboardCopy = (typeof CLIENT_PORTAL_I18N)["en"]["dashboard"];

function TaskRow({ task, copy }: { task: ClientTaskView; copy: DashboardCopy }) {
  const cs = clientStatusOf(task.status, task.standingCapacityAccountId !== null);
  return (
    <Link
      href={`/client/tasks/${task.id}`}
      className="flex min-h-16 flex-col items-start justify-between gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-[#14161A]/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D87526] sm:flex-row sm:items-center"
    >
      <div className="min-w-0">
        <p className="line-clamp-2 text-[15px] font-medium text-[#14161A] sm:truncate">
          {task.title}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#5B6069]">
          {copy.submitted} <LocalTime iso={task.createdAt} dateStyle="short" />
          {task.clientDeadlineUtc ? (
            <>
              {" · "}{copy.deadline} <LocalTime iso={task.clientDeadlineUtc} dateStyle="short" />
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
        <Badge className={clientBadgeClass(cs)}>{copy.statusLabels[cs]}</Badge>
      </div>
    </Link>
  );
}

export default async function ClientDashboard() {
  const user = await requireRole("CLIENT");
  const lang = clientPortalLangOf((await headers()).get("x-site-lang"));
  const copy = CLIENT_PORTAL_I18N[lang].dashboard;
  const tasks = await tasksForClient(user.id);

  const grouped = new Map<ClientStatus, ClientTaskView[]>();
  for (const task of tasks) {
    const status = clientStatusOf(task.status, task.standingCapacityAccountId !== null);
    grouped.set(status, [...(grouped.get(status) ?? []), task]);
  }

  const needsAction = (grouped.get("quote_ready")?.length ?? 0) + (grouped.get("awaiting_payment")?.length ?? 0);
  const inMotion = ["being_priced", "awaiting_routing", "in_progress", "revision_in_progress"]
    .reduce((total, status) => total + (grouped.get(status as ClientStatus)?.length ?? 0), 0);
  const inReview = grouped.get("under_review")?.length ?? 0;
  const delivered = grouped.get("completed")?.length ?? 0;

  const overview = [
    { label: copy.needsAction, value: needsAction, accent: needsAction > 0 },
    { label: copy.inMotion, value: inMotion },
    { label: copy.inReview, value: inReview },
    { label: copy.delivered, value: delivered },
  ];

  return (
    <div className="space-y-6 text-[#F7F6F3]">
      <header>
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[#C9A76A]">
          {copy.kicker}
        </p>
        <h1 className="mt-2 max-w-[24ch] text-[clamp(1.75rem,4vw,2.7rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#A1A8B3]">{copy.sub}</p>
      </header>

      <section
        data-portal-request=""
        className="relative overflow-hidden rounded-[14px] border border-[#4A3A26] bg-[linear-gradient(135deg,rgba(29,23,16,.98),rgba(13,15,19,.99)_62%)] p-5 shadow-[inset_0_1px_0_rgba(226,196,134,0.09),0_24px_60px_-36px_rgba(0,0,0,0.9)] sm:p-7"
      >
        <div aria-hidden className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(226,196,134,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(226,196,134,.05)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="relative grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex items-start gap-4">
            <A2PortalPresence label="A2" />
            <div className="min-w-0 pt-1">
              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#D87526]">
                {copy.requestKicker}
              </p>
              <h2 className="mt-2 text-[clamp(1.25rem,3vw,1.75rem)] font-semibold leading-tight tracking-[-0.025em]">
                {copy.requestTitle}
              </h2>
              <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#B7BDC7]">
                {copy.requestBody}
              </p>
            </div>
          </div>
          <Link
            href="/client/tasks/new"
            className="inline-flex min-h-12 items-center justify-center rounded-[7px] border border-[#C9A76A] bg-[#C9A76A] px-5 text-[14px] font-semibold text-[#14161A] transition-colors hover:bg-[#E2C486] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E2C486] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]"
          >
            {copy.requestCta}
          </Link>
        </div>
      </section>

      <section data-portal-overview="" aria-labelledby="portal-overview-title">
        <h2 id="portal-overview-title" className="mb-3 font-mono text-[12px] uppercase tracking-[0.14em] text-[#8F97A3]">
          {copy.overview}
        </h2>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {overview.map((item) => (
            <div key={item.label} className="rounded-[10px] border border-white/[0.11] bg-white/[0.045] px-4 py-3.5 backdrop-blur-xl">
              <p className={`font-mono text-[clamp(1.45rem,4vw,2rem)] tabular-nums ${item.accent ? "text-[#E2C486]" : "text-[#F7F6F3]"}`}>
                {item.value.toString().padStart(2, "0")}
              </p>
              <p className="mt-1 text-[12px] text-[#A1A8B3]">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label={CLIENT_PORTAL_I18N[lang].shell.tasks} className="space-y-5 pb-6">
        {tasks.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-white/20 bg-white/[0.035] px-5 py-10">
            <h2 className="text-[15px] font-medium">{copy.noTasks}</h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[#A1A8B3]">{copy.noTasksBody}</p>
            <Link href="/client/tasks/new" className="mt-5 inline-flex min-h-11 items-center rounded-md border border-[#C9A76A] px-4 text-sm font-medium text-[#E2C486]">
              {copy.firstTask}
            </Link>
          </div>
        ) : (
          SECTION_ORDER.filter((status) => grouped.has(status)).map((status) => (
            <section key={status}>
              <h2 className="mb-2.5 font-mono text-[12px] uppercase tracking-[0.13em] text-[#A1A8B3]">
                {copy.sectionTitles[status]}
              </h2>
              <Card className="overflow-hidden border-[#C9A76A]/20 bg-[#F7F6F3] shadow-[0_18px_44px_-34px_rgba(0,0,0,0.95)]">
                <div className="divide-y divide-[#14161A]/[0.07]">
                  {grouped.get(status)!.map((task) => (
                    <TaskRow key={task.id} task={task} copy={copy} />
                  ))}
                </div>
              </Card>
            </section>
          ))
        )}
      </section>
    </div>
  );
}
