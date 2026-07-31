import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { pricingQueueCount } from "@/lib/queries/tasks";
import { vaProfileFor } from "@/lib/queries/va-profile";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/actions/notifications";
import { Card, CardBody, EmptyState, PageTitle, buttonSecondary, buttonSecondaryNight } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { AppShell } from "@/components/app-shell";

/**
 * Session-only, and the one logged-in route that sits outside the /client,
 * /va and /admin segments — so it never inherited their layout-level noindex
 * and was the single authenticated page a crawler was invited to index.
 */
export const metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

function taskHref(role: "CLIENT" | "VA" | "ADMIN", taskId: string): string {
  if (role === "ADMIN") return `/admin/tasks/${taskId}`;
  if (role === "VA") return `/va/tasks/${taskId}`;
  return `/client/tasks/${taskId}`;
}

/**
 * The header nav has to be the SAME list the role's own layout renders. This
 * page is the one logged-in route outside /client, /va and /admin, so it
 * inherits none of their layouts and has to rebuild the chrome by hand — and
 * a hand-written short list drifted twice. It offered a non-approved worker
 * "Available work", which src/app/va/pool/page.tsx bounces straight back to
 * /va (a link that returns you to the page you left), and it dropped three of
 * the operator's five queues along with their counts.
 */
async function navFor(user: SessionUser) {
  if (user.role === "ADMIN") {
    const [pricingCount, qcCount, workerCount] = await Promise.all([
      pricingQueueCount(),
      prisma.task.count({ where: { status: "submitted_for_qc" } }),
      prisma.vaProfile.count({ where: { status: { in: ["pending_test", "pending_grading"] } } }),
    ]);
    return [
      { href: "/admin", label: "Overview" },
      { href: "/admin/pricing", label: "Pricing", badge: pricingCount },
      { href: "/admin/qc", label: "QC", badge: qcCount },
      { href: "/admin/workers", label: "Workers", badge: workerCount },
      { href: "/admin/tasks", label: "All tasks" },
    ];
  }
  if (user.role === "VA") {
    const profile = await vaProfileFor(user.id);
    return profile?.status === "approved"
      ? [
          { href: "/va", label: "My work" },
          { href: "/va/pool", label: "Available work" },
          { href: "/va/training", label: "Academy" },
        ]
      : [
          { href: "/va", label: "My account" },
          { href: "/va/training", label: "Academy" },
        ];
  }
  return [
    { href: "/client", label: "My tasks" },
    { href: "/client/tasks/new", label: "New task" },
  ];
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = rows.filter((row) => !row.readAt).length;

  const nav = await navFor(user);

  const tone = user.role === "VA" ? "night" : "paper";
  const night = tone === "night";
  const ink = night ? "text-[#F7F6F3]" : "text-[#14161A]";
  const muted = night ? "text-[#8A9099]" : "text-[#5B6069]";
  const ring = night ? "focus-visible:ring-white" : "focus-visible:ring-[#14161A]";

  return (
    <AppShell
      areaLabel={user.role === "ADMIN" ? "Operator" : user.role === "VA" ? "Work" : "Client"}
      userName={user.name}
      notificationCount={unread}
      nav={nav}
      width={user.role === "ADMIN" ? "wide" : "default"}
      tone={tone}
      // Same rule as src/app/va/layout.tsx: a worker signing out belongs on
      // the worker storefront, not the client one.
      signedOutTo={user.role === "VA" ? "/workers" : "/"}
    >
      <div className="mx-auto max-w-2xl">
      <PageTitle
        title="Updates"
        sub="Task, review, payment and account decisions."
        tone={tone}
        action={
          unread > 0 ? (
            <form action={markAllNotificationsRead}>
              <button className={night ? buttonSecondaryNight : buttonSecondary}>Mark all read</button>
            </form>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No updates yet"
          body="Important task and account changes appear here."
          tone={tone}
        />
      ) : (
        <Card tone={tone}>
          <div className={night ? "divide-y divide-white/[0.06]" : "divide-y divide-[#14161A]/[0.06]"}>
            {rows.map((row) => (
              <CardBody key={row.id} className={row.readAt ? "opacity-70" : ""}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`text-sm font-medium ${ink}`}>{row.title}</p>
                    {row.body ? (
                      <p className={`mt-1 text-sm leading-relaxed ${muted}`}>{row.body}</p>
                    ) : null}
                    <p className={`mt-2 font-mono text-xs ${muted}`}>
                      <LocalTime iso={row.createdAt} dateStyle="short" />
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {row.taskId ? (
                      <Link
                        href={taskHref(user.role, row.taskId)}
                        className={`inline-flex min-h-11 items-center px-2 text-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 ${ring} ${ink}`}
                      >
                        Open task
                      </Link>
                    ) : null}
                    {!row.readAt ? (
                      <form action={markNotificationRead.bind(null, row.id)}>
                        <button
                          className={`min-h-11 px-2 text-xs underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 ${ring} ${muted}`}
                        >
                          Mark read
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </CardBody>
            ))}
          </div>
        </Card>
      )}
      </div>
    </AppShell>
  );
}
