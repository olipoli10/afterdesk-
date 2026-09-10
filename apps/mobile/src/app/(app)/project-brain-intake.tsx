import * as DocumentPicker from "expo-document-picker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Heading, Label, Loading, Notice, Screen, colors, sharedStyles } from "@/components/ui";
import {
  PROJECT_BRAIN_MAX_SOURCE_BYTES,
  PROJECT_BRAIN_MAX_VOICE_DURATION_MS,
  createProjectBrainSourceAttempts,
  projectBrainBriefHydrationKey,
  projectBrainIntakeForContext,
  projectBrainOwnerBriefDraft,
  projectBrainOwnerBriefMatches,
  projectBrainSourceQueueForContext,
  type MobileProjectBrainCommand,
  type MobileProjectBrainSourceCommand,
  type ProjectBrainSourceAttempt,
} from "@/lib/project-brain-intake";
import {
  projectBrainCanCreateNewVersion,
  projectBrainCommandQueueForContext,
  projectBrainIntentPresentation,
  type ProjectBrainCommandAttempt,
} from "@/lib/project-brain-intent-queue";
import { mobileProductCopy } from "@/lib/product-experience";
import { createProjectBrainSourcePicker, PROJECT_BRAIN_PICKER_TYPES, projectBrainPickerMessage, type ProjectBrainPickerContext } from "@/lib/project-brain-source-picker";
import { useMobileSession } from "@/state/mobile-session";

