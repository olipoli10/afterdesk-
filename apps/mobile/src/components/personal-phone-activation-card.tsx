import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Platform, Switch, Text, View } from "react-native";
import { Button, Card, Label, Notice, sharedStyles } from "@/components/ui";
import { MobileApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { personalPairingSmsUri, type PersonalPhone } from "@/lib/personal-service";

export function PersonalPhoneActivationCard({ workspaceId }: { workspaceId: string }) {
  const api = useMemo(() => new MobileApi({ getCookie: () => authClient.getCookie(), browserManagedCredentials: Platform.OS === "web" }), []);
  const [phone, setPhone] = useState<PersonalPhone | null>(null);
  const [allowSms, setAllowSms] = useState(true);
  const [allowVoice, setAllowVoice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const current = useRef(true);

  const reload = useCallback(async () => {
    try {
      const next = await api.personalPhone(workspaceId);
      if (current.current) setPhone(next);
    } catch {
      if (current.current) setPhone(null);
    } finally {
      if (current.current) setLoading(false);
    }
  }, [api, workspaceId]);

  useEffect(() => {
    current.current = true;
    void Promise.resolve().then(reload);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void reload(); });
    return () => { current.current = false; subscription.remove(); };
  }, [reload]);

  const pair = async () => {
    if (!phone?.configured || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const request = await api.pairPersonalPhone(workspaceId, allowSms, allowVoice);
      await Linking.openURL(personalPairingSmsUri(request));
      if (current.current) setMessage("Envoie le SMS prérempli. À son arrivée, ENDVERA associera automatiquement ton numéro à ce compte.");
    } catch {
      if (current.current) setMessage("L’association n’a pas démarré. Le numéro ENDVERA ou le serveur téléphonique n’est pas encore prêt.");
    } finally {
      if (current.current) setBusy(false);
    }
  };

  return (
    <Card tone="warm">
      <Label>TON NUMÉRO ENDVERA</Label>
      <Text style={sharedStyles.value}>{loading ? "Vérification…" : phone?.number ?? "Numéro pas encore activé"}</Text>
      <Text style={sharedStyles.muted}>Tu écris à ce numéro dans Samsung Messages. L’application ne lit pas tes autres textos.</Text>
      {phone?.boundPhone ? <Notice>Ton numéro est associé : {phone.boundPhone}</Notice> : null}
      <View style={sharedStyles.row}>
        <Text style={[sharedStyles.muted, { flex: 1 }]}>Autoriser les réponses d’ENDVERA vers mon propre numéro</Text>
        <Switch accessibilityLabel="Autoriser les réponses SMS vers moi" value={allowSms} onValueChange={setAllowSms} disabled={busy} />
      </View>
      <View style={sharedStyles.row}>
        <Text style={[sharedStyles.muted, { flex: 1 }]}>Autoriser aussi les appels vers mon propre numéro</Text>
        <Switch accessibilityLabel="Autoriser les appels vers moi" value={allowVoice} onValueChange={setAllowVoice} disabled={busy} />
      </View>
      <Button disabled={loading || busy || !phone?.configured} onPress={() => void pair()}>
        Ouvrir Messages et associer mon numéro
      </Button>
      {!loading && !phone?.configured ? <Notice>Le numéro sera affiché ici dès que Twilio sera relié au serveur ENDVERA.</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      <Button tone="secondary" disabled={loading || busy} onPress={() => void reload()}>Actualiser</Button>
    </Card>
  );
}
