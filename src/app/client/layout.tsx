import type { ReactNode } from "react";
import { requireRole } from "@/lib/authz";
import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/db";

export const metadata = {
  title: "My tasks",
  robots: { index: false, follow: false },
};

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("CLIENT");
  const [notificationCount, standingCapacityAccount] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.standingCapacityAccount.findUnique({
      where: { clientId: user.id },
      select: { id: true },
    }),
  ]);
  return (
    <AppShell
      areaLabel="Client"
      userName={user.name}
      notificationCount={notificationCount}
      nav={[
        { href: "/client", label: "My tasks" },
        { href: "/client/tasks/new", label: "New task" },
        // Only a client with an active-or-ever-opened block sees this tab —
        // it is not a general upsell surface, just where the account lives
        // once one exists.
        ...(standingCapacityAccount
          ? [{ href: "/client/standing-capacity", label: "My standing capacity" }]
          : []),
      ]}
    >
      {children}
    </AppShell>
  );
}
