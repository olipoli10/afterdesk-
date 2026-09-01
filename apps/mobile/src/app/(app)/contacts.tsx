import { Text } from "react-native";
import { Card, Empty, Heading, Label, Screen, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

export default function ContactsScreen() {
  const { cockpit } = useMobileSession();
  return (
    <Screen>
      <Heading
        eyebrow="RÉPERTOIRE DU CHANTIER"
        title="Contacts"
        body="ENDVERA relie chaque personne au bon chantier. Les coordonnées privées suivent les permissions du rôle."
      />
      {cockpit?.contacts.length ? (
        cockpit.contacts.map((contact) => (
          <Card key={contact.id}>
            <Label>{contact.project?.code ?? "GÉNÉRAL"}</Label>
            <Text style={sharedStyles.name}>{contact.displayName}</Text>
            <Text style={sharedStyles.muted}>
              {[contact.role, contact.companyName].filter(Boolean).join(" · ") || "Contact du chantier"}
            </Text>
            {"normalizedPhone" in contact && typeof contact.normalizedPhone === "string" ? (
              <Text selectable style={sharedStyles.value}>{contact.normalizedPhone}</Text>
            ) : null}
            {"normalizedEmail" in contact && typeof contact.normalizedEmail === "string" ? (
              <Text selectable style={sharedStyles.muted}>{contact.normalizedEmail}</Text>
            ) : null}
          </Card>
        ))
      ) : (
        <Card><Empty>Aucun contact actif.</Empty></Card>
      )}
    </Screen>
  );
}