export default function ProjectBrainIntakeScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const {
    activeWorkspace, cockpit, publicError, projectBrainIntake, projectBrainLoadState, projectBrainCommandQueue, projectBrainSourceQueue,
    loadProjectBrainIntake, submitProjectBrainCommand, retryProjectBrainCommand, stageProjectBrainSources,
    uploadProjectBrainSource, retryProjectBrainSource, dismissProjectBrainIntent,
  } = useMobileSession();
  const copy = mobileProductCopy(activeWorkspace?.defaultLocale).projectBrain;
  const project = cockpit?.projects.find((item) => item.id === projectId);
  const intake = projectBrainIntakeForContext(projectBrainIntake, activeWorkspace?.id, projectId);
  const commandQueue = projectBrainCommandQueueForContext(projectBrainCommandQueue, activeWorkspace?.id, projectId);
  const sourceQueue = projectBrainSourceQueueForContext(projectBrainSourceQueue, activeWorkspace?.id, projectId);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [summary, setSummary] = useState("");
  const [scope, setScope] = useState("");
  const [importantPeople, setImportantPeople] = useState("");
  const [importantDates, setImportantDates] = useState("");
  const [blockers, setBlockers] = useState("");
  const [nextDecision, setNextDecision] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [sourcePicker] = useState(createProjectBrainSourcePicker);
  const pickerContextRef = useRef<ProjectBrainPickerContext | null>(null);
  const pickerMounted = useRef(true);
  useEffect(() => { pickerMounted.current = true; return () => { pickerMounted.current = false; }; }, []);
  const recordingSeen = useRef(false);
  const manualVoiceStop = useRef(false);
  const finalizingVoice = useRef(false);
  const finalizeRecordedVoiceRef = useRef<() => Promise<void>>(async () => undefined);
  const lastBriefHydrationKey = useRef<string | null>(null);
  const briefHydrationKey = projectBrainBriefHydrationKey({
    workspaceId: activeWorkspace?.id,
    projectId,
    intakeId: intake?.id,
    durable: intake?.ownerBrief,
  });

  useEffect(() => { if (projectId) void loadProjectBrainIntake(projectId); }, [loadProjectBrainIntake, projectId]);
  useEffect(() => {
    if (lastBriefHydrationKey.current === briefHydrationKey) return;
    lastBriefHydrationKey.current = briefHydrationKey;
    const draft = projectBrainOwnerBriefDraft(intake?.ownerBrief);
    setSummary(draft.summary); setScope(draft.scope);
    setImportantPeople(draft.importantPeople); setImportantDates(draft.importantDates);
    setBlockers(draft.blockers); setNextDecision(draft.nextDecision);
  }, [briefHydrationKey, intake?.ownerBrief]);

  const canManage = activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "OFFICE_MANAGER";
  const busy = pickerBusy || projectBrainLoadState === "LOADING"
    || commandQueue.some((item) => item.state === "SENDING")
    || sourceQueue.some((item) => item.state === "SENDING");
  const hasPendingCommand = commandQueue.some((item) => item.state === "READY" || item.state === "SENDING" || item.state === "OUTCOME_UNKNOWN");
  const hasUnknownSourceOutcome = sourceQueue.some((item) => item.state === "OUTCOME_UNKNOWN");
  const intakeId = intake?.id;
  const intakeStateVersion = intake?.stateVersion;
  const pickerWorkspaceId = activeWorkspace?.id;
  const pickerIntakeStatus = intake?.status;
  useLayoutEffect(() => {
    pickerContextRef.current = canManage && pickerWorkspaceId && projectId && intakeId && intakeStateVersion
      && pickerIntakeStatus === "DRAFT" && !hasPendingCommand && projectBrainLoadState !== "LOADING"
      ? { workspaceId: pickerWorkspaceId, projectId, intakeId, stateVersion: intakeStateVersion } : null;
    return () => { pickerContextRef.current = null; };
  }, [canManage, pickerWorkspaceId, projectId, intakeId, intakeStateVersion, pickerIntakeStatus, hasPendingCommand, projectBrainLoadState]);
  const briefDraft = { summary, scope, importantPeople, importantDates, blockers, nextDecision };
  const briefIsDurable = projectBrainOwnerBriefMatches(intake?.ownerBrief ?? null, briefDraft);
  const commandBase = () => ({ schemaVersion: 1 as const, commandId: globalThis.crypto.randomUUID(), workspaceId: activeWorkspace!.id, projectId: projectId! });

  const runCommand = async (command: MobileProjectBrainCommand) => {
    setLocalError(null);
    try {
      await submitProjectBrainCommand(command);
    } catch {
      setLocalError(copy.localQueueUnavailable);
    }
  };
  const create = async () => { if (activeWorkspace && projectId) await runCommand({ ...commandBase(), action: "CREATE_PROJECT_BRAIN_INTAKE" }); };
  const saveBrief = async () => {
    if (!intake) return;
    await runCommand({ ...commandBase(), action: "ADD_OWNER_BRIEF", intakeId: intake.id, expectedStateVersion: intake.stateVersion,
      brief: { summary, scope, importantPeople, importantDates, blockers, nextDecision } });
  };
  const decide = async (action: "SUBMIT_PROJECT_BRAIN_INTAKE" | "CONFIRM_PROJECT_BRAIN_INTAKE" | "REJECT_PROJECT_BRAIN_INTAKE") => {
    if (!intake) return;
    const base = { ...commandBase(), action, intakeId: intake.id, expectedStateVersion: intake.stateVersion };
    const command = action === "SUBMIT_PROJECT_BRAIN_INTAKE" ? base : { ...base, reviewFingerprint: intake.reviewFingerprint! };
    await runCommand(command as MobileProjectBrainCommand);
  };

  const sendSources = async (sources: Omit<MobileProjectBrainSourceCommand, "expectedStateVersion">[], expectedVersion = intakeStateVersion) => {
    if (!intakeId || !expectedVersion) return;
    const attempts = createProjectBrainSourceAttempts(sources, expectedVersion);
    try {
      const durableAttempts = await stageProjectBrainSources(attempts);
      for (const attempt of durableAttempts) {
        const result = await uploadProjectBrainSource(attempt);
        if (result.state !== "CONFIRMED" && result.state !== "REPLAYED") break;
      }
    } catch {
      setLocalError(copy.localQueueUnavailable);
    }
  };
  const pickSources = async () => {
    const pickerContext = pickerContextRef.current;
    if (sourcePicker.isBusy() || !pickerContext || busy || recorderState.isRecording) return;
    setLocalError(null);
    setPickerBusy(true);
    try {
      const result = await sourcePicker.run({
        context: pickerContext,
        readCurrentContext: () => pickerContextRef.current,
        pick: () => DocumentPicker.getDocumentAsync({ type: PROJECT_BRAIN_PICKER_TYPES, multiple: true, copyToCacheDirectory: true }),
        onSelected: async (context, sources) => {
          await sendSources(sources.map((source) => ({ ...source, schemaVersion: 1, commandId: globalThis.crypto.randomUUID(),
            action: "ADMIT_PROJECT_BRAIN_SOURCE", workspaceId: context.workspaceId, projectId: context.projectId, intakeId: context.intakeId })), context.stateVersion);
        },
      });
      if (!pickerMounted.current) return;
      if (result.status === "INVALID_SELECTION" || (result.status === "SELECTED" && result.rejectedCount > 0)) setLocalError(copy.invalidFile);
      else {
        const message = projectBrainPickerMessage(result.status, activeWorkspace?.defaultLocale);
        if (message) setLocalError(message);
      }
    } finally {
      if (pickerMounted.current) setPickerBusy(false);
    }
  };
  const startVoice = async () => {
    setLocalError(null);
    if (Platform.OS === "web") { setLocalError(copy.voiceMobileOnly); return; }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) { setLocalError(copy.microphoneDenied); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
    await recorder.prepareToRecordAsync(); recorder.record({ forDuration: PROJECT_BRAIN_MAX_VOICE_DURATION_MS / 1_000 });
  };
  const finalizeRecordedVoice = async () => {
    if (!intakeId) return;
    if (finalizingVoice.current) return;
    finalizingVoice.current = true;
    try {
      await setAudioModeAsync({ allowsRecording: false });
      const stoppedState = recorder.getStatus();
      const uri = recorder.uri ?? stoppedState.url ?? recorderState.url;
      const durationMs = stoppedState.durationMillis || recorderState.durationMillis;
      if (!uri || durationMs <= 0) { setLocalError(copy.voiceInvalid); return; }
      if (durationMs > PROJECT_BRAIN_MAX_VOICE_DURATION_MS) { setLocalError(copy.voiceTooLong); return; }
      let blob: Blob;
      try {
        blob = await (await fetch(uri)).blob();
      } catch {
        setLocalError(copy.voiceReadFailed);
        return;
      }
      if (!blob.size || blob.size > PROJECT_BRAIN_MAX_SOURCE_BYTES) { setLocalError(copy.voiceTooLarge); return; }
      await sendSources([{ ...commandBase(), action: "ADMIT_PROJECT_BRAIN_SOURCE", intakeId, kind: "VOICE_NOTE", fileName: `memo-${Date.now()}.m4a`, mimeType: "audio/m4a", sizeBytes: blob.size, durationMs, uri }]);
    } finally {
      finalizingVoice.current = false;
    }
  };
  const stopVoice = async () => {
    if (!intake || finalizingVoice.current) return;
    manualVoiceStop.current = true;
    recordingSeen.current = false;
    try {
      await recorder.stop();
      await finalizeRecordedVoice();
    } catch {
      setLocalError(copy.voiceReadFailed);
    } finally {
      manualVoiceStop.current = false;
    }
  };

  useEffect(() => {
    finalizeRecordedVoiceRef.current = finalizeRecordedVoice;
  });

  useEffect(() => {
    if (recorderState.isRecording) {
      recordingSeen.current = true;
      return;
    }
    if (!recordingSeen.current || manualVoiceStop.current || finalizingVoice.current) return;
    recordingSeen.current = false;
    void finalizeRecordedVoiceRef.current();
  }, [recorderState.isRecording]);

  return (
    <Screen>
      <Heading eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
      <Button tone="ghost" accessibilityRole="button" accessibilityLabel={copy.back} onPress={() => router.back()}>{copy.back}</Button>
      {!canManage ? <Notice danger>{copy.protected}</Notice> : null}
      {projectBrainLoadState === "LOADING" ? <Loading label={copy.loading} /> : null}
      {projectBrainLoadState === "UNAVAILABLE" ? <Notice danger>{copy.unavailable}</Notice> : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {localError ? <Notice danger>{localError}</Notice> : null}
      {commandQueue.length ? <Card><Label>{copy.pendingCommands}</Label>{commandQueue.map((attempt: ProjectBrainCommandAttempt) => {
        const presentation = projectBrainIntentPresentation(attempt);
        return <View key={attempt.command.commandId} style={styles.source}>
          <Text style={sharedStyles.name}>{copy.commandAction[attempt.command.action]}</Text>
          <Text style={sharedStyles.muted}>{copy.sourceState[attempt.state as keyof typeof copy.sourceState]}</Text>
          {presentation.publicError ? <Text style={styles.error}>{presentation.publicError}</Text> : null}
          {presentation.retryable ? <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={copy.retryCommand} onPress={() => retryProjectBrainCommand(attempt.command.commandId)}><Text style={styles.link}>{copy.retryCommand}</Text></Pressable> : null}
          {presentation.dismissible ? <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={copy.dismiss} onPress={() => dismissProjectBrainIntent(attempt.command.commandId)}><Text style={styles.link}>{copy.dismiss}</Text></Pressable> : null}
        </View>;
      })}</Card> : null}
      {!intake ? <Card><Text style={sharedStyles.name}>{project?.name ?? projectId}</Text><Text style={sharedStyles.muted}>{copy.created}</Text><Button disabled={!canManage || busy || hasPendingCommand} accessibilityRole="button" accessibilityLabel={copy.created} onPress={create}>{copy.created}</Button></Card> : (
        <>
          <Card><Label>{copy.sources}</Label>
            <Button disabled={busy || recorderState.isRecording || hasPendingCommand || intake.status !== "DRAFT"} accessibilityRole="button" accessibilityLabel={copy.add} onPress={pickSources}>{copy.add}</Button>
            <Button tone="secondary" disabled={busy || hasPendingCommand || intake.status !== "DRAFT" || Platform.OS === "web"} accessibilityRole="button" accessibilityLabel={recorderState.isRecording ? copy.stop : copy.voice} onPress={recorderState.isRecording ? stopVoice : startVoice}>{recorderState.isRecording ? copy.stop : copy.voice}</Button>
            {Platform.OS === "web" ? <Text style={sharedStyles.muted}>{copy.voiceMobileOnly}</Text> : null}
            {intake.sources.length ? intake.sources.map((source) => <View key={source.id} style={styles.source}><Text style={sharedStyles.name}>{source.displayName}</Text><Text style={sharedStyles.muted}>{copy.sourceKind[source.kind]} · {Math.ceil(source.sizeBytes / 1024)} {copy.kilobytes} · {copy.localOnly}</Text></View>) : <Text style={sharedStyles.muted}>{copy.none}</Text>}
            {sourceQueue.map((attempt: ProjectBrainSourceAttempt) => {
              const stateLabel = attempt.state === "CONFIRMED" || attempt.state === "REPLAYED" ? copy.localOnly : copy.sourceState[attempt.state];
              const presentation = projectBrainIntentPresentation(attempt);
              const actionLabel = attempt.state === "READY" ? copy.continueUpload : copy.retry;
              return <View key={attempt.command.commandId} style={styles.source}>
                <Text style={sharedStyles.muted}>{attempt.command.fileName} · {stateLabel}</Text>
                {presentation.publicError ? <Text style={styles.error}>{presentation.publicError}</Text> : null}
                {presentation.retryable ? <Pressable disabled={busy || (attempt.state === "READY" && hasUnknownSourceOutcome)} accessibilityRole="button" accessibilityLabel={`${actionLabel}: ${attempt.command.fileName}`} onPress={() => retryProjectBrainSource(attempt.command.commandId)}><Text style={styles.link}>{actionLabel}</Text></Pressable> : null}
                {presentation.dismissible ? <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`${copy.dismiss}: ${attempt.command.fileName}`} onPress={() => dismissProjectBrainIntent(attempt.command.commandId)}><Text style={styles.link}>{copy.dismiss}</Text></Pressable> : null}
              </View>;
            })}
          </Card>
          <Card><Label>{copy.brief}</Label>
            {intake.status !== "DRAFT" ? <Notice>{copy.locked}</Notice> : null}
            {[[copy.summary, summary, setSummary], [copy.scope, scope, setScope], [copy.people, importantPeople, setImportantPeople], [copy.dates, importantDates, setImportantDates], [copy.blockers, blockers, setBlockers], [copy.next, nextDecision, setNextDecision]].map(([label, value, setter]) => <View key={label as string} style={styles.field}><Text style={styles.fieldLabel}>{label as string}</Text><TextInput accessibilityLabel={label as string} editable={intake.status === "DRAFT" && !busy} value={value as string} onChangeText={setter as (text: string) => void} multiline style={[styles.input, (intake.status !== "DRAFT" || busy) && styles.inputLocked]} /></View>)}
            <Button disabled={busy || hasPendingCommand || intake.status !== "DRAFT" || !summary.trim()} accessibilityRole="button" accessibilityLabel={copy.save} onPress={saveBrief}>{copy.save}</Button>
          </Card>
          <Card><Label>{copy.review}</Label><Notice>{copy.limits}</Notice>
            {intake.status === "DRAFT" ? <Button disabled={busy || hasPendingCommand || !briefIsDurable || !intake.sources.length} accessibilityRole="button" accessibilityLabel={copy.submit} onPress={() => decide("SUBMIT_PROJECT_BRAIN_INTAKE")}>{copy.submit}</Button> : null}
            {intake.status === "READY_FOR_REVIEW" ? <><Button disabled={busy || hasPendingCommand} accessibilityRole="button" accessibilityLabel={copy.confirm} onPress={() => decide("CONFIRM_PROJECT_BRAIN_INTAKE")}>{copy.confirm}</Button><Button tone="danger" disabled={busy || hasPendingCommand} accessibilityRole="button" accessibilityLabel={copy.reject} onPress={() => decide("REJECT_PROJECT_BRAIN_INTAKE")}>{copy.reject}</Button></> : null}
            {projectBrainCanCreateNewVersion(intake.status) ? <Button disabled={busy || hasPendingCommand} accessibilityRole="button" accessibilityLabel={copy.newVersion} onPress={create}>{copy.newVersion}</Button> : null}
            <Text style={sharedStyles.success}>{copy.status[intake.status]} · {copy.version} {intake.stateVersion} · {copy.localOnly}</Text>
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  source: { gap: 3, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  link: { color: colors.accentBright, fontWeight: "800", paddingVertical: 8 }, field: { gap: 6 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.panelStrong, color: colors.text, padding: 12, textAlignVertical: "top" },
  inputLocked: { opacity: 0.74 },
});
