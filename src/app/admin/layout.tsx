import type { ReactNode } from "react";
import { requireRole } from "@/lib/authz";
import { pricingQueueCount } from "@/lib/queries/tasks";
import { AppShell } from "@/components/app-shell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("ADMIN");
  const pricingCount = await pricingQueueCount();

  return (
    <AppShell
      areaLabel="Operator"
      userName={user.name}
      nav={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/pricing", label: "Pricing queue", badge: pricingCount },
        { href: "/admin/tasks", label: "All tasks" },
      ]}
    >
      {children}
    </AppShell>
  );
}
