import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { OpenLoopControls } from "@/components/construction-operating-assistant-r0/open-loop-controls";
import { Card, CardBody, PageTitle, SectionLabel } from "@/components/ui";
import { requireRole } from "@/lib/authz";
import { clientPortalLangOf } from "@/lib/i18n/client-portal";
import { CONSTRUCTION_ASSISTANT_I18N } from "@/lib/i18n/construction-assistant-v1";
import { projectOpenLoopsForUser } from "@/server/construction-operating-assistant-r0/open-loops";
import { constructionProjectForUser } from "@/server/construction-assistant-v1/workspace";

const STATUS_COPY = {
  OPEN: "Ouvert",
  WAITING_FOR_EVIDENCE: "Preuve manquante",
  WAITING_FOR_VERIFICATION: "Vérification requise",
  READY_TO_INVOICE: "Prêt à facturer",
  CLOSED: "Fermé",
  REVOKED: "Révoqué",
} as const;

const REQUIREMENT_COPY: Record<string, string> = {
  PROJECT_ASSOCIATION: "chantier confirmé",
  WORK_DESCRIPTION: "description du travail",
  AMOUNT: "montant de l’extra",
  COMPLETION_ASSERTION: "confirmation du travail terminé",
  APPROVAL_STATE: "état de l’approbation",
  WRITTEN_APPROVAL: "approbation écrite",
  SUPPORTING_EVIDENCE: "photo ou document du travail",
};

const NEXT_ACTION_COPY: Record<string, string> = {
  CLARIFY_PROJECT_OR_FINANCIALS: "Le bureau doit clarifier le chantier ou le montant.",
  OBTAIN_WRITTEN_APPROVAL: "Le bureau doit obtenir l’approbation écrite.",
  SUPPLY_FIELD_EVIDENCE: "La personne sur le chantier doit fournir une photo ou un document.",
  VERIFY_OR_RESOLVE: "Une personne autorisée doit vérifier ou résoudre la contradiction.",
  PREPARE_INVOICE: "Le bureau peut maintenant préparer la facture.",
};

