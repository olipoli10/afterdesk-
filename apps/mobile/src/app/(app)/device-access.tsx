import { useCallback, useEffect, useState } from "react";
import * as Calendar from "expo-calendar";
import * as Contacts from "expo-contacts";
import { Linking, Text, View } from "react-native";
import { BrandHeader, Button, Card, Heading, Notice, Screen, sharedStyles } from "@/components/ui";
import { DEVICE_ACCESS_COPY, normalizeDevicePermission, type DeviceAccessState, type DeviceResource } from "@/lib/device-access";
import { useMobileSession } from "@/state/mobile-session";

const statusCopy: Record<DeviceAccessState["status"], string> = {
  UNDETERMINED: "Pas encore demandé",
  DENIED: "Refusé ou révoqué",
  GRANTED: "Accès accordé sur ce téléphone",
  UNAVAILABLE: "Non disponible sur cet appareil",
};

export default function DeviceAccessScreen() {
  const { activeWorkspace } = useMobileSession();
  const [states, setStates] = useState<DeviceAccessState[]>([
    normalizeDevicePermission("CONTACTS", null),
    normalizeDevicePermission("CALENDAR", null),
  ]);
  const [busy, setBusy] = useState<DeviceResource | "REFRESH" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy("REFRESH");
    setError(null);
    try {
      const [contacts, calendar] = await Promise.all([
        Contacts.getPermissionsAsync(),
        Calendar.getCalendarPermissions(),
      ]);
      setStates([
        normalizeDevicePermission("CONTACTS", contacts),
        normalizeDevicePermission("CALENDAR", calendar),
      ]);
    } catch {
      setError("Ce build ne contient pas encore les modules natifs requis. Installe le build ENDVERA pour téléphone.");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([Contacts.getPermissionsAsync(), Calendar.getCalendarPermissions()])
      .then(([contacts, calendar]) => {
        if (!active) return;
        setStates([
          normalizeDevicePermission("CONTACTS", contacts),
          normalizeDevicePermission("CALENDAR", calendar),
        ]);
      })
      .catch(() => {
        if (active) setError("Ce build ne contient pas encore les modules natifs requis. Installe le build ENDVERA pour téléphone.");
      });
    return () => { active = false; };
  }, []);

  const request = async (resource: DeviceResource) => {
    setBusy(resource);
    setError(null);
    try {
      const permission = resource === "CONTACTS"
        ? await Contacts.requestPermissionsAsync()
        : await Calendar.requestCalendarPermissions(false);
      setStates((current) => current.map((state) =>
        state.resource === resource ? normalizeDevicePermission(resource, permission) : state
      ));
    } catch {
      setError("La demande native n’est pas disponible dans ce build. Utilise le build ENDVERA installé sur ton téléphone.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <BrandHeader workspace={activeWorkspace?.name} />
      <Heading
        eyebrow="ACCÈS DU TÉLÉPHONE"
        title="Choisis ce qu’ENDVERA peut utiliser"
        body="Chaque accès est séparé. Tu peux refuser ou le retirer dans les réglages du téléphone."
      />

      {states.map((state) => (
        <Card key={state.resource}>
          <Text style={sharedStyles.name}>{DEVICE_ACCESS_COPY[state.resource].title}</Text>
          <Text style={sharedStyles.muted}>{DEVICE_ACCESS_COPY[state.resource].detail}</Text>
          <Text style={state.status === "GRANTED" ? sharedStyles.success : sharedStyles.value}>
            {statusCopy[state.status]}
          </Text>
          {state.status === "GRANTED" ? (
            <Notice>Aucune donnée n’est téléversée par cet écran. Il confirme seulement l’autorisation du téléphone.</Notice>
          ) : state.canAskAgain || state.status === "UNDETERMINED" ? (
            <Button disabled={busy !== null} onPress={() => void request(state.resource)}>
              Autoriser {DEVICE_ACCESS_COPY[state.resource].title.toLowerCase()}
            </Button>
          ) : (
            <Button tone="secondary" onPress={() => void Linking.openSettings()}>
              Ouvrir les réglages du téléphone
            </Button>
          )}
        </Card>
      ))}

      {error ? <Notice danger>{error}</Notice> : null}
      <Button tone="secondary" disabled={busy !== null} onPress={() => void refresh()}>
        Actualiser les permissions
      </Button>
      <View>
        <Notice>Les textos et appels passent par le numéro ENDVERA dédié. L’app ne lit pas tes conversations personnelles.</Notice>
      </View>
    </Screen>
  );
}
