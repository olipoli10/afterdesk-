import { Text, View } from "react-native";
import { Card, Empty, Heading, Label, Screen, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

export default function ActionsScreen() {
  const { cockpit, activeWorkspace } = useMobileSession();
  return (
    <Screen>
      <Heading
        eyebrow="CONTRÔLE HUMAIN"
        title="Actions préparées"
        body="Une action affichée ici n’est pas un envoi. Le transport externe demeure désactivé."
      />
      {activeWorkspace?.permissions.externalTransportAuthorized === false ? (
        <Card>
          <Label>Sécurité</Label>
          <Text style={sharedStyles.success}>Aucun SMS, courriel ou appel externe autorisé.</Text>
        </Card>
      ) : null}
      {cockpit?.actions.length ? cockpit.actions.map((action) => (
        <Card key={action.id}>
          <View style={sharedStyles.row}>
            <Label>{action.status}</Label>
            <Text style={sharedStyles.muted}>{action.type}</Text>
          </View>
          <Text style={sharedStyles.name}>{action.project?.name ?? "Action générale"}</Text>
          <Text style={sharedStyles.muted}>{action.contact?.displayName ?? "Aucun contact"}</Text>
        </Card>
      )) : <Card><Empty>Aucune action préparée.</Empty></Card>}
    </Screen>
  );
}
