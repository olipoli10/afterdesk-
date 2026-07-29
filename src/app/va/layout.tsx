import type { ReactNode } from "react";
import { cache } from "react";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "My work",
  robots: { index: false, follow: false },
};

/**
 * One vaProfile read per request. The layout and every worker page render in
 * the same pass, so without cache() each navigation queried this row two or
 * three times. All worker pages import this instead of prisma directly.
 */
export const vaProfileFor = cache(async (userId: string) =>
  prisma.vaProfile.findUnique({
    where: { userId },
    select: {
      status: true,
      scoreCache: true,
      ratedCount: true,
      tasksCompleted: true,
      tasksAbandoned: true,
      suspensionReason: true,
    },
  })
);

export default async function VaLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("VA");

  const profile = await vaProfileFor(user.id);
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