export default async function ConstructionProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireRole("CLIENT");
  const copy = CONSTRUCTION_ASSISTANT_I18N[
    clientPortalLangOf((await headers()).get("x-site-lang"))
  ];
  const { projectId } = await params;
  const project = await constructionProjectForUser(user.id, projectId);
  if (!project) notFound();
  const loops = await projectOpenLoopsForUser({
    userId: user.id,
    workspaceId: project.workspaceId,
    projectId: project.id,
  });
  const contactOptions = project.contacts.map((contact) => ({
    id: contact.id,
    displayName: contact.displayName,
    hasSms: Boolean(contact.normalizedPhone),
    hasEmail: Boolean(contact.normalizedEmail),
  }));

  return (
    <div className="space-y-6 text-[#F7F6F3]">
      <PageTitle
        tone="night"
        title={project.name}
        sub={`${project.code} · ${project.address ?? "Adresse non fournie"}`}
      />

      <section>
        <SectionLabel tone="night" className="mb-3">
          Dossiers à fermer
        </SectionLabel>
        {loops.length === 0 ? (
          <Card tone="night">
            <CardBody>
              <p className="font-semibold">Aucun résultat en attente.</p>
              <p className="mt-2 text-sm text-[#A1A8B3]">
                Dites à ENDVERA que du travail est terminé. Il ouvrira le dossier, montrera les
                preuves manquantes et gardera le prochain responsable visible.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-4">
            {loops.map((loop) => (
              <Card key={loop.loopId} tone="night">
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-wider text-[#C9A76A]">
                        Facturation d’extra · version {loop.stateVersion}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold">{STATUS_COPY[loop.status]}</h2>
                      <p className="mt-2 text-sm text-[#B7BDC7]">
                        {NEXT_ACTION_COPY[loop.nextAction] ?? loop.nextAction}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-right">
                      <p className="text-xs uppercase text-[#8A9099]">Montant connu</p>
                      <p className="mt-1 text-lg font-semibold text-[#E2C486]">
                        {"amountMinor" in loop
                          ? loop.amountMinor === null
                            ? "Inconnu"
                            : new Intl.NumberFormat("fr-CA", {
                                style: "currency",
                                currency: loop.currency ?? "CAD",
                              }).format(loop.amountMinor / 100)
                          : "Masqué pour ce rôle"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-white/10 p-4">
                      <p className="text-xs uppercase tracking-wider text-[#8A9099]">Il manque</p>
                      {loop.missing.length === 0 ? (
                        <p className="mt-2 text-sm text-[#8FD3A7]">Rien.</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-sm text-[#FFCB7A]">
                          {loop.missing.map((item) => (
                            <li key={item}>• {REQUIREMENT_COPY[item] ?? item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="rounded-lg border border-white/10 p-4">
                      <p className="text-xs uppercase tracking-wider text-[#8A9099]">Preuves reçues</p>
                      {loop.evidence.length === 0 ? (
                        <p className="mt-2 text-sm text-[#A1A8B3]">Aucune.</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-sm text-[#B7BDC7]">
                          {loop.evidence.map((item) => (
                            <li key={item.id}>
                              • {item.kind} · {item.state}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="rounded-lg border border-white/10 p-4">
                      <p className="text-xs uppercase tracking-wider text-[#8A9099]">Contradictions</p>
                      <p
                        className={`mt-2 text-sm ${loop.contradictionCount ? "text-[#FF9A8B]" : "text-[#8FD3A7]"}`}
                      >
                        {loop.contradictionCount
                          ? `${loop.contradictionCount} contradiction(s) à résoudre.`
                          : "Aucune contradiction ouverte."}
                      </p>
                    </div>
                  </div>

                  {loop.preparedActions.length ? (
                    <div className="mt-4 rounded-lg border border-[#C9A76A]/30 bg-[#C9A76A]/5 p-4">
                      <p className="font-semibold text-[#E2C486]">Suivi préparé — non envoyé</p>
                      <p className="mt-1 text-sm text-[#A1A8B3]">
                        Aucun SMS, courriel ou autre transport externe n’a été exécuté.
                      </p>
                    </div>
                  ) : null}

                  {loop.canManageEvidence && loop.status !== "CLOSED" && loop.status !== "REVOKED" ? (
                    <OpenLoopControls
                      workspaceId={project.workspaceId}
                      projectId={project.id}
                      loopId={loop.loopId}
                      stateVersion={loop.stateVersion}
                      contacts={contactOptions}
                    />
                  ) : null}

                  <details className="mt-5 border-t border-white/10 pt-4 text-xs text-[#8A9099]">
                    <summary className="cursor-pointer">Voir l’historique et la preuve de décision</summary>
                    <div className="mt-3 space-y-2">
                      {loop.transitions.map((transition) => (
                        <p key={transition.id}>
                          v{transition.nextVersion} · {transition.nextStatus} ·{" "}
                          {transition.reasonCodes.join(", ")}
                        </p>
                      ))}
                      <p className="break-all font-mono">Décision: {loop.decisionHash}</p>
                    </div>
                  </details>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <SectionLabel tone="night" className="mb-3">
            {copy.contacts}
          </SectionLabel>
          <Card tone="night">
            <div className="divide-y divide-white/10">
              {project.contacts.map((contact) => (
                <div key={contact.id} className="p-4">
                  <p className="font-medium">{contact.displayName}</p>
                  <p className="mt-1 text-sm text-[#A1A8B3]">
                    {contact.role ?? "Rôle non précisé"} · canal configuré:{" "}
                    {contact.normalizedPhone ? "SMS" : contact.normalizedEmail ? "courriel" : "aucun"}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </section>
        <section>
          <SectionLabel tone="night" className="mb-3">
            {copy.schedule}
          </SectionLabel>
          <Card tone="night">
            <CardBody className="space-y-3">
              {project.calendarItems.length ? (
                project.calendarItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-white/10 p-3">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-sm text-[#A1A8B3]">
                      {new Intl.DateTimeFormat("fr-CA", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: item.timezone,
                      }).format(item.startsAt)}{" "}
                      · {item.verificationState === "proposed" ? "Proposé" : "Vérifié"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#A1A8B3]">Aucun élément.</p>
              )}
            </CardBody>
          </Card>
        </section>
      </div>
    </div>
  );
}
