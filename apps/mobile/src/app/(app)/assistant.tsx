import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import {
  Button,
  Card,
  Empty,
  Heading,
  Label,
  Loading,
  MobileRecoveryNotice,
  Notice,
  Screen,
  colors,
  sharedStyles,
} from "@/components/ui";
import { createAssistantAttempt } from "@/lib/assistant";
import { mobileProductCopy, type MobileProductCopy } from "@/lib/product-experience";
import { useMobileSession } from "@/state/mobile-session";

function attemptLabel(state: string, copy: MobileProductCopy) {
  if (state === "SENDING") return copy.attempt.SENDING;
  if (state === "REPLAYED") return copy.attempt.REPLAYED;
  if (state === "OUTCOME_UNKNOWN") return copy.attempt.OUTCOME_UNKNOWN;
  if (state === "REFUSED") return copy.attempt.REFUSED;
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
  const copy = mobileProductCopy(activeWorkspace?.defaultLocale);

  useEffect(() => {
    void refreshAssistant();
  }, [refreshAssistant]);

  if (activeWorkspace?.role === "FIELD_WORKER") {
    return (
      <Screen>
        <Heading eyebrow={copy.assistantEyebrow} title={copy.assistantProtectedTitle} body={copy.assistantProtectedBody} />
        <Card><Empty>{copy.assistantProtectedEmpty}</Empty></Card>
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

  const stateLabel = latestAssistantAttempt ? attemptLabel(latestAssistantAttempt.state, copy) : null;
  const result = latestAssistantAttempt?.result;

  return (
    <Screen>
      <Heading
        eyebrow={copy.assistantEyebrow}
        title={copy.assistantTitle}
        body={copy.assistantBody}
      />
      {publicError ? <MobileRecoveryNotice message={publicError} hint={copy.errorRecoveryHint} actionLabel={copy.refresh} busy={assistantLoadState === "LOADING"} onRetry={() => void refreshAssistant()} /> : null}
      {!activeWorkspace ? (
        <Card><Empty>Aucun espace Construction actif.</Empty></Card>
      ) : (
        <>
          <Card>
            <Label>{copy.conversation}</Label>
            {assistantLoadState === "LOADING" && !assistantHistory ? <Loading label={copy.loadingConversation} /> : null}
            {assistantHistory?.messages.length ? assistantHistory.messages.map((item) => (
              <View key={item.id} style={[styles.bubble, item.direction === "inbound" ? styles.mine : styles.endvera]}>
                <Text style={styles.speaker}>{item.direction === "inbound" ? "Toi" : "ENDVERA"}</Text>
                <Text style={sharedStyles.value}>{item.body}</Text>
              </View>
            )) : assistantLoadState !== "LOADING" ? <Empty>{copy.emptyConversation}</Empty> : null}
          </Card>

          <Card>
            <Label>{copy.request}</Label>
            <TextInput
              accessibilityLabel={copy.assistantInputLabel}
              style={styles.input}
              multiline
              value={message}
              onChangeText={setMessage}
              placeholder={copy.assistantPlaceholder}
              placeholderTextColor={colors.muted}
              maxLength={10_000}
              editable={latestAssistantAttempt?.state !== "SENDING"}
            />
            <Button accessibilityRole="button" accessibilityLabel={copy.submit} accessibilityState={{ busy: latestAssistantAttempt?.state === "SENDING", disabled: !message.trim() || latestAssistantAttempt?.state === "SENDING" }} onPress={submit} disabled={!message.trim() || latestAssistantAttempt?.state === "SENDING"}>
              {latestAssistantAttempt?.state === "SENDING" ? copy.processing : copy.submit}
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
            {latestAssistantAttempt?.state === "OUTCOME_UNKNOWN" ? <Button accessibilityRole="button" accessibilityLabel={copy.retry} tone="secondary" onPress={retry}>{copy.retry}</Button> : null}
          </Card>
          <Button accessibilityRole="button" accessibilityLabel={copy.refresh} accessibilityState={{ busy: assistantLoadState === "LOADING", disabled: assistantLoadState === "LOADING" }} tone="secondary" onPress={refreshAssistant} disabled={assistantLoadState === "LOADING"}>
            {assistantLoadState === "LOADING" ? copy.refreshing : copy.refresh}
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
