import { useEffect } from "react";
import { Text } from "react-native";
import { Button, Card, Empty, Heading, Label, Loading, Notice, Screen, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

const HEALTH = { HEALTHY: "Stable", ATTENTION: "À surveiller", BLOCKED: "Intervention requise", UNKNOWN: "Preuve insuffisante" } as const;
const METRICS: Record<string, string> = { OPEN_ALERTS: "Alertes", STALE_QUEUE_ITEMS: "Travail bloqué", RECOVERIES: "Reprises", RESTORE_DRILLS: "Restaurations", LOAD_GATES: "Gates" };

export default function ReliabilityScreen() {
  const { activeWorkspace, reliabilityCockpit, reliabilityLoadState, publicError, loadReliability, submitReliabilityCommand } = useMobileSession();
  useEffect(() => {
    if (!activeWorkspace || reliabilityLoadState !== "IDLE") return;
    void loadReliability();
  }, [activeWorkspace, loadReliability, reliabilityLoadState]);

  if (reliabilityCockpit?.role === "FIELD_WORKER") return <Screen><Heading eyebrow="FIABILITÉ" title="Ce qui demande ton attention" body="Aucun état global, connecteur ou détail de reprise n’est exposé sur le terrain." />{reliabilityCockpit.interruptions.length ? reliabilityCockpit.interruptions.map((item) => <Card key={item.id}><Text style={sharedStyles.name}>{item.nextAction}</Text><Text style={sharedStyles.muted}>{item.status}</Text></Card>) : <Card><Empty>Aucune interruption assignée.</Empty></Card>}</Screen>;
  const prepared = reliabilityCockpit?.recoveries.filter((recovery) => recovery.status === "PREPARED") ?? [];
  return <Screen>
    <Heading eyebrow="FIABILITÉ ET REPRISE" title={reliabilityCockpit ? HEALTH[reliabilityCockpit.health] : "État opérationnel"} body="Mesures PostgreSQL, reprises versionnées et zéro effet fournisseur." />
    {reliabilityLoadState === "LOADING" ? <Loading label="État canonique en lecture…" /> : null}
    {publicError ? <Notice danger>{publicError}</Notice> : null}
    {reliabilityCockpit ? <>
      <Button onPress={() => void submitReliabilityCommand({ schemaVersion: 1, action: "SCAN_WORKSPACE", commandId: globalThis.crypto.randomUUID(), workspaceId: reliabilityCockpit.workspace.id })}>Inspecter maintenant</Button>
      <Label>Mesures</Label>
      {reliabilityCockpit.metrics.map((metric) => <Card key={metric.key}><Text style={sharedStyles.name}>{METRICS[metric.key] ?? metric.key}</Text><Text style={sharedStyles.muted}>{metric.numerator}/{metric.denominator} · preuve {metric.evidenceLabel.toLowerCase()}</Text></Card>)}
      <Label>Alertes</Label>
      {reliabilityCockpit.alerts.length === 0 ? <Card><Empty>Aucune alerte.</Empty></Card> : reliabilityCockpit.alerts.map((alert) => <Card key={alert.id}><Text style={sharedStyles.name}>{alert.alertType === "FOLLOW_UP_STALE" ? "Suivi en retard" : "Connecteur incertain"}</Text><Text style={sharedStyles.muted}>{alert.status} · responsable {alert.nextResponsibleRole}</Text>{alert.status === "OPEN" ? <Button tone="secondary" onPress={() => void submitReliabilityCommand({ schemaVersion: 1, action: "ACKNOWLEDGE_ALERT", commandId: globalThis.crypto.randomUUID(), workspaceId: reliabilityCockpit.workspace.id, alertId: alert.id, expectedAlertVersion: alert.stateVersion, reasonCode: "OWNER_REVIEWED" })}>Reconnaître</Button> : null}{alert.status !== "RESOLVED" ? <Button onPress={() => void submitReliabilityCommand({ schemaVersion: 1, action: "PREPARE_RECOVERY", commandId: globalThis.crypto.randomUUID(), workspaceId: reliabilityCockpit.workspace.id, alertId: alert.id, expectedAlertVersion: alert.stateVersion, queueKind: alert.resourceType === "FOLLOW_UP" ? "FOLLOW_UP_DUE" : "CONNECTOR_PREPARED", itemId: alert.resourceId, expectedItemVersion: alert.resourceVersion, recoveryAction: alert.resourceType === "FOLLOW_UP" ? "REQUEUE_LOCAL" : "QUARANTINE" })}>Préparer la reprise</Button> : null}</Card>)}
      <Label>Reprises préparées</Label>
      {prepared.length === 0 ? <Card><Empty>Aucune reprise en attente.</Empty></Card> : prepared.map((recovery) => <Card key={recovery.id}><Text style={sharedStyles.name}>{recovery.queueKind === "FOLLOW_UP_DUE" ? "Rejouer le suivi local" : "Quarantaine sans envoi"}</Text><Text style={sharedStyles.muted}>{recovery.replayClass}</Text><Button onPress={() => void submitReliabilityCommand({ schemaVersion: 1, action: "APPLY_RECOVERY", commandId: globalThis.crypto.randomUUID(), workspaceId: reliabilityCockpit.workspace.id, recoveryOperationId: recovery.id, expectedRecoveryVersion: recovery.stateVersion })}>Appliquer exactement</Button></Card>)}
      <Label>Preuves de reprise</Label>
      <Card><Text style={sharedStyles.name}>Checkpoint</Text><Text style={sharedStyles.muted}>{reliabilityCockpit.latestCheckpoint ? `${reliabilityCockpit.latestCheckpoint.totalRows} lignes · ${reliabilityCockpit.latestCheckpoint.tableCount} tables` : "Non créé"}</Text></Card>
      <Card><Text style={sharedStyles.name}>Restauration</Text><Text style={sharedStyles.muted}>{reliabilityCockpit.latestRestoreDrill?.status ?? "Non exécutée"}</Text></Card>
    </> : null}
  </Screen>;
}
