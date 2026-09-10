import { useEffect, useMemo, useRef, useState } from "react";
import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from "expo-contacts";
import { Linking, Platform, Text, TextInput } from "react-native";
import { Button, Card, Label, Notice, colors, sharedStyles } from "@/components/ui";
import { MobileApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { chooseOneNativeContact, parseContactImportReceipt, prepareNativeContactImport, type NativeContactDraft, type NativeContactImportCommand, type SelectedNativeContact } from "@/lib/native-contact-import";

type Props = { workspaceId: string; workspaceName: string; projects: readonly { id: string; code: string; name: string }[]; refresh: () => Promise<void> };
const fieldStyle = { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 48 };

export function NativeContactImport({ workspaceId, workspaceName, projects, refresh }: Props) {
  const api = useMemo(() => new MobileApi({ getCookie: () => authClient.getCookie(), browserManagedCredentials: Platform.OS === "web" }), []);
  const [selected, setSelected] = useState<SelectedNativeContact | null>(null);
  const [draft, setDraft] = useState<NativeContactDraft>({ displayName: "", role: "", phone: "", email: "" });
  const [review, setReview] = useState<NativeContactImportCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [settingsNeeded, setSettingsNeeded] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function selectContact() {
    if (inFlight.current || Platform.OS === "web") return;
    inFlight.current = true; setBusy(true); setMessage(null); setSettingsNeeded(false);
    try {
      const result = await chooseOneNativeContact({
        readPermission: getPermissionsAsync, requestPermission: requestPermissionsAsync,
        pick: async () => {
          const contact = await Contact.presentPicker();
          return contact ? { readFields: () => contact.getDetails([ContactField.FULL_NAME, ContactField.PHONES, ContactField.EMAILS]) } : null;
        },
      });
      if (!mounted.current) return;
      if (result.status === "SELECTED_NOT_UPLOADED") {
        setSelected(result.contact); setDraft({ displayName: result.contact.displayName, role: "", phone: "", email: "" });
        setReview(null); setAttempted(false);
      } else if (result.status === "PERMISSION_DENIED") {
        setSettingsNeeded(!result.canAskAgain); setMessage("Accès aux contacts refusé. Aucun contact n’a été lu ni envoyé à ENDVERA.");
      } else if (result.status === "UNAVAILABLE") {
        setMessage("Impossible de lire le contact choisi dans cette version. Rien n’a été envoyé au serveur.");
      } else setMessage("Sélection annulée. Rien n’a été envoyé au serveur.");
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  async function saveReviewedContact() {
    if (inFlight.current || !review) return;
    inFlight.current = true; setBusy(true); setMessage(null); setAttempted(true);
    try {
      const receipt = parseContactImportReceipt(await api.onboardingCommand(review), review);
      if (!mounted.current) return;
      setMessage(receipt.created ? "Contact enregistré dans ENDVERA. Aucun SMS ni appel n’a été envoyé." : "Un contact correspondant existe déjà. Aucune coordonnée n’a été remplacée; consulte la fiche existante ci-dessous.");
      setReview(null); setSelected(null); setAttempted(false);
      setDraft({ displayName: "", role: "", phone: "", email: "" });
      try { await refresh(); }
      catch { if (mounted.current) setMessage("Le serveur a confirmé le contact, mais la liste n’a pas pu être actualisée. Ne recrée pas le contact."); }
    } catch {
      if (mounted.current) setMessage("Enregistrement non confirmé. Réessaie la même demande ci-dessous : son identifiant est conservé pour éviter de répéter l’import. Aucun SMS ni appel n’est lancé.");
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  return <Card>
    <Text style={sharedStyles.name}>Ajouter un contact de mon téléphone</Text>
    <Text style={sharedStyles.muted}>Choisis une seule personne dans le sélecteur du téléphone. Seuls son nom, ses numéros et ses courriels sont lus pour cet aperçu local. Tu sélectionnes ensuite les coordonnées exactes à enregistrer; le carnet complet n’est jamais importé.</Text>
    {Platform.OS === "web" ? <Notice>Le sélecteur de contacts demande l’application Android ou iOS installée.</Notice> : <Button disabled={busy || attempted} onPress={() => void selectContact()}>Choisir une personne</Button>}
    {settingsNeeded ? <Button tone="secondary" disabled={busy} onPress={() => { void Linking.openSettings().catch(() => setMessage("Ouvre Paramètres → Applications → ENDVERA → Autorisations → Contacts.")); }}>Ouvrir les autorisations Contacts</Button> : null}
    {selected && !review ? <>
      <Notice>Aperçu local — pas encore enregistré. Entre un rôle et choisis au moins un numéro ou un courriel. Tu peux aussi corriger les champs.</Notice>
      <Label>Nom à enregistrer</Label>
      <TextInput accessibilityLabel="Nom du contact à enregistrer" value={draft.displayName} onChangeText={displayName => setDraft(current => ({ ...current, displayName }))} maxLength={160} style={fieldStyle} />
      <Label>Rôle dans le chantier</Label>
      <TextInput accessibilityLabel="Rôle du contact" value={draft.role} onChangeText={role => setDraft(current => ({ ...current, role }))} maxLength={120} placeholder="Ex. Fournisseur" placeholderTextColor={colors.muted} style={fieldStyle} />
      {selected.phones.map(phone => <Button key={phone} tone="secondary" onPress={() => setDraft(current => ({ ...current, phone }))}>Utiliser {phone}</Button>)}
      <Label>Un numéro avec indicatif pays, ou laisser vide</Label>
      <TextInput accessibilityLabel="Numéro du contact avec indicatif pays" value={draft.phone} onChangeText={phone => setDraft(current => ({ ...current, phone }))} maxLength={80} keyboardType="phone-pad" placeholder="+1…" placeholderTextColor={colors.muted} style={fieldStyle} />
      {selected.emails.map(email => <Button key={email} tone="secondary" onPress={() => setDraft(current => ({ ...current, email }))}>Utiliser {email}</Button>)}
      <Label>Un courriel, ou laisser vide</Label>
      <TextInput accessibilityLabel="Courriel du contact" value={draft.email} onChangeText={email => setDraft(current => ({ ...current, email }))} maxLength={254} keyboardType="email-address" autoCapitalize="none" style={fieldStyle} />
      <Label>Chantier : {projects.find(project => project.id === draft.projectId)?.name ?? "Contact général"}</Label>
      <Button tone="secondary" onPress={() => setDraft(current => ({ ...current, projectId: undefined }))}>Contact général</Button>
      {projects.map(project => <Button key={project.id} tone="secondary" onPress={() => setDraft(current => ({ ...current, projectId: project.id }))}>{project.code} · {project.name}</Button>)}
      <Button disabled={busy} onPress={() => {
        try { setReview(prepareNativeContactImport(draft, { workspaceId, role: "OWNER", projectIds: projects.map(project => project.id), commandId: globalThis.crypto.randomUUID() })); setMessage(null); }
        catch { setMessage("Vérifie le nom, le rôle et les coordonnées. Un numéro doit commencer par + et son indicatif pays; au moins un numéro ou courriel valide est requis."); }
      }}>Vérifier les champs avant d’enregistrer</Button>
    </> : null}
    {review ? <>
      <Label>Champs exacts qui seront envoyés à ENDVERA</Label>
      <Text style={sharedStyles.value}>{workspaceName}{"\n"}{review.displayName}{"\n"}{review.role}{"\n"}{review.phone ?? "Sans téléphone"}{"\n"}{review.email ?? "Sans courriel"}{"\n"}{projects.find(project => project.id === review.projectId)?.name ?? "Contact général"}</Text>
      <Notice>Enregistrer cette fiche n’autorise pas ENDVERA à contacter cette personne.</Notice>
      <Button disabled={busy} onPress={() => void saveReviewedContact()}>{attempted ? "Réessayer exactement le même enregistrement" : "Confirmer ces champs et enregistrer"}</Button>
      {!attempted ? <Button disabled={busy} tone="secondary" onPress={() => setReview(null)}>Corriger avant d’envoyer</Button> : null}
    </> : null}
    {selected && !attempted ? <Button disabled={busy} tone="secondary" onPress={() => { setSelected(null); setReview(null); setDraft({ displayName: "", role: "", phone: "", email: "" }); setMessage("Aperçu local effacé."); }}>Annuler et effacer cet aperçu</Button> : null}
    {message ? <Notice>{message}</Notice> : null}
  </Card>;
}
