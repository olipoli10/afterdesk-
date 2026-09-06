import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppIcon } from "@/components/app-icon";
import {
  BrandHeader,
  Button,
  Card,
  Empty,
  Heading,
  IconButton,
  Loading,
  MobileRecoveryNotice,
  Notice,
  colors,
} from "@/components/ui";
import { createAssistantAttempt } from "@/lib/assistant";
import { createProjectBrainRecallCommand } from "@/lib/project-brain-assistant-memory";
import { mobileProductCopy, type MobileProductCopy } from "@/lib/product-experience";
import { assistantPrefillFromRoute } from "@/lib/virtual-secretary-actions";
import { useMobileSession } from "@/state/mobile-session";

function attemptLabel(state: string, copy: MobileProductCopy) {
  if (state === "SENDING") return copy.attempt.SENDING;
  if (state === "REPLAYED") return copy.attempt.REPLAYED;
  if (state === "OUTCOME_UNKNOWN") return copy.attempt.OUTCOME_UNKNOWN;
  if (state === "REFUSED") return copy.attempt.REFUSED;
  return null;
}

export default function AssistantScreen() {
  const params = useLocalSearchParams<{ projectId?: string | string[]; prompt?: string | string[] }>();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const scrollRef = useRef<ScrollView>(null);
  const consumedPrefill = useRef<string | null>(null);
  const {
    activeWorkspace,
    assistantHistory,
    assistantLoadState,
    latestAssistantAttempt,
    projectBrainAssistantMemory,
    projectBrainAssistantMemoryLoadState,
    latestProjectBrainAssistantResult,
    publicError,
    refreshAssistant,
    submitAssistantAttempt,
    loadProjectBrainAssistantMemory,
    submitProjectBrainAssistantMemoryCommand,
  } = useMobileSession();
  const [message, setMessage] = useState("");
  const copy = mobileProductCopy(activeWorkspace?.defaultLocale);

  useEffect(() => {
    void refreshAssistant();
  }, [refreshAssistant]);

  useEffect(() => {
    if (projectId) void loadProjectBrainAssistantMemory(projectId);
  }, [loadProjectBrainAssistantMemory, projectId]);

  useEffect(() => {
    const prefill = assistantPrefillFromRoute(params.prompt);
    if (!prefill || consumedPrefill.current === prefill) return;
    consumedPrefill.current = prefill;
    setMessage((current) => current.trim() ? current : prefill);
  }, [params.prompt]);

  if (activeWorkspace?.role === "FIELD_WORKER") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.protectedContent}>
          <BrandHeader workspace={activeWorkspace.name} onMore={() => router.push("/more")} moreLabel={copy.tabs.more} />
          <Heading eyebrow={copy.assistantEyebrow} title={copy.assistantProtectedTitle} body={copy.assistantProtectedBody} />
          <Card><Empty>{copy.assistantProtectedEmpty}</Empty></Card>
        </ScrollView>
      </SafeAreaView>
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

  const recall = async (questionKind: "PROJECT_SUMMARY" | "PROJECT_SCOPE" | "IMPORTANT_PEOPLE" | "IMPORTANT_DATES" | "BLOCKERS" | "NEXT_DECISION" | "REVIEWED_SOURCE_INVENTORY" | "RESOLVED_CONTRADICTION_HISTORY") => {
    const memory = projectBrainAssistantMemory?.currentMemory;
    if (!activeWorkspace || !projectId || !memory) return;
    await submitProjectBrainAssistantMemoryCommand(createProjectBrainRecallCommand({
      workspaceId: activeWorkspace.id,
      projectId,
      confirmedUnderstandingSequence: memory.confirmedUnderstandingSequence,
      memoryCanonicalHash: memory.memoryCanonicalHash,
      questionKind,
    }));
  };

  const stateLabel = latestAssistantAttempt ? attemptLabel(latestAssistantAttempt.state, copy) : null;
  const result = latestAssistantAttempt?.result;
  const sending = latestAssistantAttempt?.state === "SENDING";

  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" style={styles.ambientTop} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.conversation}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <BrandHeader workspace={activeWorkspace?.name} onMore={() => router.push("/more")} moreLabel={copy.tabs.more} />
          <Heading eyebrow={copy.assistantEyebrow} title={copy.assistantTitle} body={copy.assistantBody} />

          {projectId ? (
            <Card style={styles.memoryCard}>
              <Text style={styles.memoryTitle}>{copy.assistantMemory.title}</Text>
              <Text style={styles.memoryBody}>{copy.assistantMemory.body}</Text>
              {projectBrainAssistantMemoryLoadState === "LOADING" ? <Loading label={copy.loadingConversation} /> : null}
              {projectBrainAssistantMemoryLoadState !== "LOADING" && !projectBrainAssistantMemory?.currentMemory ? <Empty>{copy.assistantMemory.unavailable}</Empty> : null}
              {projectBrainAssistantMemory?.currentMemory ? (
                <>
                  <Text style={styles.memoryVersion}>{copy.assistantMemory.confirmed} #{projectBrainAssistantMemory.currentMemory.confirmedUnderstandingSequence}</Text>
                  <View style={styles.memoryQuestions}>
                    {([
                      ["PROJECT_SUMMARY", copy.assistantMemory.summary], ["PROJECT_SCOPE", copy.assistantMemory.scope],
                      ["IMPORTANT_PEOPLE", copy.assistantMemory.people], ["IMPORTANT_DATES", copy.assistantMemory.dates],
                      ["BLOCKERS", copy.assistantMemory.blockers], ["NEXT_DECISION", copy.assistantMemory.next],
                      ["REVIEWED_SOURCE_INVENTORY", copy.assistantMemory.sources], ["RESOLVED_CONTRADICTION_HISTORY", copy.assistantMemory.contradictions],
                    ] as const).map(([kind, label]) => (
                      <Pressable key={kind} accessibilityRole="button" accessibilityLabel={`${copy.assistantMemory.ask}: ${label}`} onPress={() => void recall(kind)} style={({ pressed }) => [styles.memoryQuestion, pressed && styles.pressed]}>
                        <Text style={styles.memoryQuestionText}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
              {latestProjectBrainAssistantResult?.action === "RECALL_CONFIRMED_PROJECT_MEMORY" ? (
                <View style={styles.memoryResult}>
                  <Text style={styles.memoryTitle}>{latestProjectBrainAssistantResult.answer.label}</Text>
                  {latestProjectBrainAssistantResult.answer.values.length ? latestProjectBrainAssistantResult.answer.values.map((value, index) => <Text key={`${index}-${value}`} style={styles.messageText}>• {value}</Text>) : <Text style={styles.memoryBody}>—</Text>}
                  <Text style={styles.memoryProof}>{copy.assistantMemory.citations}: {latestProjectBrainAssistantResult.answer.citations.length}</Text>
                </View>
              ) : null}
              {projectBrainAssistantMemory?.preparedActions.map((preparedAction) => (
                <View key={preparedAction.bindingId} style={styles.preparedAction}>
                  <Text style={styles.memoryTitle}>{copy.assistantMemory.prepared}</Text>
                  <Text style={styles.messageText}>{copy.assistantMemory.recipient}: {preparedAction.recipientDisplayName} ({preparedAction.recipientRef})</Text>
                  <Text style={styles.messageText}>{copy.assistantMemory.channel}: {preparedAction.channel}</Text>
                  {preparedAction.subject ? <Text style={styles.messageText}>{preparedAction.subject}</Text> : null}
                  <Text style={styles.messageText}>{copy.assistantMemory.exactMessage}: {preparedAction.body}</Text>
                  <Text style={styles.memoryProof}>{copy.assistantMemory.approval} · {copy.assistantMemory.citations}: {preparedAction.citations.length}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {publicError ? (
            <MobileRecoveryNotice message={publicError} hint={copy.errorRecoveryHint} actionLabel={copy.refresh} busy={assistantLoadState === "LOADING"} onRetry={() => void refreshAssistant()} />
          ) : null}

          {!activeWorkspace ? (
            <Card><Empty>{copy.assistantNoWorkspace}</Empty></Card>
          ) : assistantLoadState === "LOADING" && !assistantHistory ? (
            <Loading label={copy.loadingConversation} />
          ) : assistantHistory?.messages.length ? (
            <View style={styles.messages}>
              {assistantHistory.messages.map((item) => (
                <View key={item.id} style={[styles.messageRow, item.direction === "inbound" && styles.messageRowMine]}>
                  {item.direction === "outbound" ? <View style={styles.endveraAvatar}><Text style={styles.avatarText}>N</Text></View> : null}
                  <View style={[styles.bubble, item.direction === "inbound" ? styles.mine : styles.endvera]}>
                    <Text style={styles.speaker}>{item.direction === "inbound" ? "Toi" : "ENDVERA"}</Text>
                    <Text style={styles.messageText}>{item.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.welcome}>
              <View style={styles.welcomeMark}><AppIcon name="assistant" color={colors.accentBright} size={30} /></View>
              <Text style={styles.welcomeTitle}>{copy.emptyConversation}</Text>
              <View style={styles.suggestions}>
                {copy.assistantSuggestions.map((suggestion) => (
                  <Pressable key={suggestion} accessibilityRole="button" accessibilityLabel={suggestion} onPress={() => setMessage(suggestion)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                    <AppIcon name="arrow" color={colors.accentBright} size={17} />
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {stateLabel ? <Notice danger={["REFUSED", "OUTCOME_UNKNOWN"].includes(latestAssistantAttempt?.state ?? "")}>{stateLabel}</Notice> : null}
          {result?.status === "PREPARED_UNSENT" ? (
            <>
              <Notice>{copy.assistantPrepared}</Notice>
              <Button tone="secondary" onPress={() => router.push("/messages")}>Voir les destinataires et approuver</Button>
            </>
          ) : null}
          {result?.status === "CLARIFICATION_REQUIRED" ? <Notice>{copy.assistantClarification}</Notice> : null}
          {result?.routing?.readiness === "PROVIDER_REQUIRED_NOT_AUTHORIZED" ? <Notice>{copy.assistantProviderUnavailable}</Notice> : null}
          {result?.routing?.readiness === "HUMAN_SUPPORT_AVAILABLE" ? <Notice>{copy.assistantHumanSupport}</Notice> : null}
          {latestAssistantAttempt?.state === "OUTCOME_UNKNOWN" ? (
            <Button accessibilityRole="button" accessibilityLabel={copy.retry} tone="secondary" icon="sync" onPress={retry}>{copy.retry}</Button>
          ) : null}
        </ScrollView>

        {activeWorkspace ? (
          <View style={styles.composerDock}>
            <Text style={styles.trustLine}>{copy.assistantTrustLine}</Text>
            <View style={styles.composer}>
              <IconButton icon="attachment" label={copy.assistantAttach} onPress={() => router.push("/evidence")} disabled={sending} />
              <TextInput
                accessibilityLabel={copy.assistantInputLabel}
                style={styles.input}
                multiline
                value={message}
                onChangeText={setMessage}
                placeholder={copy.assistantPlaceholder}
                placeholderTextColor={colors.subtle}
                maxLength={10_000}
                editable={!sending}
              />
              {message.trim() ? (
                <IconButton icon="send" label={copy.submit} onPress={() => void submit()} filled disabled={sending} />
              ) : (
                <IconButton icon="microphone" label={copy.assistantVoice} onPress={() => router.push("/calls")} filled disabled={sending} />
              )}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, overflow: "hidden" },
  fill: { flex: 1 },
  ambientTop: { position: "absolute", top: -160, right: -120, width: 340, height: 340, borderRadius: 170, backgroundColor: "#22160D", opacity: 0.7 },
  protectedContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120, gap: 18 },
  conversation: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 234, gap: 18 },
  messages: { gap: 16 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "94%" },
  messageRowMine: { alignSelf: "flex-end", justifyContent: "flex-end" },
  endveraAvatar: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, marginBottom: 2 },
  avatarText: { color: "#160C05", fontSize: 13, fontWeight: "900" },
  bubble: { borderRadius: 19, paddingHorizontal: 14, paddingVertical: 11, gap: 4, maxWidth: "88%" },
  mine: { backgroundColor: colors.accentSoft, borderBottomRightRadius: 6, borderWidth: 1, borderColor: colors.borderWarm },
  endvera: { backgroundColor: colors.panelStrong, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.border },
  speaker: { color: colors.accentBright, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  messageText: { color: colors.text, fontSize: 16, lineHeight: 23 },
  welcome: { alignItems: "center", gap: 14, paddingTop: 18 },
  welcomeMark: { width: 66, height: 66, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.panelWarm, borderWidth: 1, borderColor: colors.borderWarm },
  welcomeTitle: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "700", textAlign: "center" },
  suggestions: { alignSelf: "stretch", gap: 9 },
  suggestion: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 15, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  suggestionText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  composerDock: { position: "absolute", left: 0, right: 0, bottom: Platform.OS === "ios" ? 86 : 74, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, backgroundColor: "#09090BF2", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  trustLine: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: "center", marginBottom: 7 },
  composer: { minHeight: 62, flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8, borderRadius: 22, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, minHeight: 44, maxHeight: 112, color: colors.text, paddingHorizontal: 8, paddingVertical: 10, fontSize: 16, lineHeight: 22, textAlignVertical: "top" },
  pressed: { opacity: 0.72 },
  memoryCard: { gap: 12 },
  memoryTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  memoryBody: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  memoryVersion: { color: colors.accentBright, fontSize: 12, fontWeight: "800" },
  memoryQuestions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  memoryQuestion: { minHeight: 38, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderWarm, backgroundColor: colors.panelWarm },
  memoryQuestionText: { color: colors.accentBright, fontSize: 12, fontWeight: "700" },
  memoryResult: { gap: 7, padding: 12, borderRadius: 14, backgroundColor: colors.panelStrong, borderWidth: 1, borderColor: colors.border },
  memoryProof: { color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  preparedAction: { gap: 7, padding: 12, borderRadius: 14, backgroundColor: colors.panelWarm, borderWidth: 1, borderColor: colors.borderWarm },
});
