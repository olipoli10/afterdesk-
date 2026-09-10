import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Platform, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Heading, Label, Notice, Screen, colors, sharedStyles } from "@/components/ui";
import { MobileApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { createPersonalDraftRequests, loadPersonalServiceState, personalDeliveryLabel, personalPairingSmsUri, type PersonalPhone, type PersonalOutbox } from "@/lib/personal-service";
import { useMobileSession } from "@/state/mobile-session";

function PersonalService({ workspaceId }: { workspaceId: string }) {
  const api = useMemo(() => new MobileApi({ getCookie: () => authClient.getCookie(), browserManagedCredentials: Platform.OS === "web" }), []);
  const [phone, setPhone] = useState<PersonalPhone | null>(null);
  const [outbox, setOutbox] = useState<PersonalOutbox | null>(null);
  const [allowSms, setAllowSms] = useState(true); const [allowVoice, setAllowVoice] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftRequests] = useState(() => createPersonalDraftRequests(() => globalThis.crypto.randomUUID()));
  const [loading, setLoading] = useState(true);
  const [readErrors, setReadErrors] = useState({ phoneUnavailable: false, outboxUnavailable: false });
  const mounted = useRef(false); const readVersion = useRef(0);
  const lifecycleVersion = useRef(0);
  const loadingRef = useRef(true); const busyRef = useRef(false);
  const reload = useCallback(async () => {
    const version = ++readVersion.current;
    loadingRef.current = true;
    if (mounted.current) setLoading(true);
    const next = await loadPersonalServiceState(() => api.personalPhone(workspaceId), () => api.personalOutbox(workspaceId));
    if (!mounted.current || version !== readVersion.current) return;
    setPhone(next.phone); setOutbox(next.outbox);
    setReadErrors({ phoneUnavailable: next.phoneUnavailable, outboxUnavailable: next.outboxUnavailable });
    loadingRef.current = false; setLoading(false);
  }, [api, workspaceId]);
  useEffect(() => {
    mounted.current = true;
    void reload();
    const sub = AppState.addEventListener("change", state => { if (state === "active") void reload(); });
    return () => { mounted.current = false; lifecycleVersion.current += 1; readVersion.current += 1; sub.remove(); };
  }, [reload]);
  async function run(action: (isCurrent: () => boolean) => Promise<unknown>) {
    if (busyRef.current || loadingRef.current || !mounted.current) return;
    const version = lifecycleVersion.current;
    const isCurrent = () => mounted.current && lifecycleVersion.current === version;
    busyRef.current = true;
    setBusy(true); setMessage(null);
    try { await action(isCurrent); }
    catch (error) { if (isCurrent()) setMessage(error instanceof Error && error.message === "DRAFT_RETRY_CAPACITY_REACHED"
      ? "Plusieurs préparations restent sans confirmation. Vérifie le suivi avant d’en créer d’autres. Réessayer exactement un texte déjà préparé conserve sa demande."
      : "L’action n’a pas été confirmée. Regarde son état ci-dessous avant de réessayer. Pour une préparation, garde cet écran et réessaie le même texte : la même demande sera utilisée. La configuration ou le budget peut encore manquer."); }
    finally { if (isCurrent()) await reload(); if (isCurrent()) { busyRef.current = false; setBusy(false); } }
  }
  async function prepareDraft(kind: "sms_outbound" | "voice_outbound", isCurrent: () => boolean) {
    if (!phone?.boundPhone || !isCurrent()) return;
    const request = draftRequests.prepare({ workspaceId, kind, to: phone.boundPhone, text: draft });
    const rawReceipt = await api.preparePersonalMessage(request.workspaceId, request.to, request.text, request.kind, request.requestId);
    if (!isCurrent()) return;
    const receipt = draftRequests.confirm(request, rawReceipt);
    setDraft(current => current === request.text ? "" : current);
    setMessage(receipt.status === "pending" ? "Brouillon confirmé, pas envoyé. Vérifie son texte dans le suivi avant de l’approuver." : "Demande retrouvée. Consulte son état dans le suivi : cette confirmation ne prouve pas sa livraison.");
  }
  return <>
    <Card>
      <Label>1 · Ton numéro ENDVERA</Label>
      <Text style={sharedStyles.value}>{loading ? "Vérification du numéro…" : readErrors.phoneUnavailable ? "État du numéro indisponible" : phone?.number ?? "Numéro pas encore activé"}</Text>
      <Text style={sharedStyles.muted}>Tu pourras écrire à ce numéro depuis Samsung Messages, comme à une personne. ENDVERA n’a pas besoin de lire tes autres textos.</Text>
      {phone?.boundPhone ? <Notice>Ton téléphone associé : {phone.boundPhone}</Notice> : null}
      {phone && !phone.configured ? <Notice>Le compte téléphonique et le serveur doivent encore être configurés. L’association est désactivée jusque-là.</Notice> : null}
      <View style={sharedStyles.row}><Text style={[sharedStyles.muted, { flex: 1 }]}>Autoriser ENDVERA à répondre automatiquement à mes SMS, vers mon numéro seulement, dans le budget configuré</Text><Switch accessibilityLabel="Autoriser les réponses SMS vers moi" value={allowSms} onValueChange={setAllowSms} disabled={busy} /></View>
      <View style={sharedStyles.row}><Text style={[sharedStyles.muted, { flex: 1 }]}>Autoriser aussi les appels vers mon propre numéro</Text><Switch accessibilityLabel="Autoriser les appels vers moi" value={allowVoice} onValueChange={setAllowVoice} disabled={busy} /></View>
      <Button disabled={busy || loading || !phone?.configured} onPress={() => void run(async isCurrent => {
        const pairing = await api.pairPersonalPhone(workspaceId, allowSms, allowVoice);
        if (!isCurrent()) return;
        await Linking.openURL(personalPairingSmsUri(pairing));
        if (isCurrent()) setMessage("Envoie le message prérempli à ENDVERA, puis reviens ici. Le code expire après dix minutes. Les choix ci-dessus seront appliqués à sa réception.");
      })}>Ouvrir Messages pour associer mon numéro</Button>
      {phone?.boundPhone ? <Button disabled={busy || loading} tone="secondary" onPress={() => void run(() => api.disconnectPersonalPhone(workspaceId))}>Retirer l’accès à mon téléphone</Button> : null}
    </Card>
    <Button tone="secondary" onPress={() => router.push("/calendar-connections")}>2 · Connecter mon Google Agenda</Button>
    {message ? <Notice>{message}</Notice> : null}
    {readErrors.phoneUnavailable && !loading ? <Notice>Impossible de vérifier ton numéro. L’association et les envois sont désactivés jusqu’à une nouvelle vérification.</Notice> : null}
    {readErrors.outboxUnavailable && !loading ? <Notice>Le suivi des envois est indisponible. Tu peux associer ton numéro si sa configuration est confirmée, mais attends le retour du suivi avant de préparer ou d’envoyer un message.</Notice> : null}
    <Card>
      <Label>3 · Préparer un message vers moi</Label>
      <Text style={sharedStyles.muted}>Ce pilote est limité à ton propre numéro vérifié. Aucun employé ni client n’est contacté. Tu vois le texte complet avant l’envoi.</Text>
      <TextInput accessibilityLabel="Texte exact à préparer" value={draft} onChangeText={setDraft} multiline maxLength={1500} placeholder="Ce que l’assistant doit dire…" placeholderTextColor={colors.muted} style={{ color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 16, minHeight: 100 }} />
      <Button disabled={busy || loading || !outbox || !phone?.boundPhone || !draft.trim()} onPress={() => void run(isCurrent => prepareDraft("sms_outbound", isCurrent))}>Préparer le SMS</Button>
      <Button disabled={busy || loading || !outbox || !phone?.boundPhone || !draft.trim() || draft.length > 550} tone="secondary" onPress={() => void run(isCurrent => prepareDraft("voice_outbound", isCurrent))}>Préparer l’appel vocal · 60 secondes maximum</Button>
    </Card>
    <Button disabled={busy || loading} tone="secondary" onPress={() => void reload()}>Actualiser l’état</Button>
    {outbox?.operations.map(operation => <Card key={operation.id}>
      <Label>{operation.kind === "sms_outbound" ? "SMS" : "Appel vocal"} · vers {operation.request.to}</Label>
      <Text style={sharedStyles.muted}>Depuis ENDVERA : {operation.request.from}</Text>
      <Text style={sharedStyles.value}>{operation.request.text}</Text>
      <Notice>{personalDeliveryLabel(operation)}</Notice>
      {operation.status === "pending" ? <Button disabled={busy || loading || !phone?.boundPhone} onPress={() => void run(() => api.approvePersonalMessage(workspaceId, operation.id, operation.requestHash))}>{operation.kind === "sms_outbound" ? "Approuver ce texte exact et envoyer" : "Approuver ce texte exact et appeler"}</Button> : null}
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
