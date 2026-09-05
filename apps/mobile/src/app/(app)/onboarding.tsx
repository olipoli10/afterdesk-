import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Text, TextInput } from "react-native";
import { Button, Card, Empty, Heading, Label, Loading, Notice, Screen, colors, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, padding: 12, backgroundColor: colors.panel } as const;

export default function OnboardingScreen() {
  const { activeWorkspace, onboardingCockpit, onboardingLoadState, publicError, loadOnboarding, submitOnboardingCommand } = useMobileSession();
  const [workspaceName, setWorkspaceName] = useState("Mon entreprise de construction");
  const [projectCode, setProjectCode] = useState("CHANTIER-001");
  const [projectName, setProjectName] = useState("Premier chantier");
  const [contactName, setContactName] = useState("Marc");
  const [contactRole, setContactRole] = useState("Fournisseur");
  const [csvText, setCsvText] = useState("display_name,role,phone,email,project_code\nMarc,Fournisseur,+15555550184,marc@example.invalid,CHANTIER-001");

  useEffect(() => {
    if (onboardingLoadState !== "IDLE") return;
    void loadOnboarding(activeWorkspace?.id);
  }, [activeWorkspace?.id, loadOnboarding, onboardingLoadState]);

  if (onboardingCockpit?.role === "FIELD_WORKER") return <Screen><Heading eyebrow="DÉMARRAGE" title="Tes chantiers assignés" body="Les imports et les contacts de l’entreprise restent privés." />{onboardingCockpit.assignedProjects.length ? onboardingCockpit.assignedProjects.map((project) => <Card key={project.id}><Text style={sharedStyles.name}>{project.name}</Text><Text style={sharedStyles.muted}>{project.code}</Text></Card>) : <Card><Empty>Aucun chantier assigné.</Empty></Card>}</Screen>;

  const workspaceId = onboardingCockpit?.workspace?.id;
  const projects = onboardingCockpit?.projects ?? [];
  const contacts = onboardingCockpit?.contacts ?? [];
  const batch = onboardingCockpit?.activeBatch;
  return <Screen>
    <Heading eyebrow="DÉMARRAGE ENDVERA" title="Ton assistant, connecté à ta façon" body="Commence par comprendre le produit, puis ajoute seulement le contexte et les accès qui te servent." />
    <Card><Text style={sharedStyles.name}>Texte ou parle à ENDVERA</Text><Text style={sharedStyles.muted}>Vois le numéro dédié, le cerveau AI et chaque permission avant de connecter quoi que ce soit.</Text><Button onPress={() => router.push("/text-assist" as never)}>Configurer TextAssist</Button></Card>
    {onboardingLoadState === "LOADING" ? <Loading label="État canonique en lecture…" /> : null}
    {publicError ? <Notice danger>{publicError}</Notice> : null}
    {!workspaceId ? <Card><Label>Ton entreprise</Label><TextInput style={inputStyle} value={workspaceName} maxLength={160} onChangeText={setWorkspaceName} placeholder="Nom de l’entreprise" placeholderTextColor={colors.muted}/><Button onPress={() => void submitOnboardingCommand({ schemaVersion: 1, action: "INITIALIZE_WORKSPACE", commandId: globalThis.crypto.randomUUID(), name: workspaceName, timezone: "America/Toronto", locale: "fr-CA" })}>Créer mon espace</Button></Card> : null}
    {workspaceId && projects.length === 0 ? <Card><Label>Premier chantier</Label><TextInput style={inputStyle} value={projectCode} maxLength={40} onChangeText={setProjectCode} placeholder="Code" placeholderTextColor={colors.muted}/><TextInput style={inputStyle} value={projectName} maxLength={160} onChangeText={setProjectName} placeholder="Nom" placeholderTextColor={colors.muted}/><Button onPress={() => void submitOnboardingCommand({ schemaVersion: 1, action: "CREATE_FIRST_PROJECT", commandId: globalThis.crypto.randomUUID(), workspaceId, code: projectCode, name: projectName })}>Créer le chantier</Button></Card> : null}
    {workspaceId && projects.length > 0 && contacts.length === 0 ? <Card><Label>Premier contact</Label><TextInput style={inputStyle} value={contactName} maxLength={160} onChangeText={setContactName} placeholder="Nom" placeholderTextColor={colors.muted}/><TextInput style={inputStyle} value={contactRole} maxLength={120} onChangeText={setContactRole} placeholder="Rôle" placeholderTextColor={colors.muted}/><Button onPress={() => void submitOnboardingCommand({ schemaVersion: 1, action: "CREATE_FIRST_CONTACT", commandId: globalThis.crypto.randomUUID(), workspaceId, projectId: projects[0].id, displayName: contactName, role: contactRole })}>Ajouter le contact</Button></Card> : null}
    {workspaceId && projects.length > 0 && contacts.length > 0 && !batch ? <Card><Label>Contexte prêt</Label><Text style={sharedStyles.name}>{projects.length} chantier(s) · {contacts.length} contact(s)</Text><Text style={sharedStyles.muted}>Tu peux opérer maintenant ou prévisualiser un petit CSV.</Text><TextInput style={[inputStyle, { minHeight: 120 }]} multiline value={csvText} onChangeText={setCsvText} placeholder="CSV contacts" placeholderTextColor={colors.muted}/><Button onPress={() => void submitOnboardingCommand({ schemaVersion: 1, action: "PREVIEW_IMPORT", commandId: globalThis.crypto.randomUUID(), workspaceId, kind: "CONTACTS_CSV", csvText })}>Prévisualiser sans écrire</Button>{onboardingCockpit?.session?.status === "ACTIVE" ? <Button tone="secondary" onPress={() => void submitOnboardingCommand({ schemaVersion: 1, action: "COMPLETE_ONBOARDING", commandId: globalThis.crypto.randomUUID(), workspaceId, expectedSessionVersion: onboardingCockpit.session!.stateVersion })}>Commencer à opérer</Button> : null}</Card> : null}
    {workspaceId && batch ? <><Card><Label>Prévisualisation immuable</Label><Text style={sharedStyles.name}>{batch.rowCount} ligne(s)</Text><Text style={sharedStyles.muted}>Prêtes {batch.counts.ready} · doublons {batch.counts.duplicate} · conflits {batch.counts.conflict} · invalides {batch.counts.invalid}</Text></Card>{batch.rows.map((row) => <Card key={row.id}><Text style={sharedStyles.name}>Ligne {row.rowNumber} · {row.state}</Text><Text style={sharedStyles.muted}>{Object.values(row.normalizedProposal).filter(Boolean).join(" · ")}</Text>{row.state !== "READY" && !row.decision ? <><Button tone="secondary" onPress={() => void submitOnboardingCommand({ schemaVersion: 1, action: "DECIDE_IMPORT_ROW", commandId: globalThis.crypto.randomUUID(), workspaceId, batchId: batch.id, rowId: row.id, expectedBatchVersion: batch.stateVersion, decision: "SKIP" })}>Ignorer</Button>{row.candidateCanonicalIds[0] ? <Button onPress={() => void submitOnboardingCommand({ schemaVersion: 1, action: "DECIDE_IMPORT_ROW", commandId: globalThis.crypto.randomUUID(), workspaceId, batchId: batch.id, rowId: row.id, expectedBatchVersion: batch.stateVersion, decision: "USE_EXISTING", matchedCanonicalId: row.candidateCanonicalIds[0] })}>Utiliser l’existant</Button> : null}{row.state === "CONFLICT" && row.candidateCanonicalIds.length === 0 ? <Button onPress={() => void submitOnboardingCommand({ schemaVersion: 1, action: "DECIDE_IMPORT_ROW", commandId: globalThis.crypto.randomUUID(), workspaceId, batchId: batch.id, rowId: row.id, expectedBatchVersion: batch.stateVersion, decision: "CREATE_NEW" })}>Créer cette ligne</Button> : null}</> : <Text style={sharedStyles.muted}>{row.decision?.action ?? "Prête"}</Text>}</Card>)}{batch.status === "READY_TO_COMMIT" ? <Button onPress={() => void submitOnboardingCommand({ schemaVersion: 1, action: "COMMIT_IMPORT", commandId: globalThis.crypto.randomUUID(), workspaceId, batchId: batch.id, expectedBatchVersion: batch.stateVersion, sourceHash: batch.sourceHash, previewFingerprint: batch.previewFingerprint })}>Appliquer exactement une fois</Button> : null}</> : null}
  </Screen>;
}
