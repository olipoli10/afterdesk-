import type { ReactNode } from "react";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { pricingQueueCount } from "@/lib/queries/tasks";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  /**
   * A plain string here would resolve to "Operator · AfterDesk" for this
   * segment but NOT pass the "· AfterDesk" template down further: Next only
   * carries a title template to descendants when the layout that consumes it
   * redeclares its own template object. Sub-pages (pricing, QC, workers,
   * tasks) still show this default verbatim until they set their own title,
   * but once they do, this is what lets it compose correctly.
   */
  title: {
    default: "Operator",
    template: "%s · AfterDesk",
  },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("ADMIN");

  const [pricingCount, qcCount, workerCount, notificationCount] = await Promise.all([
    pricingQueueCount(),
    prisma.task.count({ where: { status: "submitted_for_qc" } }),
    prisma.vaProfile.count({ where: { status: { in: ["pending_test", "pending_grading"] } } }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <AppShell
      areaLabel="Operator"
      width="wide"
      userName={user.name}
      notificationCount={notificationCount}
      nav={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/pricing", label: "Pricing", badge: pricingCount },
        { href: "/admin/qc", label: "QC", badge: qcCount },
        { href: "/admin/workers", label: "Workers", badge: workerCount },
        { href: "/admin/tasks", label: "All tasks" },
      ]}
    >
      {children}
    </AppShell>
  );
}
