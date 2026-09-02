import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import {
  Button,
  Card,
  Empty,
  Heading,
  Label,
  Loading,
  Notice,
  Screen,
  colors,
  sharedStyles,
} from "@/components/ui";
import { createAssistantAttempt } from "@/lib/assistant";
import { useMobileSession } from "@/state/mobile-session";

function attemptLabel(state: string) {
  if (state === "SENDING") return "ENDVERA travaille…";
  if (state === "REPLAYED") return "Résultat récupéré sans doublon.";
  if (state === "OUTCOME_UNKNOWN") return "Résultat inconnu — réessaie exactement la même demande.";
  if (state === "REFUSED") return "Demande refusée sans effet inventé.";
  return null;
}

export default function AssistantScreen() {
  const {
    activeWorkspace,
    assistantHistory,
    assistantLoadState,
    latestAssistantAttempt,
    publicError,
    refreshAssistant,
    submitAssistantAttempt,
  } = useMobileSession();
  const [message, setMessage] = useState("");

  useEffect(() => {
    void refreshAssistant();
  }, [refreshAssistant]);

  if (activeWorkspace?.role === "FIELD_WORKER") {
    return (
      <Screen>
        <Heading eyebrow="PARLER À ENDVERA" title="Assistant protégé" body="Cette version est réservée au propriétaire et au gestionnaire de bureau." />
        <Card><Empty>Aucune conversation ou donnée financière n’est exposée dans le rôle chantier.</Empty></Card>
      </Screen>
    );
  }

  const submit = async () => {
    if (!activeWorkspace || !message.trim()) return;
    const attempt = createAssistantAttempt({ workspace: activeWorkspace, message });
    setMessage("");
    await submitAssistantAttempt(attempt);
  };

  const retry = async () => {
    if (latestAssistantAttempt?.state !== "OUTCOME_UNKNOWN") return;
    await submitAssistantAttempt(latestAssistantAttempt);
  };

  const stateLabel = latestAssistantAttempt ? attemptLabel(latestAssistantAttempt.state) : null;
  const result = latestAssistantAttempt?.result;

  return (
    <Screen>
      <Heading
        eyebrow="PARLER À ENDVERA"
        title="Ton assistant de chantier"
        body="Pose une question ou demande une action. PostgreSQL garde l’état; aucun message externe n’est envoyé dans cette version."
      />
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {!activeWorkspace ? (
        <Card><Empty>Aucun espace Construction actif.</Empty></Card>
      ) : (
        <>
          <Card>
            <Label>Conversation persistante</Label>
            {assistantLoadState === "LOADING" && !assistantHistory ? <Loading label="ENDVERA retrouve la conversation…" /> : null}
            {assistantHistory?.messages.length ? assistantHistory.messages.map((item) => (
              <View key={item.id} style={[styles.bubble, item.direction === "inbound" ? styles.mine : styles.endvera]}>
                <Text style={styles.speaker}>{item.direction === "inbound" ? "Toi" : "ENDVERA"}</Text>
                <Text style={sharedStyles.value}>{item.body}</Text>
              </View>
            )) : assistantLoadState !== "LOADING" ? <Empty>Aucun message. Essaie « Qu’est-ce que j’ai demain? »</Empty> : null}
          </Card>

          <Card>
            <Label>Ta demande</Label>
            <TextInput
              style={styles.input}
              multiline
              value={message}
              onChangeText={setMessage}
              placeholder="Ex. Rendez-vous avec Marc mardi à 14 h pour Laval."
              placeholderTextColor={colors.muted}
              maxLength={10_000}
              editable={latestAssistantAttempt?.state !== "SENDING"}
            />
            <Button onPress={submit} disabled={!message.trim() || latestAssistantAttempt?.state === "SENDING"}>
              {latestAssistantAttempt?.state === "SENDING" ? "Traitement…" : "Envoyer à ENDVERA"}
            </Button>
            {stateLabel ? <Notice danger={latestAssistantAttempt?.state === "REFUSED" || latestAssistantAttempt?.state === "OUTCOME_UNKNOWN"}>{stateLabel}</Notice> : null}
            {result?.status === "PREPARED_UNSENT" ? <Notice>Message préparé — rien n’a été envoyé.</Notice> : null}
            {result?.status === "CLARIFICATION_REQUIRED" ? <Notice>ENDVERA attend ta précision avant d’écrire quoi que ce soit.</Notice> : null}
            {result?.routing?.readiness === "PROVIDER_REQUIRED_NOT_AUTHORIZED" ? (
              <Notice>ENDVERA reconnaît cette demande, mais la recherche externe n’est pas encore activée. Aucun résultat n’a été inventé.</Notice>
            ) : null}
            {result?.routing?.readiness === "HUMAN_SUPPORT_AVAILABLE" ? (
              <Notice>Un soutien humain borné est possible, mais aucune tâche n’a été créée automatiquement.</Notice>
            ) : null}
            {latestAssistantAttempt?.state === "OUTCOME_UNKNOWN" ? <Button tone="secondary" onPress={retry}>Réessayer la même demande</Button> : null}
          </Card>
          <Button tone="secondary" onPress={refreshAssistant} disabled={assistantLoadState === "LOADING"}>
            {assistantLoadState === "LOADING" ? "Synchronisation…" : "Recharger la conversation"}
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: 14, padding: 12, gap: 5, maxWidth: "92%" },
  mine: { backgroundColor: colors.accentSoft, alignSelf: "flex-end" },
  endvera: { backgroundColor: colors.panelStrong, alignSelf: "flex-start" },
  speaker: { color: colors.accent, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  input: {
    minHeight: 112,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelStrong,
    color: colors.text,
    padding: 14,
    fontSize: 16,
    lineHeight: 23,
    textAlignVertical: "top",
  },
});
