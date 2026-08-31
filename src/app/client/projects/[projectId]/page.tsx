import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireRole } from "@/lib/authz";
import { constructionProjectForUser } from "@/server/construction-assistant-v1/workspace";
import { Card, CardBody, PageTitle, SectionLabel } from "@/components/ui";
import { clientPortalLangOf } from "@/lib/i18n/client-portal";
import { CONSTRUCTION_ASSISTANT_I18N } from "@/lib/i18n/construction-assistant-v1";

export default async function ConstructionProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireRole("CLIENT");
  const copy = CONSTRUCTION_ASSISTANT_I18N[clientPortalLangOf((await headers()).get("x-site-lang"))];
  const { projectId } = await params;
  const project = await constructionProjectForUser(user.id, projectId);
  if (!project) notFound();
  return (
    <div className="space-y-6 text-[#F7F6F3]">
      <PageTitle tone="night" title={project.name} sub={`${project.code} · ${project.address ?? "Adresse non fournie"}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <section><SectionLabel tone="night" className="mb-3">{copy.contacts}</SectionLabel><Card tone="night"><div className="divide-y divide-white/10">{project.contacts.map((contact) => <div key={contact.id} className="p-4"><p className="font-medium">{contact.displayName}</p><p className="mt-1 text-sm text-[#A1A8B3]">{contact.role ?? "Rôle non précisé"} · {contact.normalizedPhone ?? contact.normalizedEmail ?? "Aucun canal"}</p></div>)}</div></Card></section>
        <section><SectionLabel tone="night" className="mb-3">{copy.schedule}</SectionLabel><Card tone="night"><CardBody className="space-y-3">{project.calendarItems.length ? project.calendarItems.map((item) => <div key={item.id} className="rounded-md border border-white/10 p-3"><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-[#A1A8B3]">{new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short", timeZone: item.timezone }).format(item.startsAt)} · {item.verificationState === "proposed" ? "Proposé" : "Vérifié"}</p></div>) : <p className="text-sm text-[#A1A8B3]">Aucun élément.</p>}</CardBody></Card></section>
      </div>
    </div>
  );
}
