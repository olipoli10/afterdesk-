import { useCallback, useEffect, useRef, useState } from "react";
import * as Calendar from "expo-calendar";
import * as Contacts from "expo-contacts";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { AppState, Linking, Text, View } from "react-native";
import { router } from "expo-router";
import { BrandHeader, Button, Card, Heading, Notice, Screen, sharedStyles } from "@/components/ui";
import { PersonalPhoneActivationCard } from "@/components/personal-phone-activation-card";
import {
  DEVICE_ACCESS_COPY,
  DEVICE_RESOURCES,
  devicePermissionAction,
  normalizeDevicePermission,
  type DeviceAccessState,
  type DeviceResource,
  type NativePermissionLike,
} from "@/lib/device-access";
import { useMobileSession } from "@/state/mobile-session";
import {
  listWritableDeviceCalendars,
  loadSelectedDeviceCalendar,
  localDeviceBridgeSnapshot,
  registerThisAndroidDevice,
  revokeThisAndroidDevice,
  runDeviceCalendarBridge,
  selectWritableDeviceCalendar,
  type DeviceBridgeOutcome,
  type WritableDeviceCalendar,
} from "@/lib/device-calendar-bridge";
import { preferredWritableDeviceCalendar } from "@/lib/device-calendar-selection";

const statusCopy: Record<DeviceAccessState["status"], string> = {
  UNDETERMINED: "Pas encore demandé",
  DENIED: "Refusé ou révoqué",
  GRANTED: "Accès accordé sur ce téléphone",
  LIMITED: "Accès limité aux photos choisies",
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

async function readBiometricsAvailable(): Promise<boolean> {
  try {
    return await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();
  } catch {
    return false;
  }
}

export default function DeviceAccessScreen() {
  const { activeWorkspace } = useMobileSession();
  const [states, setStates] = useState<DeviceAccessState[]>(DEVICE_RESOURCES.map(unavailable));
  const [busy, setBusy] = useState<DeviceResource | "ALL" | "REFRESH" | null>("REFRESH");
  const [error, setError] = useState<string | null>(null);
  const [biometricsReady, setBiometricsReady] = useState<boolean | null>(null);
  const [writableCalendars, setWritableCalendars] = useState<WritableDeviceCalendar[]>([]);
  const [selectedCalendar, setSelectedCalendar] = useState<WritableDeviceCalendar | null>(null);
  const [deviceLinked, setDeviceLinked] = useState(false);
  const [bridgeOutcome, setBridgeOutcome] = useState<DeviceBridgeOutcome | null>(null);
  const [permissionFeedback, setPermissionFeedback] = useState<string | null>(null);
  const mounted = useRef(false);
  // Native permission dialogs can foreground the app while a request is in flight.
  // Do not start a competing refresh or allow a second tap before React renders.
  const pending = useRef(false);

  const refresh = useCallback(async () => {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    setBusy("REFRESH");
    try {
      const next = await Promise.all(DEVICE_RESOURCES.map(readNativePermission));
      if (!mounted.current) return;
      setStates(next);
      const [calendars, selected, bridge] = await Promise.all([
        listWritableDeviceCalendars(),
        loadSelectedDeviceCalendar(),
        localDeviceBridgeSnapshot(),
      ]);
      if (!mounted.current) return;
      setWritableCalendars(calendars);
      setSelectedCalendar(selected);
      setDeviceLinked(Boolean(bridge.identity && bridge.identity.workspaceId === activeWorkspace?.id));
      const ready = await readBiometricsAvailable();
      if (mounted.current) setBiometricsReady(ready);
    } catch {
      if (mounted.current) setBiometricsReady(false);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(null);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    pending.current = true;
    void Promise.all([
      Promise.all(DEVICE_RESOURCES.map(readNativePermission)),
      readBiometricsAvailable(),
      listWritableDeviceCalendars(),
      loadSelectedDeviceCalendar(),
      localDeviceBridgeSnapshot(),
    ]).then(([next, ready, calendars, selected, bridge]) => {
      if (!active) return;
      setStates(next);
      setBiometricsReady(ready);
      setWritableCalendars(calendars);
      setSelectedCalendar(selected);
      setDeviceLinked(Boolean(bridge.identity && bridge.identity.workspaceId === activeWorkspace?.id));
    }).catch(() => {
      if (active) setError("Impossible de vérifier certains accès. Réessaie ou ouvre les réglages du téléphone.");
    }).finally(() => {
      pending.current = false;
      if (active) setBusy(null);
    });
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") void refresh();
    });
    return () => { active = false; mounted.current = false; subscription.remove(); };
  }, [activeWorkspace, refresh]);

  const request = async (resource: DeviceResource) => {
    if (pending.current) {
      setPermissionFeedback("Une vérification est déjà en cours. Réessaie dans un instant.");
      return;
    }
    pending.current = true;
    setBusy(resource);
    setError(null);
    setPermissionFeedback(null);
    try {
      const current = await readNativePermission(resource);
      if (!mounted.current) return;
      const permission = devicePermissionAction(current) === "REQUEST" ? await askNativePermission(resource) : current;
      if (!mounted.current) return;
      setStates((states) => states.map((state) => state.resource === resource ? permission : state));
      if (resource === "CALENDAR" && permission.status === "GRANTED") {
        setWritableCalendars(await listWritableDeviceCalendars());
      }
      if (permission.status === "UNAVAILABLE") setError(`${DEVICE_ACCESS_COPY[resource].title} n’est pas disponible sur ce téléphone.`);
      else setPermissionFeedback(`${DEVICE_ACCESS_COPY[resource].title} : ${statusCopy[permission.status]}.`);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const requestAll = async () => {
    if (pending.current) {
      setPermissionFeedback("Une vérification est déjà en cours. Réessaie dans un instant.");
      return;
    }
    pending.current = true;
    setBusy("ALL");
    setError(null);
    setPermissionFeedback("Android vérifie les permissions une à une…");
    try {
      const next: DeviceAccessState[] = [];
      for (const resource of DEVICE_RESOURCES) {
        if (!mounted.current) return;
        const current = await readNativePermission(resource);
        if (!mounted.current) return;
        next.push(devicePermissionAction(current) === "REQUEST" ? await askNativePermission(resource) : current);
      }
      if (!mounted.current) return;
      setStates(next);
      const calendars = await listWritableDeviceCalendars();
      if (!mounted.current) return;
      setWritableCalendars(calendars);
      const granted = next.filter((state) => state.status === "GRANTED" || state.status === "LIMITED").length;
      const calendar = next.find((state) => state.resource === "CALENDAR");
      if (calendar?.status !== "GRANTED") {
        setPermissionFeedback(`Vérification terminée : ${granted}/${next.length} accès accordés. L’accès Calendrier doit être autorisé avant l’association.`);
      } else if (!activeWorkspace) {
        setPermissionFeedback(`Vérification terminée : ${granted}/${next.length} accès accordés. Reconnecte-toi à ton espace pour associer ce téléphone.`);
      } else {
        const choice = preferredWritableDeviceCalendar(calendars, await loadSelectedDeviceCalendar());
        if (!choice) {
          setSelectedCalendar(null);
          setDeviceLinked(false);
          setPermissionFeedback(`Vérification terminée : ${granted}/${next.length} accès accordés, mais aucun calendrier Android modifiable n’a été trouvé.`);
        } else {
          await selectWritableDeviceCalendar(choice);
          if (!mounted.current) return;
          setSelectedCalendar(choice);
          try {
            const registration = await registerThisAndroidDevice(activeWorkspace.id);
            if (registration.status !== "LINKED" || !registration.calendarWriteEnabled || !registration.pushEnabled) {
              throw new Error("DEVICE_BACKGROUND_WAKE_NOT_LINKED");
            }
            if (!mounted.current) return;
            setDeviceLinked(true);
            const outcome = await runDeviceCalendarBridge(activeWorkspace.id);
            if (!mounted.current) return;
            setBridgeOutcome(outcome);
            setPermissionFeedback(`Prêt en arrière-plan : ${granted}/${next.length} accès accordés. « ${choice.title} » est choisi et ENDVERA peut réveiller ce téléphone.`);
          } catch {
            if (!mounted.current) return;
            setDeviceLinked(false);
            setPermissionFeedback(`Permissions accordées : ${granted}/${next.length}. « ${choice.title} » est choisi, mais l’association au serveur a échoué.`);
            setError("Association refusée. Vérifie la connexion et la session, puis appuie de nouveau sur le bouton.");
          }
        }
      }
      if (next.some((state) => state.status === "UNAVAILABLE")) {
        setError("Au moins un accès n’est pas disponible; les autres permissions restent utilisables.");
      }
    } catch {
      if (mounted.current) setError("La vérification des permissions a échoué. Aucun accès n’est supposé accordé.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      if (mounted.current) setError("Impossible d’ouvrir les réglages. Ouvre les paramètres du téléphone, puis Applications → ENDVERA → Autorisations.");
    }
  };

  const chooseCalendar = async (calendar: WritableDeviceCalendar) => {
    setError(null);
    try {
      await selectWritableDeviceCalendar(calendar);
      if (mounted.current) setSelectedCalendar(calendar);
    } catch {
      if (mounted.current) setError("Impossible d’enregistrer ce calendrier sur le téléphone.");
    }
  };

  const linkDevice = async () => {
    if (!activeWorkspace || !selectedCalendar || pending.current) return;
    pending.current = true;
    setBusy("REFRESH");
    setError(null);
    try {
      const registration = await registerThisAndroidDevice(activeWorkspace.id);
      if (registration.status !== "LINKED" || !registration.calendarWriteEnabled || !registration.pushEnabled) {
        throw new Error("DEVICE_BACKGROUND_WAKE_NOT_LINKED");
      }
      if (!mounted.current) return;
      setDeviceLinked(true);
      setBridgeOutcome(await runDeviceCalendarBridge(activeWorkspace.id));
    } catch {
      if (mounted.current) setError("Association refusée. Vérifie la connexion, la session et les permissions, puis réessaie.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const unlinkDevice = async () => {
    if (!activeWorkspace || pending.current) return;
    pending.current = true;
    setBusy("REFRESH");
    setError(null);
    try {
      await revokeThisAndroidDevice(activeWorkspace.id);
      if (!mounted.current) return;
      setDeviceLinked(false);
      setSelectedCalendar(null);
      setBridgeOutcome(null);
    } catch {
      if (mounted.current) setError("La révocation n’a pas été confirmée. Aucun état local n’a été effacé.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  return (
    <Screen>
      <BrandHeader workspace={activeWorkspace?.name} />
      <Heading eyebrow="ACCÈS DU TÉLÉPHONE" title="Donne à ENDVERA les accès utiles" body="Chaque permission est séparée, visible et révocable. ENDVERA l’utilise seulement quand tu demandes l’action correspondante." />

      {activeWorkspace?.role === "OWNER" ? <PersonalPhoneActivationCard workspaceId={activeWorkspace.id} /> : null}

      <Card>
        <Text style={sharedStyles.name}>Choisis tes accès</Text>
        <Text style={sharedStyles.muted}>Tu peux activer un accès à la fois ci-dessous ou examiner les demandes restantes. Le téléphone présente chaque choix séparément; tu peux refuser. Un accès accordé ne signifie pas qu’un service est connecté.</Text>
        <Button disabled={busy !== null} onPress={() => void requestAll()}>
          {busy === "ALL" ? "Vérification en cours…" : "Examiner les permissions restantes"}
        </Button>
        {permissionFeedback ? <Notice>{permissionFeedback}</Notice> : null}
      </Card>

      {states.map((state) => (
        <Card key={state.resource}>
          <Text style={sharedStyles.name}>{DEVICE_ACCESS_COPY[state.resource].title}</Text>
          <Text style={sharedStyles.muted}>{DEVICE_ACCESS_COPY[state.resource].detail}</Text>
          <Text style={state.status === "GRANTED" || state.status === "LIMITED" ? sharedStyles.success : sharedStyles.value}>{statusCopy[state.status]}</Text>
          {state.status === "GRANTED" || state.status === "LIMITED" ? <Notice>L’autorisation est active. Cet écran ne téléverse aucune donnée.</Notice> : null}
          {devicePermissionAction(state) === "REQUEST" ? (
            <Button disabled={busy !== null} onPress={() => void request(state.resource)}>Autoriser {DEVICE_ACCESS_COPY[state.resource].title.toLowerCase()}</Button>
          ) : devicePermissionAction(state) === "SETTINGS" ? (
            <Button disabled={busy !== null} tone="secondary" onPress={() => void openSettings()}>{state.status === "GRANTED" || state.status === "LIMITED" ? "Modifier ou retirer cet accès" : "Ouvrir les réglages du téléphone"}</Button>
          ) : (
            <Notice>Accès non vérifiable dans cette version ou sur cet appareil. Actualise pour vérifier à nouveau; aucune autorisation n’est supposée.</Notice>
          )}
        </Card>
      ))}

      <Card>
        <Text style={sharedStyles.name}>Empreinte ou reconnaissance du téléphone</Text>
        <Text style={sharedStyles.muted}>Pour confirmer plus tard une action sensible sans transmettre tes données biométriques à ENDVERA.</Text>
        <Text style={biometricsReady ? sharedStyles.success : sharedStyles.value}>{biometricsReady === null ? "Vérification…" : biometricsReady ? "Disponible" : "Non configurée"}</Text>
      </Card>

      <Card>
        <Text style={sharedStyles.name}>Ton numéro ENDVERA et le calendrier de ce téléphone</Text>
        <Text style={sharedStyles.muted}>Tu écris au numéro ENDVERA depuis Messages. Le serveur prépare une action, ton appareil associé la vérifie, puis le pont calendrier du téléphone l’applique et renvoie un reçu. Google Agenda pourra être ajouté plus tard comme synchronisation entre appareils; ce n’est pas requis pour le calendrier de ce téléphone.</Text>
        <Text style={sharedStyles.value}>1. Choisis le calendrier Android à modifier</Text>
        {writableCalendars.length === 0 ? (
          <Notice>Aucun calendrier modifiable détecté. Autorise Calendrier, puis actualise.</Notice>
        ) : writableCalendars.map((calendar) => (
          <Button
            key={calendar.id}
            disabled={busy !== null}
            tone={selectedCalendar?.id === calendar.id ? "primary" : "secondary"}
            onPress={() => void chooseCalendar(calendar)}
          >
            {selectedCalendar?.id === calendar.id ? "✓ " : ""}{calendar.title}{calendar.ownerAccount ? ` — ${calendar.ownerAccount}` : ""}
          </Button>
        ))}
        <Text style={sharedStyles.value}>2. Associe ce téléphone à ton espace ENDVERA</Text>
        <Text style={deviceLinked ? sharedStyles.success : sharedStyles.muted}>{deviceLinked ? "Téléphone associé" : "Pas encore associé"}</Text>
        <Button disabled={busy !== null || !selectedCalendar || !activeWorkspace} onPress={() => void linkDevice()}>
          {deviceLinked ? "Actualiser l’association" : "Associer ce téléphone"}
        </Button>
        {deviceLinked ? <Button disabled={busy !== null} tone="secondary" onPress={() => void unlinkDevice()}>Retirer ce téléphone</Button> : null}
        {bridgeOutcome ? <Notice>{bridgeOutcome.detail}</Notice> : null}
        <Button tone="secondary" onPress={() => router.push("/personal-service")}>Configurer mon numéro ENDVERA</Button>
      </Card>

      {error ? <Notice danger>{error}</Notice> : null}
      <Button tone="secondary" disabled={busy !== null} onPress={() => void refresh()}>Actualiser les permissions</Button>
      <View><Notice>Tu écris au numéro ENDVERA depuis l’application Messages normale. ENDVERA ne lit jamais tes autres textos ni ton journal d’appels.</Notice></View>
    </Screen>
  );
}
