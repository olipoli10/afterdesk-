import { Text } from "react-native";
import { Button, Card, Empty, Heading, Label, Screen, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

export default function SettingsScreen() {
  const { bootstrap, activeWorkspace, signOut } = useMobileSession();
  return (
    <Screen>
      <Heading eyebrow="SESSION SÉCURISÉE" title="Compte" />
      <Card>
        <Label>Utilisateur</Label>
        {bootstrap ? (
          <>
            <Text style={sharedStyles.name}>{bootstrap.user.name}</Text>
            <Text style={sharedStyles.muted}>{bootstrap.user.email}</Text>
          </>
        ) : <Empty>Identité indisponible.</Empty>}
      </Card>
      <Card>
        <Label>Espace actif</Label>
        <Text style={sharedStyles.name}>{activeWorkspace?.name ?? "Aucun"}</Text>
        <Text style={sharedStyles.muted}>{activeWorkspace?.role ?? "—"}</Text>
      </Card>
      <Button tone="secondary" onPress={signOut}>Fermer la session</Button>
    </Screen>
  );
}
