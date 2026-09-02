import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, Empty, Heading, Label, Loading, Notice, Screen, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

const CLASS_LABEL: Record<string, string> = {
  IDENTITY: "Identités", COMMUNICATION: "Communications", PROJECT_STATE: "Chantiers", EVIDENCE: "Preuves",
  FINANCIAL: "Finances", CONNECTOR_METADATA: "Connecteurs", AUDIT: "Audit", HUMAN_WORK: "Appui humain",
};

export default function PrivacyScreen() {
  const { activeWorkspace, privacyCockpit, privacyLoadState, publicError, loadPrivacy, submitPrivacyCommand } = useMobileSession();
  useEffect(() => {
    if (!activeWorkspace || privacyLoadState !== "IDLE") return;
    void loadPrivacy();
  }, [activeWorkspace, loadPrivacy, privacyLoadState]);

  if (privacyCockpit?.role === "FIELD_WORKER") return <Screen><Heading eyebrow="CONFIDENTIALITÉ" title="Ton accès seulement" body="Tu vois uniquement tes chantiers assignés. Les finances et politiques restent privées." /><Card><Text style={sharedStyles.name}>Accès terrain actif</Text><Text style={sharedStyles.muted}>Aucun secret, montant ou identifiant de preuve n’est exposé.</Text></Card></Screen>;
  const active = privacyCockpit?.activePolicy ?? null;
  const draft = privacyCockpit?.policyHistory.find((policy) => policy.status === "DRAFT") ?? null;
  const owner = activeWorkspace?.role === "OWNER";
  return (
    <Screen>
      <Heading eyebrow="CONFIDENTIALITÉ" title="Contrôle des données" body="Conservation, export minimisé et suppression locale. Aucun fournisseur n’est contacté." />
      {privacyLoadState === "LOADING" ? <Loading label="État de confidentialité en lecture…" /> : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {privacyCockpit ? <>
        <Label>Politique</Label>
        <Card>
          <Text style={sharedStyles.name}>{active ? `Version ${active.version} active` : draft ? `Version ${draft.version} prête à activer` : "Aucune politique active"}</Text>
          <Text style={sharedStyles.muted}>Les commandes sont versionnées, rejouables exactement et sans effet externe.</Text>
          {owner && !active && !draft ? <Button onPress={() => void submitPrivacyCommand({ schemaVersion: 1, action: "CREATE_POLICY_DRAFT", commandId: globalThis.crypto.randomUUID(), workspaceId: privacyCockpit.workspace.id, sourcePolicySetId: null, expectedSourceStateVersion: null })}>Créer la politique sécuritaire</Button> : null}
          {owner && draft ? <Button onPress={() => void submitPrivacyCommand({ schemaVersion: 1, action: "ACTIVATE_POLICY_SET", commandId: globalThis.crypto.randomUUID(), workspaceId: privacyCockpit.workspace.id, policySetId: draft.id, expectedStateVersion: draft.stateVersion, expectedPolicyHash: draft.policyHash })}>Activer la version exacte</Button> : null}
          {owner && active ? <Button onPress={() => void submitPrivacyCommand({ schemaVersion: 1, action: "PREPARE_EXPORT_MANIFEST", commandId: globalThis.crypto.randomUUID(), workspaceId: privacyCockpit.workspace.id, expectedPolicySetId: active.id, expectedPolicySetVersion: active.version })}>Préparer le manifeste exportable</Button> : null}
        </Card>
        <Label>Inventaire</Label>
        {privacyCockpit.inventory.map((item) => <Card key={item.dataClass}><Text style={sharedStyles.name}>{CLASS_LABEL[item.dataClass] ?? item.dataClass}</Text><Text style={sharedStyles.muted}>{item.recordCount} enregistrement(s) · {item.retentionDays} jours · {item.deletionMode}</Text></Card>)}
        <Label>Preuves</Label>
        <Card><Text style={sharedStyles.name}>{privacyCockpit.evidenceLifecycle.active} actives · {privacyCockpit.evidenceLifecycle.held} protégées</Text><Text style={sharedStyles.muted}>{privacyCockpit.evidenceLifecycle.tombstoned} tombstone(s) local(aux) · {privacyCockpit.evidenceLifecycle.externalDeletionPending} suppression(s) externe(s) non prouvée(s)</Text></Card>
        {privacyCockpit.deletionCandidates.length === 0 ? <Card><Empty>Aucune preuve à inspecter.</Empty></Card> : null}
        {privacyCockpit.deletionCandidates.map((candidate) => <Card key={`${candidate.targetType}:${candidate.targetId}`}><Text style={sharedStyles.name}>{candidate.targetType}</Text><Text style={sharedStyles.muted}>{candidate.held ? "Protection active" : candidate.retentionEligible ? "Admissible à une demande locale" : "Conservation active"}{candidate.activeRequestStatus ? ` · ${candidate.activeRequestStatus}` : ""}</Text>{owner && active && !candidate.activeRequestStatus ? <Button tone="secondary" onPress={() => void submitPrivacyCommand({ schemaVersion: 1, action: "REQUEST_DELETION", commandId: globalThis.crypto.randomUUID(), workspaceId: privacyCockpit.workspace.id, expectedPolicySetId: active.id, expectedPolicySetVersion: active.version, targetType: candidate.targetType, targetId: candidate.targetId })}>Évaluer la suppression</Button> : null}</Card>)}
        <Label>Demandes</Label>
        {privacyCockpit.deletionRequests.length === 0 ? <Card><Empty>Aucune demande.</Empty></Card> : null}
        {privacyCockpit.deletionRequests.map((request) => <Card key={request.id}><Text style={sharedStyles.name}>{request.targetType} · {request.status}</Text><Text style={sharedStyles.muted}>{request.reasonCodes.length ? request.reasonCodes.join(" · ") : "Aucun blocage"}</Text>{owner && request.status === "ELIGIBLE" ? <Button onPress={() => void submitPrivacyCommand({ schemaVersion: 1, action: "APPROVE_DELETION", commandId: globalThis.crypto.randomUUID(), workspaceId: privacyCockpit.workspace.id, deletionRequestId: request.id, expectedStateVersion: request.stateVersion, expectedEligibilityFingerprint: request.eligibilityFingerprint })}>Approuver le tombstone local exact</Button> : null}</Card>)}
        <Label>Secrets</Label>
        <Card><View style={styles.row}><Text style={sharedStyles.value}>Références opaques</Text><Text style={styles.value}>{privacyCockpit.secretLifecycle.opaqueReference}</Text></View><View style={styles.row}><Text style={sharedStyles.value}>Révocations externes vérifiées</Text><Text style={styles.value}>0</Text></View></Card>
      </> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, value: { color: "#d6b878", fontFamily: "monospace" } });
