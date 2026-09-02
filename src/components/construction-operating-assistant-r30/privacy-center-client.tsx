"use client";

import { useState } from "react";
import type { PrivacyCockpit, PrivacyCommand } from "@/lib/construction-operating-assistant-r30/contracts";
import { getEndveraMobileResource, postEndveraMobileResource } from "@/lib/browser/endvera-mobile-api";

const CLASS_LABEL: Record<string, string> = {
  IDENTITY: "Identités et contacts", COMMUNICATION: "Communications", PROJECT_STATE: "État des chantiers",
  EVIDENCE: "Preuves", FINANCIAL: "Finances", CONNECTOR_METADATA: "Connecteurs", AUDIT: "Historique d’audit", HUMAN_WORK: "Appui humain",
};

export function PrivacyCenterClient({ initial }: { initial: PrivacyCockpit }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    setSnapshot(await getEndveraMobileResource<PrivacyCockpit>("privacy", snapshot.workspace.id));
  };

  const submit = async (command: PrivacyCommand, confirmation: string) => {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      await postEndveraMobileResource("privacy", command);
      await refresh();
      setMessage(confirmation);
    } catch {
      setMessage("L’action a été refusée ou l’état a changé. Recharge la page avant de réessayer.");
    } finally {
      setPending(false);
    }
  };

  if (snapshot.role === "FIELD_WORKER") return (
    <section className="space-y-4 text-[#F7F6F3]">
      <header><p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D6B878]">Confidentialité</p><h1 className="mt-2 text-3xl font-semibold">Ton accès seulement</h1></header>
      <div className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5"><p>Accès aux chantiers assignés.</p><p className="mt-2 text-sm text-[#A1A8B3]">Tu ne vois ni finances, ni politiques de conservation, ni identifiants techniques.</p></div>
    </section>
  );

  const active = snapshot.activePolicy;
  const draft = snapshot.policyHistory.find((policy) => policy.status === "DRAFT");
  const owner = snapshot.role === "OWNER";
  return (
    <div className="space-y-6 text-[#F7F6F3]">
      <header><p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D6B878]">Confidentialité</p><h1 className="mt-2 text-3xl font-semibold">Contrôle des données</h1><p className="mt-2 text-[#A1A8B3]">{snapshot.workspace.name} · état local canonique · aucun fournisseur contacté.</p></header>
      {message ? <p className="rounded-xl border border-[#5A4A33] bg-[#171513] p-4 text-sm">{message}</p> : null}
      <section className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Politique de conservation</h2><p className="mt-1 text-sm text-[#A1A8B3]">{active ? `Version ${active.version} active · ${active.rules.length} catégories` : draft ? `Version ${draft.version} prête à vérifier` : "Aucune politique active"}</p></div>
          {owner && !active && !draft ? <button disabled={pending} className="rounded-lg border border-[#8B5A35] px-4 py-2 disabled:opacity-40" onClick={() => void submit({ schemaVersion: 1, action: "CREATE_POLICY_DRAFT", commandId: crypto.randomUUID(), workspaceId: snapshot.workspace.id, sourcePolicySetId: null, expectedSourceStateVersion: null }, "Brouillon complet créé localement.")}>Créer la politique sécuritaire</button> : null}
          {owner && draft ? <button disabled={pending} className="rounded-lg border border-[#8B5A35] px-4 py-2 disabled:opacity-40" onClick={() => void submit({ schemaVersion: 1, action: "ACTIVATE_POLICY_SET", commandId: crypto.randomUUID(), workspaceId: snapshot.workspace.id, policySetId: draft.id, expectedStateVersion: draft.stateVersion, expectedPolicyHash: draft.policyHash }, "Version exacte activée localement.")}>Activer la version exacte</button> : null}
          {owner && active ? <button disabled={pending} className="rounded-lg border border-[#8B5A35] px-4 py-2 disabled:opacity-40" onClick={() => void submit({ schemaVersion: 1, action: "PREPARE_EXPORT_MANIFEST", commandId: crypto.randomUUID(), workspaceId: snapshot.workspace.id, expectedPolicySetId: active.id, expectedPolicySetVersion: active.version }, "Manifeste minimisé préparé. Aucun fichier externe n’a été créé.")}>Préparer l’inventaire exportable</button> : null}
        </div>
      </section>
      <section className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5"><h2 className="text-xl font-semibold">Inventaire par catégorie</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{snapshot.inventory.map((item) => <div key={item.dataClass} className="rounded-xl border border-[#2E3035] p-4"><p className="font-medium">{CLASS_LABEL[item.dataClass] ?? item.dataClass}</p><p className="mt-1 text-sm text-[#A1A8B3]">{item.recordCount} enregistrement(s) · {item.retentionDays} jours · {item.deletionMode}</p></div>)}</div></section>
      <section className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5"><h2 className="text-xl font-semibold">Preuves et suppressions locales</h2><p className="mt-2 text-sm text-[#A1A8B3]">{snapshot.evidenceLifecycle.active} actives · {snapshot.evidenceLifecycle.held} protégées · {snapshot.evidenceLifecycle.tombstoned} tombstone(s) · {snapshot.evidenceLifecycle.externalDeletionPending} suppression(s) externe(s) non prouvée(s).</p><div className="mt-4 space-y-3">{snapshot.deletionCandidates.length === 0 ? <p className="text-[#A1A8B3]">Aucune preuve admissible à inspecter.</p> : snapshot.deletionCandidates.map((candidate) => <div key={`${candidate.targetType}:${candidate.targetId}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2E3035] p-4"><div><p className="font-mono text-sm">{candidate.targetType}</p><p className="text-xs text-[#A1A8B3]">{candidate.held ? "Protection active" : candidate.retentionEligible ? "Admissible à une demande locale" : "Période de conservation active"}{candidate.activeRequestStatus ? ` · ${candidate.activeRequestStatus}` : ""}</p></div>{owner && active && !candidate.activeRequestStatus ? <button disabled={pending} className="rounded-lg border border-[#45484F] px-3 py-2 text-xs disabled:opacity-40" onClick={() => void submit({ schemaVersion: 1, action: "REQUEST_DELETION", commandId: crypto.randomUUID(), workspaceId: snapshot.workspace.id, expectedPolicySetId: active.id, expectedPolicySetVersion: active.version, targetType: candidate.targetType, targetId: candidate.targetId }, "Demande évaluée localement. Rien n’a été supprimé à l’extérieur.")}>Évaluer la suppression</button> : null}</div>)}</div>
        <div className="mt-5 space-y-3">{snapshot.deletionRequests.map((request) => <div key={request.id} className="rounded-xl border border-[#2E3035] p-4"><p className="font-medium">{request.targetType} · {request.status}</p><p className="mt-1 text-xs text-[#A1A8B3]">{request.reasonCodes.length ? request.reasonCodes.join(" · ") : "Aucun blocage détecté"}</p>{owner && request.status === "ELIGIBLE" ? <button disabled={pending} className="mt-3 rounded-lg border border-[#8B5A35] px-3 py-2 text-xs disabled:opacity-40" onClick={() => void submit({ schemaVersion: 1, action: "APPROVE_DELETION", commandId: crypto.randomUUID(), workspaceId: snapshot.workspace.id, deletionRequestId: request.id, expectedStateVersion: request.stateVersion, expectedEligibilityFingerprint: request.eligibilityFingerprint }, "Tombstone local créé. La suppression externe demeure en attente et non prouvée.")}>Approuver exactement le tombstone local</button> : null}</div>)}</div></section>
      <section className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5"><h2 className="text-xl font-semibold">Secrets et export</h2><p className="mt-2 text-sm text-[#A1A8B3]">{snapshot.secretLifecycle.opaqueReference} référence(s) opaque(s) · {snapshot.secretLifecycle.revoked} révoquée(s) localement · 0 révocation externe vérifiée.</p><p className="mt-2 text-sm text-[#A1A8B3]">{snapshot.exportManifests.length} manifeste(s) minimisé(s). Aucun contenu brut, secret ou clé de stockage n’est affiché.</p></section>
    </div>
  );
}
