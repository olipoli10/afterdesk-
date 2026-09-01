import { Text, View } from "react-native";
import { Card, Empty, Heading, Label, Screen, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

export default function ProjectsScreen() {
  const { cockpit, activeWorkspace } = useMobileSession();
  return (
    <Screen>
      <Heading
        eyebrow="ÉTAT OPÉRATIONNEL"
        title="Chantiers"
        body="Le serveur garde l’état canonique. L’app affiche seulement une projection validée."
      />
      {!activeWorkspace ? (
        <Card><Empty>Aucun espace Construction actif.</Empty></Card>
      ) : cockpit?.projects.length ? (
        cockpit.projects.map((project) => (
          <Card key={project.id}>
            <Label>{project.code}</Label>
            <Text style={sharedStyles.name}>{project.name}</Text>
            <View style={sharedStyles.row}>
              <Text style={sharedStyles.muted}>{project._count.contacts} contact(s)</Text>
              <Text style={sharedStyles.muted}>{project._count.calendarItems} calendrier</Text>
              <Text style={sharedStyles.muted}>{project._count.openLoops} boucle(s)</Text>
            </View>
          </Card>
        ))
      ) : (
        <Card><Empty>Aucun chantier actif.</Empty></Card>
      )}
    </Screen>
  );
}
