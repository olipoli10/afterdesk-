import { Text } from "react-native";
import { Button, Card, Empty, Heading, Label, Screen, sharedStyles } from "@/components/ui";
import { MOBILE_RELEASE_INFO } from "@/lib/release";
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
      <Card>
        <Label>Version locale</Label>
        <Text style={sharedStyles.name}>{MOBILE_RELEASE_INFO.semanticVersion}</Text>
        <Text style={sharedStyles.muted}>iOS {MOBILE_RELEASE_INFO.ios.buildNumber} · Android {MOBILE_RELEASE_INFO.android.versionCode}</Text>
        <Text style={sharedStyles.muted}>Confidentialité : {MOBILE_RELEASE_INFO.publicPaths.privacy}</Text>
        <Text style={sharedStyles.muted}>Sécurité : {MOBILE_RELEASE_INFO.publicPaths.security}</Text>
        <Text style={sharedStyles.muted}>Appui : {MOBILE_RELEASE_INFO.publicPaths.support}</Text>
        <Text style={sharedStyles.muted}>Paquet local seulement · ni signé, ni publié, ni déployé.</Text>
      </Card>
      <Button tone="secondary" onPress={signOut}>Fermer la session</Button>
    </Screen>
  );
}
