import Link from "next/link";
import { headers } from "next/headers";
import { requireRole } from "@/lib/authz";
import { constructionWorkspaceForUser } from "@/server/construction-assistant-v1/workspace";
import { initializeConstructionDemo } from "@/server/actions/construction-assistant-v1";
import { A2ConstructionComposer } from "@/components/construction-assistant-v1/a2-composer";
import { Card, CardBody, EmptyState, PageTitle, SectionLabel } from "@/components/ui";
import { clientPortalLangOf } from "@/lib/i18n/client-portal";
import { CONSTRUCTION_ASSISTANT_I18N } from "@/lib/i18n/construction-assistant-v1";

export default async function ConstructionProjectsPage() {
  const user = await requireRole("CLIENT");
  const copy = CONSTRUCTION_ASSISTANT_I18N[clientPortalLangOf((await headers()).get("x-site-lang"))];
  const workspace = await constructionWorkspaceForUser(user.id);
  return (
    <div className="space-y-6 text-[#F7F6F3]">
      <PageTitle tone="night" title={copy.projects} sub={copy.projectsSub} />
      {!workspace ? (
        <EmptyState tone="night" title={copy.noWorkspace} body={copy.noWorkspaceBody} action={<form action={initializeConstructionDemo}><button className="rounded-md bg-[#D87526] px-4 py-2.5 text-sm font-semibold text-white">{copy.createDemo}</button></form>} />
      ) : (
        <>
          <A2ConstructionComposer workspaceId={workspace.id} />
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
