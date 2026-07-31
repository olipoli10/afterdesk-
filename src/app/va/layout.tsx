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

  const [profile, notificationCount] = await Promise.all([
    vaProfileFor(user.id),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const approved = profile?.status === "approved";

  return (
    <AppShell
      areaLabel="Work"
      userName={user.name}
      notificationCount={notificationCount}
      tone="night"
      // A worker who signs out belongs back on the worker storefront, not on
      // the client one and not on a login form.
      signedOutTo="/workers"
      nav={
        approved
          ? [
              // Nav and the board's h1 share ONE name on purpose — the old
              // chrome mixed four variants ("Browse available work", "The
              // pool", "Available work", "Open work") and read as noise.
              // The /va CTA names the intent instead ("Find work").
              { href: "/va", label: "My work" },
              { href: "/va/pool", label: "Available work" },
              { href: "/va/training", label: "Academy" },
            ]
          : [
              // The Academy is open pre-approval on purpose: free courses
              // and certificates BEFORE the review are the funnel — an
              // applicant who arrives certified is the whole point, and
              // nothing in the courses is client data.
              { href: "/va", label: "My account" },
              { href: "/va/training", label: "Academy" },
            ]
      }
    >
      {children}
    </AppShell>
  );
}
