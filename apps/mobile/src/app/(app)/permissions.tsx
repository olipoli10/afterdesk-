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
    publicError,
    loadPermissions,
    revokePermission,
  } = useMobileSession();

  useEffect(() => {
    if (!activeWorkspace || permissionLoadState !== "IDLE") return;
    void loadPermissions();
  }, [activeWorkspace, loadPermissions, permissionLoadState]);

  return (
    <Screen>
      <Heading
        eyebrow="AUTORITÉ"
        title="Permissions et connecteurs"
        body="Vois ce qu’ENDVERA peut réellement faire. Les fournisseurs externes restent désactivés."
      />
      {permissionLoadState === "LOADING" ? <Loading label="Permissions en lecture…" /> : null}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  role: { color: "#d68a42", fontFamily: "monospace", fontSize: 12 },
  grant: { gap: 7, borderTopWidth: 1, borderTopColor: "#353137", paddingTop: 12 },
});
