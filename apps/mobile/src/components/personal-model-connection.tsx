import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Button, Card, colors, Label, Notice, sharedStyles } from "@/components/ui";
import { MobileApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { loadPersonalModelState, personalModelReadinessLabel, type PersonalModelStatus } from "@/lib/personal-model";

/** A separate resource failure must not disable phone pairing or Google setup. */
export function PersonalModelConnection({ workspaceId }: { workspaceId: string }) {
  const api = useMemo(() => new MobileApi({ getCookie: () => authClient.getCookie(), browserManagedCredentials: Platform.OS === "web" }), []);
  const [model, setModel] = useState<PersonalModelStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [accepted, setAccepted] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const mounted = useRef(false); const lifecycle = useRef(0); const readVersion = useRef(0);
  const busyRef = useRef(false); const loadingRef = useRef(true);
  const reload = useCallback(async () => {
    const version = ++readVersion.current; loadingRef.current = true;
    if (mounted.current) setLoading(true);
    const result = await loadPersonalModelState(() => api.personalModelStatus(workspaceId));
    if (!mounted.current || version !== readVersion.current) return;
    setModel(result.model); setUnavailable(result.unavailable); setLoading(false); loadingRef.current = false;
  }, [api, workspaceId]);
  useEffect(() => {
    mounted.current = true; void reload();
    const sub = AppState.addEventListener("change", state => { if (state === "active") void reload(); });
    return () => { mounted.current = false; lifecycle.current += 1; readVersion.current += 1; sub.remove(); };
  }, [reload]);
  async function run(action: "PREPARE" | "CONSENT" | "DISCONNECT") {
    if (!mounted.current || busyRef.current || loadingRef.current || !model || (action === "CONSENT" && !accepted)) return;
    const version = lifecycle.current; const current = () => mounted.current && lifecycle.current === version;
    busyRef.current = true; setBusy(true); setMessage(null);
    try {
      if (action === "PREPARE") await api.preparePersonalModel(workspaceId);
      else if (action === "CONSENT") await api.consentPersonalModel(workspaceId);
      else await api.disconnectPersonalModel(workspaceId);
      if (!current()) return;
      setAccepted(false);
      setMessage(action === "CONSENT" ? "Ton autorisation IA a été enregistrée. La clé, la configuration et le budget sont vérifiés séparément."
        : action === "DISCONNECT" ? "L’accès IA local a été retiré. Les résultats déjà enregistrés sont conservés; cette action ne supprime pas ton compte OpenRouter."
        : "Connexion préparée. Aucune clé ni autorisation IA n’a été créée à ta place.");
    } catch { if (current()) setMessage("La modification n’a pas été confirmée. Actualise l’état avant de réessayer : aucune activation n’est présumée."); }
    finally { if (current()) await reload(); if (current()) { busyRef.current = false; setBusy(false); } }
  }
  async function provisionCredential() {
    if (!mounted.current || busyRef.current || loadingRef.current || !model || !model.prepared || !model.consentGranted) return;
    const submittedKey = apiKey; setApiKey("");
    if (!/^[A-Za-z0-9_-]{24,512}$/.test(submittedKey) || typeof globalThis.crypto?.randomUUID !== "function") {
      setMessage("La clé ne ressemble pas à une clé OpenRouter valide. Rien n’a été enregistré."); return;
    }
    const version = lifecycle.current; const current = () => mounted.current && lifecycle.current === version;
    busyRef.current = true; setBusy(true); setMessage(null);
    try {
      await api.provisionPersonalModelCredential(workspaceId, globalThis.crypto.randomUUID(), submittedKey);
      if (!current()) return;
      setMessage("La clé a été chiffrée sur le serveur puis effacée de ce formulaire. Aucun appel IA n’a été lancé par cette étape.");
    } catch { if (current()) setMessage("La clé n’a pas été confirmée. Elle a été effacée du formulaire et aucun fonctionnement réel n’est présumé."); }
    finally { if (current()) await reload(); if (current()) { busyRef.current = false; setBusy(false); } }
  }
  return <Card>
    <Label>3 · L’IA qui comprend tes textos</Label>
    <Text style={sharedStyles.value}>{loading ? "Vérification de la connexion IA…" : unavailable || !model ? "État de la connexion IA indisponible" : personalModelReadinessLabel(model)}</Text>
    <Text style={sharedStyles.muted}>Les messages que tu envoies à ENDVERA pourront être transmis à OpenRouter pour comprendre ta demande. Tes autres textos ne sont pas lus. Cette autorisation est distincte de Google Agenda et des permissions de ton téléphone.</Text>
    {model ? <>
      <Text style={sharedStyles.muted}>Autorisation IA : {model.consentGranted ? "enregistrée" : "non accordée"} · Clé sécurisée : {model.credentialPrepared && model.credentialStorageConfigured ? "préparée sur le serveur" : "à configurer sur le serveur"}</Text>
      <Notice>Ces états vérifient les prérequis, pas un échange réel réussi. L’IA propose; elle ne peut pas s’autoriser elle-même à modifier ton calendrier, envoyer un texto ou appeler.</Notice>
      {!model.prepared ? <Button disabled={busy || loading} onPress={() => void run("PREPARE")}>Préparer la connexion IA</Button> : null}
      {!model.consentGranted ? <>
        <View style={sharedStyles.row}>
          <Text style={[sharedStyles.muted, { flex: 1 }]}>J’autorise séparément l’analyse par OpenRouter des messages que j’envoie à ENDVERA, dans les limites du pilote.</Text>
          <Switch accessibilityLabel="J’autorise l’analyse de mes messages ENDVERA par OpenRouter" value={accepted} onValueChange={setAccepted} disabled={busy || loading} />
        </View>
        <Button disabled={busy || loading || !accepted} onPress={() => void run("CONSENT")}>Enregistrer mon autorisation IA</Button>
      </> : null}
      {model.prepared && model.consentGranted && !model.credentialPrepared ? <View style={sharedStyles.stack}>
        <Text style={sharedStyles.muted}>Colle ta clé OpenRouter ici. Elle part directement vers ENDVERA par connexion chiffrée, est chiffrée sur le serveur et n’est pas conservée dans l’application.</Text>
        <TextInput accessibilityLabel="Clé OpenRouter" value={apiKey} onChangeText={setApiKey} maxLength={512}
          secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="off"
          importantForAutofill="noExcludeDescendants" placeholder="sk-or-v1-…" placeholderTextColor={colors.subtle} style={styles.secretInput} />
        <Button disabled={busy || loading || apiKey.length < 24} onPress={() => void provisionCredential()}>Chiffrer ma clé OpenRouter</Button>
      </View> : null}
      {model.prepared ? <Button tone="secondary" disabled={busy || loading} onPress={() => void run("DISCONNECT")}>Retirer mon accès IA</Button> : null}
    </> : null}
    {unavailable && !loading ? <Notice>La connexion IA est invérifiable pour le moment. Tu peux continuer la configuration du numéro ou du calendrier séparément.</Notice> : null}
    {message ? <Notice>{message}</Notice> : null}
    <Button tone="secondary" disabled={busy || loading} onPress={() => void reload()}>Actualiser la connexion IA</Button>
  </Card>;
}

const styles = StyleSheet.create({
  secretInput: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelStrong,
    color: colors.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
});
