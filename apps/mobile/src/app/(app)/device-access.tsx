import { useCallback, useEffect, useState } from "react";
import * as Calendar from "expo-calendar";
import * as Contacts from "expo-contacts";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Linking, Text, View } from "react-native";
import { BrandHeader, Button, Card, Heading, Notice, Screen, sharedStyles } from "@/components/ui";
import {
  DEVICE_ACCESS_COPY,
  DEVICE_RESOURCES,
  normalizeDevicePermission,
  type DeviceAccessState,
  type DeviceResource,
  type NativePermissionLike,
} from "@/lib/device-access";
import { useMobileSession } from "@/state/mobile-session";

const statusCopy: Record<DeviceAccessState["status"], string> = {
  UNDETERMINED: "Pas encore demandé",
  DENIED: "Refusé ou révoqué",
  GRANTED: "Accès accordé sur ce téléphone",
  UNAVAILABLE: "Non disponible sur cet appareil",
};

const unavailable = (resource: DeviceResource) => normalizeDevicePermission(resource, null);

async function readNativePermission(resource: DeviceResource): Promise<DeviceAccessState> {
  try {
    let permission: NativePermissionLike;
    switch (resource) {
      case "CONTACTS": permission = await Contacts.getPermissionsAsync(); break;
      case "CALENDAR": permission = await Calendar.getCalendarPermissions(false); break;
      case "MICROPHONE": permission = await getRecordingPermissionsAsync(); break;
      case "CAMERA": permission = await Camera.getCameraPermissionsAsync(); break;
      case "PHOTOS": permission = await ImagePicker.getMediaLibraryPermissionsAsync(false); break;
      case "NOTIFICATIONS": permission = await Notifications.getPermissionsAsync(); break;
      case "LOCATION": permission = await Location.getForegroundPermissionsAsync(); break;
    }
    return normalizeDevicePermission(resource, permission);
  } catch {
    return unavailable(resource);
  }
}

async function askNativePermission(resource: DeviceResource): Promise<DeviceAccessState> {
  try {
    let permission: NativePermissionLike;
    switch (resource) {
      case "CONTACTS": permission = await Contacts.requestPermissionsAsync(); break;
      case "CALENDAR": permission = await Calendar.requestCalendarPermissions(false); break;
      case "MICROPHONE": permission = await requestRecordingPermissionsAsync(); break;
      case "CAMERA": permission = await Camera.requestCameraPermissionsAsync(); break;
      case "PHOTOS": permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false); break;
      case "NOTIFICATIONS": permission = await Notifications.requestPermissionsAsync(); break;
      case "LOCATION": permission = await Location.requestForegroundPermissionsAsync(); break;
    }
    return normalizeDevicePermission(resource, permission);
  } catch {
    return unavailable(resource);
  }
}

export default function DeviceAccessScreen() {
  const { activeWorkspace } = useMobileSession();
  const [states, setStates] = useState<DeviceAccessState[]>(DEVICE_RESOURCES.map(unavailable));
  const [busy, setBusy] = useState<DeviceResource | "ALL" | "REFRESH" | null>("REFRESH");
  const [error, setError] = useState<string | null>(null);
  const [biometricsReady, setBiometricsReady] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    setBusy("REFRESH");
    setError(null);
    setStates(await Promise.all(DEVICE_RESOURCES.map(readNativePermission)));
    try {
      const [hardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setBiometricsReady(hardware && enrolled);
    } catch {
      setBiometricsReady(false);
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      Promise.all(DEVICE_RESOURCES.map(readNativePermission)),
      LocalAuthentication.hasHardwareAsync().catch(() => false),
      LocalAuthentication.isEnrolledAsync().catch(() => false),
    ]).then(([next, hardware, enrolled]) => {
      if (!active) return;
      setStates(next);
      setBiometricsReady(hardware && enrolled);
      setBusy(null);
    });
    return () => { active = false; };
  }, []);

  const request = async (resource: DeviceResource) => {
    setBusy(resource);
    setError(null);
    const permission = await askNativePermission(resource);
    setStates((current) => current.map((state) => state.resource === resource ? permission : state));
    if (permission.status === "UNAVAILABLE") setError(`${DEVICE_ACCESS_COPY[resource].title} n’est pas disponible sur ce téléphone.`);
    setBusy(null);
  };

  const requestAll = async () => {
    setBusy("ALL");
    setError(null);
    const next: DeviceAccessState[] = [];
    for (const resource of DEVICE_RESOURCES) next.push(await askNativePermission(resource));
    setStates(next);
    if (next.some((state) => state.status === "UNAVAILABLE")) {
      setError("Au moins un accès n’est pas disponible; les autres permissions restent utilisables.");
    }
    setBusy(null);
  };

  return (
    <Screen>
      <BrandHeader workspace={activeWorkspace?.name} />
      <Heading eyebrow="ACCÈS DU TÉLÉPHONE" title="Donne à ENDVERA les accès utiles" body="Chaque permission est séparée, visible et révocable. ENDVERA l’utilise seulement quand tu demandes l’action correspondante." />

      <Card>
        <Text style={sharedStyles.name}>Connexion rapide</Text>
        <Text style={sharedStyles.muted}>Android présentera chaque autorisation séparément.</Text>
        <Button disabled={busy !== null} onPress={() => void requestAll()}>Autoriser tous les accès utiles</Button>
      </Card>

      {states.map((state) => (
        <Card key={state.resource}>
          <Text style={sharedStyles.name}>{DEVICE_ACCESS_COPY[state.resource].title}</Text>
          <Text style={sharedStyles.muted}>{DEVICE_ACCESS_COPY[state.resource].detail}</Text>
          <Text style={state.status === "GRANTED" ? sharedStyles.success : sharedStyles.value}>{statusCopy[state.status]}</Text>
          {state.status === "GRANTED" ? (
            <Notice>L’autorisation est active. Cet écran ne téléverse aucune donnée.</Notice>
          ) : state.canAskAgain || state.status === "UNDETERMINED" ? (
            <Button disabled={busy !== null} onPress={() => void request(state.resource)}>Autoriser {DEVICE_ACCESS_COPY[state.resource].title.toLowerCase()}</Button>
          ) : (
            <Button tone="secondary" onPress={() => void Linking.openSettings()}>Ouvrir les réglages du téléphone</Button>
          )}
        </Card>
      ))}

      <Card>
        <Text style={sharedStyles.name}>Empreinte ou reconnaissance du téléphone</Text>
        <Text style={sharedStyles.muted}>Pour confirmer plus tard une action sensible sans transmettre tes données biométriques à ENDVERA.</Text>
        <Text style={biometricsReady ? sharedStyles.success : sharedStyles.value}>{biometricsReady === null ? "Vérification…" : biometricsReady ? "Disponible" : "Non configurée"}</Text>
      </Card>

      {error ? <Notice danger>{error}</Notice> : null}
      <Button tone="secondary" disabled={busy !== null} onPress={() => void refresh()}>Actualiser les permissions</Button>
      <View><Notice>Tu écris au numéro ENDVERA depuis l’application Messages normale. ENDVERA ne lit jamais tes autres textos ni ton journal d’appels.</Notice></View>
    </Screen>
  );
}
