import { headers } from "next/headers";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { clientPortalLangOf } from "@/lib/i18n/client-portal";
import { Card, CardBody, PageTitle } from "@/components/ui";
import { humanEscalationCockpitForUser } from "@/server/construction-operating-assistant-r22/human-escalation-cockpit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Human support" };

export default async function ConstructionSupportPage() {
  const user = await requireRole("CLIENT");
  const membership = await prisma.constructionWorkspaceMember.findFirst({
    where: { userId: user.id, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } },
    orderBy: { createdAt: "asc" }, select: { workspaceId: true },
  });
  const french = clientPortalLangOf((await headers()).get("x-site-lang")) === "fr";
  if (!membership) return <p className="text-[#A1A8B3]">{french ? "Aucun espace autorisé." : "No authorized workspace."}</p>;
  const cockpit = await humanEscalationCockpitForUser({ userId: user.id, workspaceId: membership.workspaceId });
  if (cockpit.role === "FIELD_WORKER") return <p className="text-[#A1A8B3]">{french ? "Accès refusé." : "Access refused."}</p>;
  return (
    <main className="space-y-6 text-[#F7F6F3]">
      <PageTitle tone="night" title={french ? "Appui humain" : "Human support"} sub={french ? "Exceptions préparées, prochain responsable et reprise exacte." : "Prepared exceptions, next owner and exact resume."} />
      {cockpit.eligibleLoops.length ? <Card tone="night"><CardBody><h2 className="font-semibold">{french ? "Interventions possibles" : "Eligible support"}</h2><ul className="mt-3 space-y-2 text-sm text-[#A1A8B3]">{cockpit.eligibleLoops.map((loop) => <li key={loop.loopId}>{loop.projectCode} · {loop.nextAction}</li>)}</ul></CardBody></Card> : null}
      <section aria-labelledby="support-open"><h2 id="support-open" className="text-lg font-semibold">{french ? "Dossiers ouverts" : "Open support items"}</h2><div className="mt-3 grid gap-3">{cockpit.escalations.length ? cockpit.escalations.map((item) => <Card key={item.escalationId} tone="night"><CardBody><p className="font-semibold">{item.projectCode} · {item.evidenceKind}</p><p className="mt-1 text-sm text-[#A1A8B3]">{item.state} · {item.nextResponsibleRole}</p><p className="mt-2 text-sm">{item.nextAction}</p><p className="mt-3 text-xs text-[#A1A8B3]">{french ? "Aucun message n’est envoyé depuis cette page." : "No message is sent from this page."}</p></CardBody></Card>) : <p className="text-sm text-[#A1A8B3]">{french ? "Aucune intervention ouverte." : "No open support item."}</p>}</div></section>
    </main>
  );
}
