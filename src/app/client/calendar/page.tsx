import { requireRole } from "@/lib/authz";
import { headers } from "next/headers";
import { clientPortalLangOf } from "@/lib/i18n/client-portal";
import { CONSTRUCTION_ASSISTANT_I18N } from "@/lib/i18n/construction-assistant-v1";
import { calendarCockpitForUser } from "@/server/construction-assistant-v1/queries";
import { Card, CardBody, EmptyState, PageTitle } from "@/components/ui";

export default async function ConstructionCalendarPage() {
  const user = await requireRole("CLIENT");
  const copy = CONSTRUCTION_ASSISTANT_I18N[clientPortalLangOf((await headers()).get("x-site-lang"))];
  const cockpit = await calendarCockpitForUser(user.id);
  return <div className="space-y-6 text-[#F7F6F3]"><PageTitle tone="night" title={copy.calendar} sub={copy.calendarSub} />{!cockpit ? <EmptyState tone="night" title="Aucun calendrier" body="Initialisez d’abord un espace Construction." /> : cockpit.items.length === 0 ? <EmptyState tone="night" title="Calendrier vide" body="Dites à A2 un rendez-vous clair; ENDVERA l’inscrira comme proposition sourcée." /> : <div className="space-y-3">{cockpit.items.map((item) => <Card tone="night" key={item.id}><CardBody><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-[#A1A8B3]">{item.project?.name} · {item.contact?.displayName}</p></div><div className="text-right"><p className="text-sm text-[#E2C486]">{new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short", timeZone: item.timezone }).format(item.startsAt)}</p><p className="mt-1 font-mono text-[11px] uppercase text-[#8A9099]">{item.verificationState}</p></div></div><details className="mt-3 text-xs text-[#8A9099]"><summary className="cursor-pointer">Voir la provenance</summary><p className="mt-2">{item.sourceMessage.channel} · « {item.sourceMessage.originalBody} »</p></details></CardBody></Card>)}</div>}</div>;
}
