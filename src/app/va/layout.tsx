import type { ReactNode } from "react";
import { requireRole } from "@/lib/authz";
import { AppShell } from "@/components/app-shell";

export default async function VaLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("VA");
  return (
    <AppShell
      areaLabel="VA"
      userName={user.name}
      nav={[{ href: "/va", label: "My account" }]}
    >
      {children}
    </AppShell>
  );
}
