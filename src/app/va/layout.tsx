import type { ReactNode } from "react";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

export default async function VaLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("VA");

  const profile = await prisma.vaProfile.findUnique({
    where: { userId: user.id },
    select: { status: true },
  });
  const approved = profile?.status === "approved";

  return (
    <AppShell
      areaLabel="Work"
      userName={user.name}
      nav={
        approved
          ? [
              { href: "/va", label: "My work" },
              { href: "/va/pool", label: "Available work" },
            ]
          : [{ href: "/va", label: "My account" }]
      }
    >
      {children}
    </AppShell>
  );
}
