import { requireRole } from "@/lib/authz";
import { boundOutboundActionSchema } from "@/lib/construction-assistant-v1/outbound";
import { preparedEvidenceRequestSchema } from "@/lib/construction-operating-assistant-r0/contracts";
import { OperatingAssistantComposer } from "@/components/construction-operating-assistant-r2/assistant-composer";
import { operatingAssistantCockpitForUser } from "@/server/construction-operating-assistant-r2/queries";
import { initializeOperatingAssistant } from "@/server/actions/construction-operating-assistant-r2";
import { Card, CardBody, PageTitle, SectionLabel } from "@/components/ui";

function actionPayload(payload: unknown) {
  const outbound = boundOutboundActionSchema.safeParse(payload);
  if (outbound.success) return outbound.data;
  const followUp = preparedEvidenceRequestSchema.safeParse(payload);
  return followUp.success ? followUp.data : null;
}
export default async function OperatingAssistantPage() {
  const user = await requireRole("CLIENT");
  const cockpit = await operatingAssistantCockpitForUser(user.id);
  if (!cockpit) {
    return (
      <div className="space-y-6 text-[#F7F6F3]">
        <PageTitle tone="night" title="Assistant ENDVERA" sub="Configurez une fois votre entreprise, votre premier chantier et un contact." />
        <form action={initializeOperatingAssistant} className="grid gap-4 rounded-2xl border border-[#C9A76A]/25 bg-[#111317] p-5 md:grid-cols-2">
          <label className="text-sm">Entreprise<input required name="companyName" className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] p-3" /></label>
          <label className="text-sm">Code du chantier<input required name="projectCode" placeholder="LAVAL-001" className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] p-3" /></label>
          <label className="text-sm">Nom du chantier<input required name="projectName" className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] p-3" /></label>
          <label className="text-sm">Adresse<input name="projectAddress" className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] p-3" /></label>
          <label className="text-sm">Premier contact<input required name="contactName" className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] p-3" /></label>
          <label className="text-sm">Rôle du contact<input name="contactRole" placeholder="Fournisseur, employé…" className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] p-3" /></label>
          <label className="text-sm">Téléphone (optionnel)<input name="contactPhone" className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] p-3" /></label>
          <div className="flex items-end"><button className="min-h-12 w-full rounded-xl bg-[#D87526] px-5 font-semibold text-white">Créer mon assistant</button></div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-7 text-[#F7F6F3]">
      <PageTitle tone="night" title="Assistant ENDVERA" sub={`${cockpit.workspace.name} · une conversation, une mémoire, des actions contrôlées.`} />
      <OperatingAssistantComposer workspaceId={cockpit.workspace.id} />

      <section>
        <SectionLabel tone="night" className="mb-3">Aujourd’hui</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2">
          <Card tone="night"><CardBody>
            <h2 className="font-semibold">Agenda</h2>
            {cockpit.today.length ? <ul className="mt-3 space-y-3">{cockpit.today.map((item) => <li key={item.id}><p className="text-sm text-[#E2C486]">{new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: item.timezone }).format(item.startsAt)}</p><p>{item.title}</p><p className="text-xs text-[#8A9099]">{item.project?.name ?? "Sans chantier"} · {item.contact?.displayName ?? "Sans contact"}</p></li>)}</ul> : <p className="mt-3 text-sm text-[#8A9099]">Rien au calendrier aujourd’hui.</p>}
          </CardBody></Card>
          <Card tone="night"><CardBody>
            <h2 className="font-semibold">Rappels et blocages</h2>
            {cockpit.reminders.length ? <ul className="mt-3 space-y-2">{cockpit.reminders.slice(0, 5).map((item) => { const payload = item.payload as { title?: string }; return <li key={item.id} className="text-sm"><span className="text-[#E2C486]">{item.dueAt ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short", timeZone: cockpit.workspace.defaultTimezone }).format(item.dueAt) : "Sans date"}</span> · {payload.title ?? "Rappel"}</li>; })}</ul> : <p className="mt-3 text-sm text-[#8A9099]">Aucun rappel actif.</p>}
            {cockpit.openLoops.length ? <div className="mt-4 border-t border-white/10 pt-3"><p className="text-xs uppercase text-[#8A9099]">Dossiers à avancer</p>{cockpit.openLoops.slice(0, 3).map((loop) => <p key={loop.id} className="mt-2 text-sm">{loop.project.code} · {loop.nextAction}</p>)}</div> : null}
          </CardBody></Card>
        </div>
      </section>

      {cockpit.approvals.length ? <section><SectionLabel tone="night" className="mb-3">À approuver — rien n’est envoyé</SectionLabel><div className="grid gap-3 md:grid-cols-2">{cockpit.approvals.map((action) => { const payload = actionPayload(action.payload); return <Card key={action.id} tone="night"><CardBody><p className="font-semibold">{action.contact?.displayName ?? "Contact"}</p><p className="mt-2 rounded-lg bg-black/20 p-3 text-sm text-[#B7BDC7]">{payload?.body ?? "Action préparée"}</p><p className="mt-2 text-xs text-[#E2C486]">{payload?.channel ?? action.type} · PRÉPARÉ, NON ENVOYÉ</p></CardBody></Card>; })}</div></section> : null}

      <section><SectionLabel tone="night" className="mb-3">Conversation récente</SectionLabel><Card tone="night"><div className="divide-y divide-white/10">{cockpit.messages.length ? cockpit.messages.map((message) => <div key={message.id} className={`p-4 ${message.direction === "outbound" ? "bg-[#D87526]/[0.04]" : ""}`}><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase text-[#C9A76A]">{message.direction === "outbound" ? "ENDVERA" : "Vous"}</p><p className="font-mono text-[10px] uppercase text-[#6F7680]">{message.channel} · {message.status}</p></div><p className="mt-2 whitespace-pre-line text-sm text-[#D7DAE0]">{message.originalBody}</p></div>) : <p className="p-4 text-sm text-[#8A9099]">Commencez la conversation ci-dessus.</p>}</div></Card></section>

      <section><SectionLabel tone="night" className="mb-3">Connecteurs</SectionLabel><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cockpit.connectors.map((connector) => <Card key={connector.id} tone="night"><CardBody><div className="flex items-center justify-between gap-3"><p className="font-semibold">{connector.id.replaceAll("_", " ")}</p><span className={`rounded-full px-2 py-1 font-mono text-[10px] ${connector.status === "LOCAL_READY" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.06] text-[#A1A8B3]"}`}>{connector.status}</span></div><p className="mt-2 text-xs text-[#8A9099]">{connector.note}</p></CardBody></Card>)}</div></section>
    </div>
  );
}
