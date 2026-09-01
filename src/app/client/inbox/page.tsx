import { requireRole } from "@/lib/authz";
import { headers } from "next/headers";
import { clientPortalLangOf } from "@/lib/i18n/client-portal";
import { CONSTRUCTION_ASSISTANT_I18N } from "@/lib/i18n/construction-assistant-v1";
import { boundOutboundActionSchema } from "@/lib/construction-assistant-v1/outbound";
import { preparedEvidenceRequestSchema } from "@/lib/construction-operating-assistant-r0/contracts";
import { inboxForUser } from "@/server/construction-assistant-v1/queries";
import { approveLocalOutboundSimulation } from "@/server/actions/construction-assistant-v1";
import { LocalConstructionSimulator } from "@/components/construction-assistant-v1/local-simulator";
import { Card, CardBody, EmptyState, PageTitle, SectionLabel } from "@/components/ui";

export default async function ConstructionInboxPage() {
  const user = await requireRole("CLIENT");
  const copy = CONSTRUCTION_ASSISTANT_I18N[clientPortalLangOf((await headers()).get("x-site-lang"))];
  const inbox = await inboxForUser(user.id);
  return <div className="space-y-6 text-[#F7F6F3]"><PageTitle tone="night" title={copy.inbox} sub={copy.inboxSub} />{!inbox ? <EmptyState tone="night" title="Aucun espace" body="Initialisez d’abord le dossier Construction." /> : <><LocalConstructionSimulator workspaceId={inbox.workspace.id} />
    <section><SectionLabel tone="night" className="mb-3">Actions préparées</SectionLabel><div className="space-y-3">{inbox.actions.length === 0 ? <p className="text-sm text-[#8A9099]">Aucune action préparée.</p> : inbox.actions.map((action) => {
      const outbound = boundOutboundActionSchema.safeParse(action.payload);
      const followUp = preparedEvidenceRequestSchema.safeParse(action.payload);
      return <Card key={action.id} tone="night"><CardBody>
        <p className="font-medium">Message à {action.contact?.displayName ?? "contact"}</p>
        {outbound.success ? <><p className="mt-2 rounded-md bg-black/20 p-3 text-sm text-[#B7BDC7]">{outbound.data.body}</p><p className="mt-2 text-xs text-[#8A9099]">{outbound.data.channel} · {outbound.data.normalizedRecipient} · version {action.version}</p></> : followUp.success ? <><p className="mt-2 rounded-md bg-black/20 p-3 text-sm text-[#B7BDC7]">{followUp.data.body}</p><p className="mt-2 text-xs text-[#8A9099]">{followUp.data.channel} · {followUp.data.normalizedRecipient} · version {action.version}</p><p className="mt-2 text-sm font-semibold text-[#E2C486]">PRÉPARÉ — NON ENVOYÉ. Aucun transport externe n’est autorisé.</p></> : <p className="mt-2 text-sm text-[#FF9A8B]">Payload fermé invalide.</p>}
        <div className="mt-3 flex items-center justify-between"><p className="font-mono text-[11px] uppercase text-[#C9A76A]">{action.status}</p>{outbound.success && action.status === "proposed" ? <form action={approveLocalOutboundSimulation}><input type="hidden" name="workspaceId" value={inbox.workspace.id}/><input type="hidden" name="actionId" value={action.id}/><input type="hidden" name="expectedVersion" value={action.version}/><input type="hidden" name="expectedPayloadHash" value={action.payloadHash}/><button className="rounded-md bg-[#D87526] px-3 py-2 text-sm font-semibold text-white">Approuver et livrer localement</button></form> : null}</div>
      </CardBody></Card>;
    })}</div></section>
    <section><SectionLabel tone="night" className="mb-3">Historique des communications</SectionLabel><Card tone="night"><div className="divide-y divide-white/10">{inbox.messages.map((message) => <div key={message.id} className="p-4"><div className="flex justify-between gap-3"><p className="font-medium">{message.direction === "inbound" ? "Reçu" : "Sortant simulé"} · {message.channel}</p><p className="font-mono text-[11px] uppercase text-[#8A9099]">{message.status}</p></div><p className="mt-2 text-sm text-[#B7BDC7]">{message.originalBody}</p><p className="mt-2 text-xs text-[#6F7680]">{message.providerMessageId ?? "Portail"} · {message.createdAt.toISOString()}</p></div>)}</div></Card></section></>}</div>;
}
