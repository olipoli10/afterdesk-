import type { ReactNode } from "react";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { pricingQueueCount } from "@/lib/queries/tasks";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "Operator",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("ADMIN");

  const [pricingCount, qcCount, workerCount] = await Promise.all([
    pricingQueueCount(),
    prisma.task.count({ where: { status: "submitted_for_qc" } }),
    prisma.vaProfile.count({ where: { status: { in: ["pending_test", "pending_grading"] } } }),
  ]);

  return (
    <AppShell
      areaLabel="Operator"
      width="wide"
      userName={user.name}
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
