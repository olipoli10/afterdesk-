import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/actions/notifications";
import { Card, CardBody, EmptyState, PageTitle, buttonSecondary } from "@/components/ui";
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

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = rows.filter((row) => !row.readAt).length;

  const nav =
    user.role === "ADMIN"
      ? [
          { href: "/admin", label: "Overview" },
          { href: "/admin/tasks", label: "All tasks" },
        ]
      : user.role === "VA"
        ? [
            { href: "/va", label: "My work" },
            { href: "/va/pool", label: "Available work" },
            { href: "/va/training", label: "Academy" },
          ]
        : [
            { href: "/client", label: "My tasks" },
            { href: "/client/tasks/new", label: "New task" },
          ];

  return (
    <AppShell
      areaLabel={user.role === "ADMIN" ? "Operator" : user.role === "VA" ? "Work" : "Client"}
      userName={user.name}
      notificationCount={unread}
      nav={nav}
      width={user.role === "ADMIN" ? "wide" : "default"}
    >
      <div className="mx-auto max-w-2xl">
      <PageTitle
        title="Updates"
        sub="Task, review, payment and account decisions."
        action={
          unread > 0 ? (
            <form action={markAllNotificationsRead}>
              <button className={buttonSecondary}>Mark all read</button>
            </form>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No updates yet" body="Important task and account changes appear here." />
      ) : (
        <Card>
          <div className="divide-y divide-[#14161A]/[0.06]">
            {rows.map((row) => (
              <CardBody key={row.id} className={row.readAt ? "opacity-70" : ""}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#14161A]">{row.title}</p>
                    {row.body ? (
                      <p className="mt-1 text-sm leading-relaxed text-[#5B6069]">{row.body}</p>
                    ) : null}
                    <p className="mt-2 font-mono text-xs text-[#5B6069]">
                      <LocalTime iso={row.createdAt} dateStyle="short" />
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {row.taskId ? (
                      <Link
                        href={taskHref(user.role, row.taskId)}
                        className="inline-flex min-h-11 items-center px-2 text-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]"
                      >
                        Open task
                      </Link>
                    ) : null}
                    {!row.readAt ? (
                      <form action={markNotificationRead.bind(null, row.id)}>
                        <button className="min-h-11 px-2 text-xs text-[#5B6069] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]">
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
