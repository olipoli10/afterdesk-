import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Linking, Platform, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Heading, Label, Notice, Screen, colors, sharedStyles } from "@/components/ui";
import { MobileApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { personalDeliveryLabel, personalPairingSmsUri, type PersonalPhone, type PersonalOutbox } from "@/lib/personal-service";
import { useMobileSession } from "@/state/mobile-session";

function PersonalService({ workspaceId }: { workspaceId: string }) {
  const api = useMemo(() => new MobileApi({ getCookie: () => authClient.getCookie(), browserManagedCredentials: Platform.OS === "web" }), []);
  const [phone, setPhone] = useState<PersonalPhone | null>(null);
  const [outbox, setOutbox] = useState<PersonalOutbox | null>(null);
  const [allowSms, setAllowSms] = useState(true); const [allowVoice, setAllowVoice] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const reload = useCallback(async () => {
    try { const [nextPhone, nextOutbox] = await Promise.all([api.personalPhone(workspaceId), api.personalOutbox(workspaceId)]); setPhone(nextPhone); setOutbox(nextOutbox); }
    catch { setMessage("Impossible de vérifier le service pour le moment. Aucun succès n’est supposé."); }
  }, [api, workspaceId]);
  useEffect(() => {
    let active = true;
    void Promise.all([api.personalPhone(workspaceId), api.personalOutbox(workspaceId)]).then(([nextPhone, nextOutbox]) => { if (active) { setPhone(nextPhone); setOutbox(nextOutbox); } }, () => { if (active) setMessage("Impossible de vérifier le service pour le moment."); });
    const sub = AppState.addEventListener("change", state => { if (state === "active") void reload(); });
    return () => { active = false; sub.remove(); };
  }, [api, workspaceId, reload]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setMessage(null);
    try { await action(); }
    catch { setMessage("L’action n’a pas été confirmée. Regarde son état ci-dessous avant de réessayer. La configuration ou le budget peut encore manquer."); }
    finally { await reload(); setBusy(false); }
  }
  return <>
    <Card>
      <Label>1 · Ton numéro ENDVERA</Label>
      <Text style={sharedStyles.value}>{phone?.number ?? "Numéro pas encore activé"}</Text>
      <Text style={sharedStyles.muted}>Tu pourras écrire à ce numéro depuis Samsung Messages, comme à une personne. ENDVERA n’a pas besoin de lire tes autres textos.</Text>
      {phone?.boundPhone ? <Notice>Ton téléphone associé : {phone.boundPhone}</Notice> : null}
      {phone && !phone.configured ? <Notice>Le compte téléphonique et le serveur doivent encore être configurés. L’association est désactivée jusque-là.</Notice> : null}
      <View style={sharedStyles.row}><Text style={[sharedStyles.muted, { flex: 1 }]}>Autoriser ENDVERA à répondre automatiquement à mes SMS, vers mon numéro seulement, dans le budget configuré</Text><Switch accessibilityLabel="Autoriser les réponses SMS vers moi" value={allowSms} onValueChange={setAllowSms} disabled={busy} /></View>
      <View style={sharedStyles.row}><Text style={[sharedStyles.muted, { flex: 1 }]}>Autoriser aussi les appels vers mon propre numéro</Text><Switch accessibilityLabel="Autoriser les appels vers moi" value={allowVoice} onValueChange={setAllowVoice} disabled={busy} /></View>
      <Button disabled={busy || !phone?.configured} onPress={() => void run(async () => {
        const pairing = await api.pairPersonalPhone(workspaceId, allowSms, allowVoice);
        await Linking.openURL(personalPairingSmsUri(pairing));
        setMessage("Envoie le message prérempli à ENDVERA, puis reviens ici. Le code expire après dix minutes. Les choix ci-dessus seront appliqués à sa réception.");
      })}>Ouvrir Messages pour associer mon numéro</Button>
      {phone?.boundPhone ? <Button disabled={busy} tone="secondary" onPress={() => void run(() => api.disconnectPersonalPhone(workspaceId))}>Retirer l’accès à mon téléphone</Button> : null}
    </Card>
    <Button tone="secondary" onPress={() => router.push("/calendar-connections")}>2 · Connecter mon Google Agenda</Button>
    {message ? <Notice>{message}</Notice> : null}
    <Card>
      <Label>3 · Préparer un message vers moi</Label>
      <Text style={sharedStyles.muted}>Ce pilote est limité à ton propre numéro vérifié. Aucun employé ni client n’est contacté. Tu vois le texte complet avant l’envoi.</Text>
      <TextInput accessibilityLabel="Texte exact à préparer" value={draft} onChangeText={setDraft} multiline maxLength={1500} placeholder="Ce que l’assistant doit dire…" placeholderTextColor={colors.muted} style={{ color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 16, minHeight: 100 }} />
      <Button disabled={busy || !phone?.boundPhone || !draft.trim()} onPress={() => void run(() => api.preparePersonalMessage(workspaceId, phone!.boundPhone!, draft, "sms_outbound", globalThis.crypto.randomUUID()))}>Préparer le SMS</Button>
      <Button disabled={busy || !phone?.boundPhone || !draft.trim() || draft.length > 550} tone="secondary" onPress={() => void run(() => api.preparePersonalMessage(workspaceId, phone!.boundPhone!, draft, "voice_outbound", globalThis.crypto.randomUUID()))}>Préparer l’appel vocal · 60 secondes maximum</Button>
    </Card>
    <Button disabled={busy} tone="secondary" onPress={() => void reload()}>Actualiser l’état</Button>
    {outbox?.operations.map(operation => <Card key={operation.id}>
      <Label>{operation.kind === "sms_outbound" ? "SMS" : "Appel vocal"} · vers {operation.request.to}</Label>
      <Text style={sharedStyles.muted}>Depuis ENDVERA : {operation.request.from}</Text>
      <Text style={sharedStyles.value}>{operation.request.text}</Text>
      <Notice>{personalDeliveryLabel(operation)}</Notice>
      {operation.status === "pending" ? <Button disabled={busy} onPress={() => void run(() => api.approvePersonalMessage(workspaceId, operation.id, operation.requestHash))}>{operation.kind === "sms_outbound" ? "Approuver ce texte exact et envoyer" : "Approuver ce texte exact et appeler"}</Button> : null}
    </Card>)}
  </>;
}
export default function PersonalServiceScreen() {
  const { activeWorkspace } = useMobileSession();
  return <Screen>
    <Heading eyebrow="PILOTE PERSONNEL" title="ENDVERA dans tes textos" body="Associe ton téléphone, connecte ton calendrier et garde le contrôle sur les envois." />
    {activeWorkspace?.role === "OWNER" ? <PersonalService key={activeWorkspace.id} workspaceId={activeWorkspace.id} /> : <Notice>Le propriétaire du compte doit configurer ce service.</Notice>}
  </Screen>;
}
