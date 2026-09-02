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
        { href: "/client/cockpit", label: lang === "fr" ? "Aujourd’hui" : "Today" },
        { href: "/client/onboarding", label: lang === "fr" ? "Démarrage" : "Get started" },
        { href: "/client/assistant", label: lang === "fr" ? "Assistant" : "Assistant" },
        { href: "/client", label: copy.tasks },
        { href: "/client/projects", label: lang === "fr" ? "Chantiers" : "Projects" },
        { href: "/client/calendar", label: lang === "fr" ? "Calendrier" : "Calendar" },
        { href: "/client/inbox", label: lang === "fr" ? "Boîte de réception" : "Inbox" },
        { href: "/client/privacy", label: lang === "fr" ? "Confidentialité" : "Privacy" },
        { href: "/client/account", label: lang === "fr" ? "Compte" : "Account" },
        { href: "/client/support", label: lang === "fr" ? "Appui humain" : "Human support" },
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
