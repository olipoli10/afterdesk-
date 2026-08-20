import type { ReactNode } from "react";
import { headers } from "next/headers";
import { requireRole } from "@/lib/authz";
import { AppShell } from "@/components/app-shell";
import { ClientLanguageSwitch } from "@/components/client-language-switch";
import { prisma } from "@/lib/db";
import {
  CLIENT_PORTAL_I18N,
  clientPortalLangOf,
} from "@/lib/i18n/client-portal";

export const metadata = {
  title: "My tasks",
  robots: { index: false, follow: false },
};

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("CLIENT");
  const lang = clientPortalLangOf((await headers()).get("x-site-lang"));
  const copy = CLIENT_PORTAL_I18N[lang].shell;
  const [notificationCount, standingCapacityAccount] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.standingCapacityAccount.findUnique({
      where: { clientId: user.id },
      select: { id: true },
    }),
  ]);
  return (
    <AppShell
      areaLabel={copy.area}
      userName={user.name}
      notificationCount={notificationCount}
      notificationLabel={copy.notifications}
      signOutLabel={copy.signOut}
      signingOutLabel={copy.signingOut}
      tone="night"
      width="wide"
      portal
      utility={<ClientLanguageSwitch current={lang} />}
      nav={[
        { href: "/client", label: copy.tasks },
        { href: "/client/tasks/new", label: copy.newTask },
        // Only a client with an active-or-ever-opened block sees this tab —
        // it is not a general upsell surface, just where the account lives
        // once one exists.
        ...(standingCapacityAccount
          ? [{ href: "/client/standing-capacity", label: copy.standingCapacity }]
          : []),
      ]}
    >
      {children}
    </AppShell>
  );
}
