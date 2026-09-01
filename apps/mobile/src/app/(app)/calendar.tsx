import { Text } from "react-native";
import { Card, Empty, Heading, Label, Screen, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

function displayDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export default function CalendarScreen() {
  const { cockpit } = useMobileSession();
  return (
    <Screen>
      <Heading
        eyebrow="ÉTAT CANONIQUE"
        title="Agenda ENDVERA"
        body="Les rendez-vous viennent de PostgreSQL. Utilise l’Assistant pour ajouter, clarifier ou déplacer un rendez-vous."
      />
      {cockpit?.calendar.length ? (
        cockpit.calendar.map((item) => (
          <Card key={item.id}>
            <Label>{item.verificationState}</Label>
            <Text style={sharedStyles.name}>
              {"title" in item && typeof item.title === "string"
                ? item.title
                : item.project?.name ?? "Rendez-vous chantier"}
            </Text>
            <Text style={sharedStyles.value}>{displayDate(item.startsAt, item.timezone)}</Text>
            <Text style={sharedStyles.muted}>
              {[item.project?.code, item.contact?.displayName].filter(Boolean).join(" · ")}
            </Text>
          </Card>
        ))
      ) : (
        <Card><Empty>Aucun rendez-vous canonique.</Empty></Card>
      )}
    </Screen>
  );
}
