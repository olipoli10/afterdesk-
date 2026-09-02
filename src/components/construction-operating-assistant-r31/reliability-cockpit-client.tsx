"use client";

import { useState } from "react";
import { getEndveraMobileResource, postEndveraMobileResource } from "@/lib/browser/endvera-mobile-api";
import type {
  ReliabilityCockpit,
  ReliabilityCommand,
} from "@/lib/construction-operating-assistant-r31/contracts";

const HEALTH_LABEL = { HEALTHY: "Stable", ATTENTION: "À surveiller", BLOCKED: "Intervention requise", UNKNOWN: "Preuve insuffisante" } as const;
const METRIC_LABEL: Record<string, string> = { OPEN_ALERTS: "Alertes actives", STALE_QUEUE_ITEMS: "Travail bloqué", RECOVERIES: "Reprises contrôlées", RESTORE_DRILLS: "Restaurations prouvées", LOAD_GATES: "Gates synthétiques" };

export function ReliabilityCockpitClient({ initial }: { initial: ReliabilityCockpit }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = async () => {
    setSnapshot(await getEndveraMobileResource<ReliabilityCockpit>("reliability", snapshot.workspace.id));
  };
  const submit = async (command: ReliabilityCommand, confirmation: string) => {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      await postEndveraMobileResource("reliability", command);
      await refresh();
      setMessage(confirmation);
    } catch {
      setMessage("L’action a été refusée ou l’état a changé. Recharge avant de réessayer.");
    } finally {
      setPending(false);
    }
  };

  if (snapshot.role === "FIELD_WORKER") return <section className="space-y-4 text-[#F7F6F3]"><header><p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D6B878]">Fiabilité</p><h1 className="mt-2 text-3xl font-semibold">Ce qui demande ton attention</h1></header><div className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5">{snapshot.interruptions.length ? snapshot.interruptions.map((item) => <p key={item.id}>{item.nextAction}</p>) : <p className="text-[#A1A8B3]">Aucune interruption assignée.</p>}</div></section>;

  const prepared = snapshot.recoveries.filter((recovery) => recovery.status === "PREPARED");
  return <div className="space-y-6 text-[#F7F6F3]">
    <header><p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D6B878]">Fiabilité et reprise</p><h1 className="mt-2 text-3xl font-semibold">{HEALTH_LABEL[snapshot.health]}</h1><p className="mt-2 text-[#A1A8B3]">{snapshot.workspace.name} · état PostgreSQL · aucun fournisseur observé.</p></header>
    {message ? <p className="rounded-xl border border-[#5A4A33] bg-[#171513] p-4 text-sm">{message}</p> : null}
    <section className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Inspection opérationnelle</h2><p className="mt-1 text-sm text-[#A1A8B3]">Détecte seulement les files enregistrées dans le registre fermé.</p></div><button disabled={pending} className="rounded-lg border border-[#8B5A35] px-4 py-2 disabled:opacity-40" onClick={() => void submit({ schemaVersion: 1, action: "SCAN_WORKSPACE", commandId: crypto.randomUUID(), workspaceId: snapshot.workspace.id }, "Inspection locale terminée.")}>Inspecter maintenant</button></div></section>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{snapshot.metrics.map((metric) => <div key={metric.key} className="rounded-2xl border border-[#2E3035] bg-[#151619] p-4"><p className="text-sm text-[#A1A8B3]">{METRIC_LABEL[metric.key] ?? metric.key}</p><p className="mt-2 text-2xl font-semibold">{metric.numerator}/{metric.denominator}</p><p className="mt-1 text-xs text-[#777E89]">preuve {metric.evidenceLabel.toLowerCase()}</p></div>)}</section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Alertes versionnées</h2>{snapshot.alerts.length === 0 ? <div className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5 text-[#A1A8B3]">Aucune alerte.</div> : snapshot.alerts.map((alert) => <div key={alert.id} className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-medium">{alert.alertType === "FOLLOW_UP_STALE" ? "Suivi en retard" : "Connecteur préparé sans résultat certain"}</p><p className="mt-1 text-sm text-[#A1A8B3]">{alert.status} · occurrence {alert.occurrenceCount} · prochain responsable: {alert.nextResponsibleRole}</p></div>{alert.status !== "RESOLVED" ? <div className="flex flex-wrap gap-2">{alert.status === "OPEN" ? <button disabled={pending} className="rounded-lg border border-[#45484F] px-3 py-2 text-xs" onClick={() => void submit({ schemaVersion: 1, action: "ACKNOWLEDGE_ALERT", commandId: crypto.randomUUID(), workspaceId: snapshot.workspace.id, alertId: alert.id, expectedAlertVersion: alert.stateVersion, reasonCode: "OWNER_REVIEWED" }, "Alerte reconnue exactement.")}>Reconnaître</button> : null}<button disabled={pending} className="rounded-lg border border-[#8B5A35] px-3 py-2 text-xs" onClick={() => void submit({ schemaVersion: 1, action: "PREPARE_RECOVERY", commandId: crypto.randomUUID(), workspaceId: snapshot.workspace.id, alertId: alert.id, expectedAlertVersion: alert.stateVersion, queueKind: alert.resourceType === "FOLLOW_UP" ? "FOLLOW_UP_DUE" : "CONNECTOR_PREPARED", itemId: alert.resourceId, expectedItemVersion: alert.resourceVersion, recoveryAction: alert.resourceType === "FOLLOW_UP" ? "REQUEUE_LOCAL" : "QUARANTINE" }, alert.resourceType === "FOLLOW_UP" ? "Reprise locale préparée." : "Quarantaine préparée; aucun connecteur exécuté.")}>Préparer la reprise</button></div> : null}</div></div>)}</section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Reprises préparées</h2>{prepared.length === 0 ? <div className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5 text-[#A1A8B3]">Aucune reprise en attente.</div> : prepared.map((recovery) => <div key={recovery.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#2E3035] bg-[#151619] p-5"><div><p className="font-medium">{recovery.queueKind === "FOLLOW_UP_DUE" ? "Rejouer le suivi local" : "Mettre le connecteur en quarantaine"}</p><p className="text-sm text-[#A1A8B3]">{recovery.replayClass} · responsable: {recovery.nextResponsibleRole}</p></div><button disabled={pending} className="rounded-lg border border-[#8B5A35] px-3 py-2 text-xs" onClick={() => void submit({ schemaVersion: 1, action: "APPLY_RECOVERY", commandId: crypto.randomUUID(), workspaceId: snapshot.workspace.id, recoveryOperationId: recovery.id, expectedRecoveryVersion: recovery.stateVersion }, recovery.queueKind === "FOLLOW_UP_DUE" ? "Reprise locale appliquée exactement une fois." : "Connecteur mis en quarantaine sans transport.")}>Appliquer exactement</button></div>)}</section>
    <section className="grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5"><p className="text-sm text-[#A1A8B3]">Checkpoint</p><p className="mt-2">{snapshot.latestCheckpoint ? `${snapshot.latestCheckpoint.totalRows} lignes · ${snapshot.latestCheckpoint.tableCount} tables` : "Non créé"}</p></div><div className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5"><p className="text-sm text-[#A1A8B3]">Dernière restauration</p><p className="mt-2">{snapshot.latestRestoreDrill?.status ?? "Non exécutée"}</p></div><div className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5"><p className="text-sm text-[#A1A8B3]">Dernier gate</p><p className="mt-2">{snapshot.latestGate ? `${snapshot.latestGate.status} · p95 ${snapshot.latestGate.p95LatencyMs} ms` : "Non exécuté"}</p></div></section>
  </div>;
}
