import Link from "next/link";
import { headers } from "next/headers";
import { requireRole } from "@/lib/authz";
import { constructionWorkspaceForUser } from "@/server/construction-assistant-v1/workspace";
import { initializeConstructionDemo } from "@/server/actions/construction-assistant-v1";
import { A2ConstructionComposer } from "@/components/construction-assistant-v1/a2-composer";
import { Card, CardBody, EmptyState, PageTitle, SectionLabel } from "@/components/ui";
import { clientPortalLangOf } from "@/lib/i18n/client-portal";
import { CONSTRUCTION_ASSISTANT_I18N } from "@/lib/i18n/construction-assistant-v1";
import { openLoopFocusForUser } from "@/server/construction-operating-assistant-r0/open-loops";

const NEXT_ACTION_COPY: Record<string, string> = {
  CLARIFY_PROJECT_OR_FINANCIALS: "Clarifier le chantier ou le montant",
  OBTAIN_WRITTEN_APPROVAL: "Obtenir l’approbation écrite",
  SUPPLY_FIELD_EVIDENCE: "Ajouter une photo ou un document du travail",
  VERIFY_OR_RESOLVE: "Vérifier ou résoudre la contradiction",
  PREPARE_INVOICE: "Préparer la facture",
};

export default async function ConstructionProjectsPage() {
  const user = await requireRole("CLIENT");
  const copy = CONSTRUCTION_ASSISTANT_I18N[clientPortalLangOf((await headers()).get("x-site-lang"))];
  const workspace = await constructionWorkspaceForUser(user.id);
  const focus = workspace
    ? await openLoopFocusForUser({ userId: user.id, workspaceId: workspace.id, referenceNow: new Date() })
    : null;
  return (
    <div className="space-y-6 text-[#F7F6F3]">
      <PageTitle tone="night" title={copy.projects} sub={copy.projectsSub} />
      {!workspace ? (
        <EmptyState tone="night" title={copy.noWorkspace} body={copy.noWorkspaceBody} action={<form action={initializeConstructionDemo}><button className="rounded-md bg-[#D87526] px-4 py-2.5 text-sm font-semibold text-white">{copy.createDemo}</button></form>} />
      ) : (
        <>
          <A2ConstructionComposer workspaceId={workspace.id} />
          <section>
            <SectionLabel tone="night" className="mb-3">À faire aujourd’hui</SectionLabel>
            <div className="grid gap-3 lg:grid-cols-2">
              {focus?.today.length ? focus.today.map((item) => (
                <Link key={item.loopId} href={`/client/projects/${item.projectId}`}>
                  <Card tone="night" className="h-full border-[#C9A76A]/25 transition-colors hover:border-[#C9A76A]/60"><CardBody>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-[#C9A76A]">{item.project.code}</p>
                        <h2 className="mt-2 font-semibold">{item.project.name}</h2>
                      </div>
                      <p className="font-mono text-[11px] uppercase text-[#FFCB7A]">{item.status.replaceAll("_", " ")}</p>
                    </div>
                    <p className="mt-3 text-sm text-[#B7BDC7]">{NEXT_ACTION_COPY[item.nextAction] ?? item.nextAction}</p>
                    <p className="mt-2 text-xs text-[#8A9099]">Responsable: {item.nextResponsible.role} · aucune échéance inventée</p>
                  </CardBody></Card>
                </Link>
              )) : <Card tone="night"><CardBody><p className="text-sm text-[#A1A8B3]">Aucun dossier économique ouvert.</p></CardBody></Card>}
            </div>
          </section>
          <section>
            <SectionLabel tone="night" className="mb-3">Demain</SectionLabel>
            <Card tone="night"><CardBody>
              {focus?.tomorrow.length ? <ul className="space-y-2">{focus.tomorrow.map((item) => <li key={item.loopId}><Link className="text-[#E2C486] hover:underline" href={`/client/projects/${item.projectId}`}>{item.project.code} · {NEXT_ACTION_COPY[item.nextAction] ?? item.nextAction}</Link></li>)}</ul> : <p className="text-sm text-[#A1A8B3]">Aucun engagement daté pour demain.</p>}
            </CardBody></Card>
          </section>
          <section>
            <SectionLabel tone="night" className="mb-3">{workspace.name}</SectionLabel>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {workspace.projects.map((project) => (
                <Link key={project.id} href={`/client/projects/${project.id}`}>
                  <Card tone="night" className="h-full transition-colors hover:border-[#C9A76A]/50"><CardBody>
                    <p className="font-mono text-xs text-[#C9A76A]">{project.code}</p>
                    <h2 className="mt-2 text-lg font-semibold">{project.name}</h2>
                    <p className="mt-2 text-sm text-[#A1A8B3]">{project.address ?? "Adresse non fournie"}</p>
                    <p className="mt-4 text-xs text-[#8A9099]">{project._count.contacts} contact(s) · {project._count.calendarItems} élément(s) au calendrier</p>
                  </CardBody></Card>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
