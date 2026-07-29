import type { ReactNode } from "react";
import { requireRole } from "@/lib/authz";
import { AppShell } from "@/components/app-shell";

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("CLIENT");
  return (
    <AppShell
      areaLabel="Client"
      userName={user.name}
      nav={[
        { href: "/client", label: "My tasks" },
        { href: "/client/tasks/new", label: "New task" },
      ]}
    >
      {children}
    </AppShell>
  );
}
