import type { ReactNode } from "react";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: { default: "My work", template: "%s · Endvera" },
  robots: { index: false, follow: false },
};

export default async function VaLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("VA");
  const notificationCount = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });

  return (
    <AppShell
      areaLabel="Work"
      userName={user.name}
      notificationCount={notificationCount}
      tone="night"
      // A worker who signs out belongs back on the worker storefront, not on
      // the client one and not on a login form.
      signedOutTo="/workers"
      // ONE nav for every worker, on purpose. This used to branch on
      // vaProfile.status, which the App Router then froze: a shared layout is
      // not re-rendered on a soft navigation between sibling pages (the client
      // sends Next-Router-State-Tree, the server skips every matching segment
      // and the client reuses the cached layout UI), while /va/pool re-reads
      // the status on every request. The two disagreed for the whole life of a
      // tab — a worker suspended mid-session kept a header link that bounced
      // them back to /va, and one approved mid-session had no link to the pool
      // at all. Nothing server-side can repair that: revalidatePath clears
      // server caches, not another session's client Router Cache. So the
      // header carries no status: it cannot go stale, and /va/pool answers for
      // its own gate.
      //
      // Nav and the board's h1 share ONE name on purpose — the old chrome
      // mixed four variants ("Browse available work", "The pool", "Available
      // work", "Open work") and read as noise. The /va CTA names the intent
      // instead ("Find work").
      nav={[
        { href: "/va", label: "My work" },
        { href: "/va/pool", label: "Available work" },
        // The Academy is open pre-approval on purpose: free courses and
        // certificates BEFORE the review are the funnel — an applicant who
        // arrives certified is the whole point, and nothing in the courses is
        // client data.
        { href: "/va/training", label: "Academy" },
        // Unconditional for the same reason the other three are: this layout
        // must never branch on a status read here (see the note above). A
        // worker with no standing capacity assignment just sees an empty
        // state on the page itself, same as /va/pool does for an unapproved
        // worker.
        { href: "/va/standing-capacity", label: "My accounts" },
      ]}
    >
      {children}
    </AppShell>
  );
}
