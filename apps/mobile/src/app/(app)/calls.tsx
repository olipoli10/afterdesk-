import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
import {
  VOICE_NOTE_MAX_BYTES,
  VOICE_NOTE_MAX_DURATION_MS,
  createPrepareCallWorkCommand,
  createVoiceNoteAttempt,
  type VoiceNoteAttempt,
} from "@/lib/voice-calls";
import { useMobileSession } from "@/state/mobile-session";

type SelectedRecording = {
  uri: string;
  fileName: string;
  durationMs: number;
  sizeBytes: number;
};

function durationLabel(value: number) {
  const seconds = Math.ceil(value / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function noteStatus(attempt: VoiceNoteAttempt | null) {
  if (!attempt) return null;
  if (attempt.state === "SENDING") return "Note en vérification locale…";
  if (attempt.state === "CONFIRMED") return "Note liée au chantier. Aucune transcription n’a été inventée.";
  if (attempt.state === "REPLAYED") return "Cette note existait déjà; aucun doublon.";
  if (attempt.state === "OUTCOME_UNKNOWN") return "Résultat inconnu — réessaie exactement cette note.";
  if (attempt.state === "CONFLICT") return "Le dossier a changé. Recharge avant de réessayer.";
  if (attempt.state === "REFUSED") return "Note refusée; aucun effet sur le chantier.";
  return null;
}

export default function CallsScreen() {
  const {
    activeWorkspace,
    cockpit,
    voiceCallsCockpit,
    voiceCallsLoadState,
    latestVoiceNoteAttempt,
    publicError,
    loadVoiceCalls,
    submitPrepareCallWork,
    submitVoiceNoteAttempt,
  } = useMobileSession();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [objective, setObjective] = useState("");
  const [selected, setSelected] = useState<SelectedRecording | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preparingCall, setPreparingCall] = useState(false);

  const projects = cockpit?.projects ?? [];
  const contacts = useMemo(
    () => (cockpit?.contacts ?? []).filter((contact) => !projectId || contact.project?.id === projectId),
    [cockpit?.contacts, projectId],
  );
  const activeProjectId = projectId ?? projects[0]?.id ?? null;
  const activeContactId = contactId ?? contacts[0]?.id ?? null;

  useEffect(() => {
    if (voiceCallsLoadState === "IDLE") void loadVoiceCalls();
  }, [loadVoiceCalls, voiceCallsLoadState]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && recorder.isRecording) {
        void recorder.stop().finally(() => {
          setSelected(null);
          setLocalError("Enregistrement annulé parce que l’application a quitté le premier plan.");
        });
      }
    });
    return () => subscription.remove();
  }, [recorder]);

  const startRecording = async () => {
    setLocalError(null);
    setSelected(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setLocalError("Permission microphone refusée. ENDVERA n’enregistre rien.");
      return;
    }
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    });
    await recorder.prepareToRecordAsync();
    recorder.record({ forDuration: VOICE_NOTE_MAX_DURATION_MS / 1_000 });
  };

  const stopRecording = async () => {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri ?? recorderState.url;
    const durationMs = Math.min(recorderState.durationMillis, VOICE_NOTE_MAX_DURATION_MS);
    if (!uri || durationMs <= 0) {
      setLocalError("Aucune note vocale utilisable n’a été créée.");
      return;
    }
    const response = await fetch(uri);
    const blob = await response.blob();
    if (blob.size <= 0 || blob.size > VOICE_NOTE_MAX_BYTES) {
      setLocalError("La note dépasse 10 Mo ou son fichier est vide.");
      return;
    }
    setSelected({
      uri,
      fileName: `note-${Date.now()}.m4a`,
      durationMs,
      sizeBytes: blob.size,
    });
  };

  const submitNote = async () => {
    if (!activeWorkspace || !activeProjectId || !selected) return;
    const attempt = createVoiceNoteAttempt({
      workspace: activeWorkspace,
      projectId: activeProjectId,
      commandId: globalThis.crypto.randomUUID(),
      ...selected,
    });
    const result = await submitVoiceNoteAttempt(attempt);
    if (result.state === "CONFIRMED" || result.state === "REPLAYED") setSelected(null);
  };

  const retryNote = async () => {
    if (latestVoiceNoteAttempt?.state !== "OUTCOME_UNKNOWN") return;
    await submitVoiceNoteAttempt(latestVoiceNoteAttempt);
  };

  const prepareCall = async () => {
    if (!activeWorkspace || !activeProjectId || !activeContactId || !objective.trim()) return;
    const command = createPrepareCallWorkCommand({
      workspace: activeWorkspace,
      commandId: globalThis.crypto.randomUUID(),
      projectId: activeProjectId,
      contactId: activeContactId,
      objective,
    });
    setPreparingCall(true);
    await submitPrepareCallWork(command).finally(() => setPreparingCall(false));
    setObjective("");
  };

  const status = noteStatus(latestVoiceNoteAttempt);
  const field = activeWorkspace?.role === "FIELD_WORKER";

  return (
    <Screen>
      <Heading
        eyebrow="APPELS ET NOTES VOCALES"
        title="Parler à ENDVERA"
        body="Enregistre une note choisie ou prépare un appel de service. Rien n’est envoyé ni composé automatiquement."
      />
      {voiceCallsLoadState === "LOADING" ? <Loading label="Mémoire des appels…" /> : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {localError ? <Notice danger>{localError}</Notice> : null}

      <Card>
        <Label>Chantier de la note</Label>
        {projects.length ? projects.map((project) => {
          const active = project.id === activeProjectId;
          return (
            <Pressable
              key={project.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => { setProjectId(project.id); setContactId(null); }}
              style={[styles.choice, active && styles.choiceActive]}
            >
              <Text style={sharedStyles.name}>{project.name}</Text>
              <Text style={sharedStyles.muted}>{project.code}</Text>
            </Pressable>
          );
        }) : <Empty>Aucun chantier actif.</Empty>}

        <View style={sharedStyles.row}>
          <Text style={sharedStyles.value}>
            {recorderState.isRecording ? `Enregistrement ${durationLabel(recorderState.durationMillis)}` : "Microphone arrêté"}
          </Text>
          <Text style={sharedStyles.muted}>max. 2:00</Text>
        </View>
        {recorderState.isRecording ? (
          <Button tone="secondary" onPress={stopRecording}>Arrêter et inspecter</Button>
        ) : (
          <Button disabled={!activeProjectId} onPress={startRecording}>Enregistrer au premier plan</Button>
        )}
        {selected ? (
          <Notice>
            Prête à ajouter à {projects.find((project) => project.id === activeProjectId)?.name}: {durationLabel(selected.durationMs)} · {Math.ceil(selected.sizeBytes / 1024)} Ko. Aucune transcription demandée.
          </Notice>
        ) : null}
        {selected ? <Button onPress={submitNote}>Ajouter cette note exacte</Button> : null}
        {latestVoiceNoteAttempt?.state === "OUTCOME_UNKNOWN" ? (
          <Button tone="secondary" onPress={retryNote}>Réessayer exactement la même note</Button>
        ) : null}
        {status ? <Notice danger={["CONFLICT", "OUTCOME_UNKNOWN", "REFUSED"].includes(latestVoiceNoteAttempt?.state ?? "")}>{status}</Notice> : null}
      </Card>

      {!field ? (
        <Card>
          <Label>Préparer un appel de service</Label>
          <Text style={sharedStyles.muted}>Choisis le contact et écris le résultat attendu. Un humain reste le prochain responsable.</Text>
          {contacts.length ? contacts.map((contact) => {
            const active = contact.id === activeContactId;
            return (
              <Pressable
                key={contact.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setContactId(contact.id)}
                style={[styles.choice, active && styles.choiceActive]}
              >
                <Text style={sharedStyles.name}>{contact.displayName}</Text>
                <Text style={sharedStyles.muted}>{contact.role ?? "Contact"}</Text>
              </Pressable>
            );
          }) : <Empty>Aucun contact lié à ce chantier.</Empty>}
          <TextInput
            style={styles.input}
            value={objective}
            onChangeText={setObjective}
            placeholder="Ex.: Confirmer la date de livraison des fenêtres"
            placeholderTextColor={colors.muted}
            maxLength={1_000}
            multiline
          />
          <Button
            disabled={!activeContactId || !objective.trim() || preparingCall}
            onPress={prepareCall}
          >
            {preparingCall ? "Préparation…" : "Préparer sans appeler"}
          </Button>
        </Card>
      ) : null}

      <Heading eyebrow="ÉTAT PERSISTANT" title="Ce qu’ENDVERA garde" body="Les preuves humaines et les préparations restent séparées d’un appel réellement exécuté." />
      <Card>
        <Text style={sharedStyles.value}>Notes: {voiceCallsCockpit?.counts.voiceNotes ?? 0}</Text>
        <Text style={sharedStyles.value}>Appels préparés: {voiceCallsCockpit?.counts.preparedUnsent ?? 0}</Text>
        <Text style={sharedStyles.value}>Conversations admises: {voiceCallsCockpit?.counts.sessions ?? 0}</Text>
        <Text style={sharedStyles.success}>Transport externe désactivé · aucun numéro brut ni URL d’enregistrement.</Text>
      </Card>
      {!field && voiceCallsCockpit?.preparedWork.length ? voiceCallsCockpit.preparedWork.map((work) => (
        <Card key={work.id}>
          <Label>{work.status}</Label>
          <Text style={sharedStyles.name}>{work.contactName}</Text>
          <Text selectable style={sharedStyles.value}>{work.objective}</Text>
          <Text style={sharedStyles.muted}>Prochain responsable: humain · appel non composé</Text>
        </Card>
      )) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  choice: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelStrong,
    padding: 13,
    gap: 4,
  },
  choiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  input: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelStrong,
    color: colors.text,
    padding: 12,
    fontSize: 15,
    textAlignVertical: "top",
  },
});
