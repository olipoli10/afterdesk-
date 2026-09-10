import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Button, Card, Label, Notice, sharedStyles } from "@/components/ui";
import { MobileApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type { PersonalGoogleEvents, PersonalGoogleStatus } from "@/lib/personal-google";

export function PersonalGoogleConnection({ workspaceId }: { workspaceId: string }) {
  const api = useMemo(() => new MobileApi({ getCookie: () => authClient.getCookie(), browserManagedCredentials: Platform.OS === "web" }), []);
  const [status, setStatus] = useState<PersonalGoogleStatus | null>(null);
  const [events, setEvents] = useState<PersonalGoogleEvents | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { setStatus(await api.personalGoogleStatus(workspaceId)); }
    catch { setStatus(null); setMessage("Impossible de vérifier la connexion Google pour le moment."); }
  }, [api, workspaceId]);
  useEffect(() => { setEvents(null); setMessage(null); void reload(); }, [reload]);

  async function connect(mode: "READ_ONLY" | "READ_WRITE") {
    setBusy(true); setMessage(null); setEvents(null);
    try {
      const { launchUrl } = await api.connectPersonalGoogle(workspaceId, mode);
      await WebBrowser.openAuthSessionAsync(launchUrl, "endvera://calendar-connections");
      await reload();
    } catch { setMessage("Google n’a pas été connecté. Tes accès existants n’ont pas été remplacés. Réessaie la connexion."); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setEvents(null);
    try {
      await api.disconnectPersonalGoogle(workspaceId); await reload();
      setMessage("ENDVERA n’a plus accès au calendrier. Pour retirer aussi le consentement dans ton compte Google, ouvre les connexions tierces de Google.");
    } catch { setMessage("La déconnexion n’a pas pu être confirmée. Réessaie."); }
    finally { setBusy(false); }
  }
  async function readTomorrow() {
    setBusy(true); setEvents(null); setMessage(null);
    // Device local midnight, not a fixed 24-hour interval: respects DST changes.
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    try { setEvents(await api.personalGoogleEvents(workspaceId, start.toISOString(), end.toISOString())); }
    catch { setMessage("Ton horaire n’a pas pu être lu au complet. Aucun rendez-vous n’est inventé. Réessaie ou reconnecte Google."); }
    finally { setBusy(false); }
  }
  return <Card>
    <Label>Ton Google Agenda</Label>
    <Text style={sharedStyles.value}>{status?.connected ? "Compte connecté" : "Connecte ton calendrier existant"}</Text>
    <Text style={sharedStyles.muted}>Consulte tes rendez-vous sans les recopier. Tu choisis les accès dans Google; tu peux les retirer ici.</Text>
    {status && !status.configured ? <Notice>La connexion Google doit encore être activée sur le serveur. Aucune permission ne t’est demandée tant que ce n’est pas prêt.</Notice> : null}
    {message ? <Notice>{message}</Notice> : null}
    <View style={sharedStyles.stack}>
      <Button disabled={busy || !status?.configured} onPress={() => void connect("READ_ONLY")}>{status?.connected ? "Reconnecter Google — lecture seulement" : "Connecter Google — lecture seulement"}</Button>
      <Button disabled={busy || !status?.configured} tone="secondary" onPress={() => void connect("READ_WRITE")}>Autoriser aussi les changements de calendrier</Button>
      {status?.writeConsentGranted ? <Text style={sharedStyles.muted}>Permission d’écriture accordée. Elle ne vaut pas approbation d’un changement précis.</Text> : null}
      {status?.readEnabled ? <Button disabled={busy} onPress={() => void readTomorrow()}>Voir mon horaire de demain</Button> : null}
      {status?.connected ? <Button disabled={busy} tone="secondary" onPress={() => void disconnect()}>Déconnecter ENDVERA</Button> : null}
    </View>
    {events ? <View style={sharedStyles.stack}>
      <Label>Demain · Google Agenda · fuseau du téléphone</Label>
      {events.events.length === 0 ? <Text style={sharedStyles.value}>Aucun rendez-vous dans ton calendrier principal pour cette période.</Text> : events.events.map(event => <View key={event.id}>
        <Text style={sharedStyles.value}>{event.summary}</Text>
        <Text style={sharedStyles.muted}>{event.start.dateTime ? new Date(event.start.dateTime).toLocaleString("fr-CA") : `${event.start.date} · toute la journée`}</Text>
      </View>)}
    </View> : null}
  </Card>;
}
