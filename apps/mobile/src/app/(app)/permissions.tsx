import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, Empty, Heading, Label, Loading, Notice, Screen, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

const STATE_LABEL = {
  INTERNAL: "Interne et actif",
  PREPARED_DISABLED: "Préparé, externe désactivé",
  GRANTED_LOCAL: "Accordé localement",
  REVOKED: "Révoqué",
} as const;

export default function PermissionsScreen() {
  const {
    activeWorkspace,
    permissionCenter,
    permissionLoadState,
    authorityCockpit,
    authorityLoadState,
    publicError,
    loadPermissions,
    loadAuthority,
    revokePermission,
    submitAuthorityCommand,
  } = useMobileSession();

  useEffect(() => {
    if (!activeWorkspace || permissionLoadState !== "IDLE") return;
    void loadPermissions();
  }, [activeWorkspace, loadPermissions, permissionLoadState]);

  useEffect(() => {
    if (!activeWorkspace || authorityLoadState !== "IDLE") return;
    void loadAuthority();
  }, [activeWorkspace, authorityLoadState, loadAuthority]);

  return (
    <Screen>
      <Heading
        eyebrow="AUTORITÉ"
        title="Permissions et connecteurs"
        body="Vois ce qu’ENDVERA peut réellement faire. Les fournisseurs externes restent désactivés."
      />
      {permissionLoadState === "LOADING" ? <Loading label="Permissions en lecture…" /> : null}
      {authorityLoadState === "LOADING" ? <Loading label="Politique d’autorité en lecture…" /> : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {permissionCenter ? (
        <>
          <Label>Ton accès effectif</Label>
          {permissionCenter.capabilities.map((capability) => (
            <Card key={capability.key}>
              <Text style={sharedStyles.name}>{capability.label}</Text>
              <Text style={sharedStyles.muted}>{STATE_LABEL[capability.state]}</Text>
            </Card>
          ))}
          <Label>Équipe</Label>
          <Card>
            {permissionCenter.members.map((member) => (
              <View key={member.userId} style={styles.row}>
                <Text style={sharedStyles.value}>{member.displayName}{member.isCurrentUser ? " (toi)" : ""}</Text>
                <Text style={styles.role}>{member.role}</Text>
              </View>
            ))}
          </Card>
          {permissionCenter.currentUser.role !== "FIELD_WORKER" ? (
            <>
              <Label>Connecteurs</Label>
              {permissionCenter.connectors.length === 0 ? <Card><Empty>Aucun connecteur préparé.</Empty></Card> : null}
              {permissionCenter.connectors.map((connector) => (
                <Card key={connector.id}>
                  <Text style={sharedStyles.name}>{connector.label}</Text>
                  <Text style={sharedStyles.muted}>{STATE_LABEL[connector.state]}</Text>
                  {connector.grants.map((grant) => (
                    <View key={grant.id} style={styles.grant}>
                      <Text style={sharedStyles.value}>{grant.capability}</Text>
                      <Text style={sharedStyles.muted}>{STATE_LABEL[grant.state]}</Text>
                      {grant.revocable ? (
                        <Button
                          tone="secondary"
                          onPress={() => void revokePermission({
                            schemaVersion: 1,
                            action: "REVOKE_GRANT_LOCAL",
                            commandId: globalThis.crypto.randomUUID(),
                            workspaceId: permissionCenter.workspace.id,
                            accountId: connector.id,
                            grantId: grant.id,
                            expectedStateVersion: grant.stateVersion,
                          })}
                        >
                          Révoquer cette permission
                        </Button>
                      ) : null}
                    </View>
                  ))}
                  {connector.revocable ? (
                    <Button
                      onPress={() => void revokePermission({
                        schemaVersion: 1,
                        action: "REVOKE_ACCOUNT_LOCAL",
                        commandId: globalThis.crypto.randomUUID(),
                        workspaceId: permissionCenter.workspace.id,
                        accountId: connector.id,
                        expectedStateVersion: connector.stateVersion,
                      })}
                    >
                      Révoquer tout l’accès local
                    </Button>
                  ) : null}
                </Card>
              ))}
            </>
          ) : null}
        </>
      ) : null}
      {authorityCockpit ? (
        <>
          <Label>Politique d’autorité</Label>
          <Card>
            <Text style={sharedStyles.name}>Ce qu’ENDVERA peut décider</Text>
            <Text style={sharedStyles.muted}>
              {authorityCockpit.counts.policySets} version(s) · {authorityCockpit.counts.pendingApprovals} approbation(s) en attente · {authorityCockpit.counts.prohibited} refus
            </Text>
            {authorityCockpit.canManagePolicy && authorityCockpit.policySets.length === 0 ? (
              <Button onPress={() => void submitAuthorityCommand({
                schemaVersion: 1,
                action: "CREATE_POLICY_DRAFT",
                commandId: globalThis.crypto.randomUUID(),
                workspaceId: authorityCockpit.workspaceId,
                sourcePolicySetId: null,
                expectedSourceStateVersion: null,
              })}>
                Créer la politique sécuritaire
              </Button>
            ) : null}
          </Card>
          {authorityCockpit.policySets.map((policy) => (
            <Card key={policy.id}>
              <Text style={sharedStyles.name}>Version {policy.version} · {policy.status}</Text>
              <Text style={sharedStyles.muted}>{policy.rules.length} règles · empreinte {policy.policyHash.slice(0, 12)}</Text>
              {policy.rules.map((rule) => (
                <View key={rule.id} style={styles.rule}>
                  <Text style={sharedStyles.value}>{rule.actionKey}</Text>
                  <Text style={sharedStyles.muted}>{rule.outcome} · {rule.reasonCode}</Text>
                  {authorityCockpit.canManagePolicy && policy.status === "DRAFT" &&
                    (rule.actionKey === "INTERNAL_REMINDER_CREATE" || rule.actionKey === "PROJECT_FACT_CLASSIFY") &&
                    rule.outcome !== "AUTOMATIC_INTERNAL" ? (
                    <Button tone="secondary" onPress={() => void submitAuthorityCommand({
                      schemaVersion: 1,
                      action: "SET_POLICY_RULE",
                      commandId: globalThis.crypto.randomUUID(),
                      workspaceId: authorityCockpit.workspaceId,
                      policySetId: policy.id,
                      expectedStateVersion: policy.stateVersion,
                      ruleKey: rule.ruleKey,
                      actionKey: rule.actionKey,
                      projectId: rule.projectId,
                      roleScope: rule.roleScope,
                      dataClassification: rule.dataClassification,
                      outcome: "AUTOMATIC_INTERNAL",
                      amountCeilingMinor: null,
                      reasonCode: "OWNER_ENABLED_SAFE_INTERNAL",
                    })}>
                      Autoriser automatiquement en interne
                    </Button>
                  ) : null}
                </View>
              ))}
              {authorityCockpit.canManagePolicy && policy.status === "DRAFT" ? (
                <Button onPress={() => void submitAuthorityCommand({
                  schemaVersion: 1,
                  action: "ACTIVATE_POLICY_SET",
                  commandId: globalThis.crypto.randomUUID(),
                  workspaceId: authorityCockpit.workspaceId,
                  policySetId: policy.id,
                  expectedStateVersion: policy.stateVersion,
                  expectedPolicyHash: policy.policyHash,
                })}>
                  Activer cette version exacte
                </Button>
              ) : null}
              {authorityCockpit.canManagePolicy && policy.status === "ACTIVE" ? (
                <Button tone="secondary" onPress={() => void submitAuthorityCommand({
                  schemaVersion: 1,
                  action: "REVOKE_POLICY_SET",
                  commandId: globalThis.crypto.randomUUID(),
                  workspaceId: authorityCockpit.workspaceId,
                  policySetId: policy.id,
                  expectedStateVersion: policy.stateVersion,
                  expectedPolicyHash: policy.policyHash,
                })}>
                  Révoquer cette version exacte
                </Button>
              ) : null}
            </Card>
          ))}
          <Label>Décisions d’autorité</Label>
          {authorityCockpit.evaluations.length === 0 ? <Card><Empty>Aucune évaluation.</Empty></Card> : null}
          {authorityCockpit.evaluations.map((evaluation) => (
            <Card key={evaluation.id}>
              <Text style={sharedStyles.name}>{evaluation.actionKey ?? "Action interne"}</Text>
              <Text style={sharedStyles.muted}>{evaluation.outcome} · {evaluation.reasonCode}</Text>
              {activeWorkspace?.role !== "FIELD_WORKER" && evaluation.status === "PENDING_APPROVAL" &&
                evaluation.evaluationVersion && evaluation.policySetVersion && evaluation.payloadHash ? (
                <View style={styles.decisionRow}>
                  <Button onPress={() => void submitAuthorityCommand({
                    schemaVersion: 1,
                    action: "DECIDE_AUTHORITY_EVALUATION",
                    commandId: globalThis.crypto.randomUUID(),
                    workspaceId: authorityCockpit.workspaceId,
                    evaluationId: evaluation.id,
                    expectedEvaluationVersion: evaluation.evaluationVersion!,
                    expectedPolicySetVersion: evaluation.policySetVersion!,
                    expectedPayloadHash: evaluation.payloadHash!,
                    decision: "APPROVE",
                  })}>Approuver exactement</Button>
                  <Button tone="secondary" onPress={() => void submitAuthorityCommand({
                    schemaVersion: 1,
                    action: "DECIDE_AUTHORITY_EVALUATION",
                    commandId: globalThis.crypto.randomUUID(),
                    workspaceId: authorityCockpit.workspaceId,
                    evaluationId: evaluation.id,
                    expectedEvaluationVersion: evaluation.evaluationVersion!,
                    expectedPolicySetVersion: evaluation.policySetVersion!,
                    expectedPayloadHash: evaluation.payloadHash!,
                    decision: "REJECT",
                  })}>Refuser</Button>
                </View>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  role: { color: "#d68a42", fontFamily: "monospace", fontSize: 12 },
  grant: { gap: 7, borderTopWidth: 1, borderTopColor: "#353137", paddingTop: 12 },
  decisionRow: { gap: 8 },
  rule: { gap: 4, borderTopWidth: 1, borderTopColor: "#353137", paddingTop: 10 },
});
