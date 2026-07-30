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
              // Nav and the board's h1 share ONE name on purpose — the old
              // chrome mixed four variants ("Browse available work", "The
              // pool", "Available work", "Open work") and read as noise.
              // The /va CTA names the intent instead ("Find work").
              { href: "/va", label: "My work" },
              { href: "/va/pool", label: "Available work" },
              { href: "/va/training", label: "Training" },
            ]
          : [
              // Training is open pre-approval on purpose: an applicant who
              // reads the guides before review delivers better first work,
              // and nothing in them is client data.
              { href: "/va", label: "My account" },
              { href: "/va/training", label: "Training" },
            ]
      }
    >
      {children}
    </AppShell>
  );
}
