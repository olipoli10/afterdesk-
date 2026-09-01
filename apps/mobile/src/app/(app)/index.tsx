import { Text, View } from "react-native";
import { Button, Card, Empty, Heading, Label, Loading, Notice, Screen, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

function sameLocalDay(value: string, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(value)) === formatter.format(new Date());
}

export default function TodayScreen() {
  const { activeWorkspace, cockpit, loadState, publicError, refresh } = useMobileSession();
  if (!cockpit && loadState === "LOADING") return <Screen><Loading /></Screen>;

  const today = cockpit?.calendar.filter((item) =>
    sameLocalDay(item.startsAt, activeWorkspace?.defaultTimezone ?? "America/Toronto"),
  ) ?? [];
  const openLoops = cockpit?.openLoops.filter((item) => item.status !== "resolved") ?? [];

  return (
    <Screen>
      <Heading
        eyebrow="ENDVERA MOBILE"
        title="Aujourd’hui"
        body={activeWorkspace ? activeWorkspace.name : "Aucun espace Construction actif."}
      />
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {!activeWorkspace ? (
        <Card><Empty>Ton compte n’a aucun espace Construction actif.</Empty></Card>
      ) : (
        <>
          <Card>
            <Label>Calendrier maintenu</Label>
            {today.length === 0 ? <Empty>Aucun rendez-vous aujourd’hui.</Empty> : today.map((item) => (
              <View key={item.id} style={sharedStyles.stack}>
                <Text style={sharedStyles.name}>{"title" in item && typeof item.title === "string" ? item.title : item.project?.name ?? "Rendez-vous"}</Text>
                <Text style={sharedStyles.muted}>
                  {new Date(item.startsAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })} · {item.project?.code ?? "sans chantier"}
                </Text>
              </View>
            ))}
          </Card>
          <Card>
            <Label>Boucles ouvertes</Label>
            {openLoops.length === 0 ? <Empty>Aucun blocage ouvert.</Empty> : openLoops.slice(0, 10).map((loop) => (
              <View key={loop.id} style={sharedStyles.stack}>
                <Text style={sharedStyles.name}>{loop.project?.name ?? "Boucle générale"}</Text>
                <Text style={sharedStyles.muted}>
                  {"nextAction" in loop && typeof loop.nextAction === "string" ? loop.nextAction : `Responsable: ${loop.nextResponsibleRole}`}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}
      <Button tone="secondary" onPress={refresh} disabled={loadState === "LOADING"}>
        {loadState === "LOADING" ? "Synchronisation…" : "Synchroniser"}
      </Button>
    </Screen>
  );
}
