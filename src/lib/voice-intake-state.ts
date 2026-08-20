export type VoiceIntakePhase =
  | "idle"
  | "disclosure"
  | "requesting_permission"
  | "recording"
  | "paused"
  | "finishing"
  | "transcribing"
  | "ready"
  | "incomplete"
  | "uncertain"
  | "failed";

export type VoiceIntakeAlert =
  | "permission_denied"
  | "device_missing"
  | "limit"
  | "incomplete"
  | "dispatched_unknown"
  | "unavailable"
  | null;

export type VoiceIntakeState = {
  phase: VoiceIntakePhase;
  consentAccepted: boolean;
  alert: VoiceIntakeAlert;
  progress: { current: number; total: number } | null;
  transcript: string;
  insertIntoComposer: boolean;
  autoSend: false;
};

export type VoiceIntakeEvent =
  | { type: "open_disclosure" }
  | { type: "consent_changed"; accepted: boolean }
  | { type: "request_permission" }
  | { type: "permission_denied" }
  | { type: "device_missing" }
  | { type: "capture_started" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "finish" }
  | { type: "transcription_started"; total: number }
  | { type: "transcription_progress"; current: number; total: number }
  | { type: "transcript_ready"; transcript: string }
  | { type: "transcription_incomplete" }
  | { type: "transcription_uncertain"; dispatchState?: "dispatched_unknown" }
  | { type: "failed"; reason?: "limit" | "unavailable" }
  | { type: "cancelled" }
  | { type: "reset" };

export const initialVoiceIntakeState: VoiceIntakeState = {
  phase: "idle",
  consentAccepted: false,
  alert: null,
  progress: null,
  transcript: "",
  insertIntoComposer: false,
  autoSend: false,
};

export function reduceVoiceIntake(
  state: VoiceIntakeState,
  event: VoiceIntakeEvent,
): VoiceIntakeState {
  switch (event.type) {
    case "open_disclosure":
      return state.phase === "idle" ? { ...initialVoiceIntakeState, phase: "disclosure" } : state;
    case "consent_changed":
      return state.phase === "disclosure" ? { ...state, consentAccepted: event.accepted } : state;
    case "request_permission":
      return state.phase === "disclosure" && state.consentAccepted
        ? { ...state, phase: "requesting_permission", alert: null }
        : state;
    case "permission_denied":
      return { ...initialVoiceIntakeState, alert: "permission_denied" };
    case "device_missing":
      return { ...initialVoiceIntakeState, alert: "device_missing" };
    case "capture_started":
      return state.phase === "requesting_permission"
        ? { ...state, phase: "recording", alert: null }
        : state;
    case "pause":
      return state.phase === "recording" ? { ...state, phase: "paused" } : state;
    case "resume":
      return state.phase === "paused" ? { ...state, phase: "recording" } : state;
    case "finish":
      return state.phase === "recording" || state.phase === "paused"
        ? { ...state, phase: "finishing" }
        : state;
    case "transcription_started":
      return {
        ...state,
        phase: "transcribing",
        progress: { current: 0, total: event.total },
        alert: null,
      };
    case "transcription_progress":
      return state.phase === "transcribing"
        ? { ...state, progress: { current: event.current, total: event.total } }
        : state;
    case "transcript_ready":
      return {
        ...state,
        phase: "ready",
        transcript: event.transcript,
        insertIntoComposer: true,
        alert: null,
        progress: null,
      };
    case "transcription_incomplete":
      return {
        ...state,
        phase: "incomplete",
        transcript: "",
        insertIntoComposer: false,
        alert: "incomplete",
      };
    case "transcription_uncertain":
      return {
        ...state,
        phase: "uncertain",
        transcript: "",
        insertIntoComposer: false,
        alert: event.dispatchState === "dispatched_unknown" ? "dispatched_unknown" : "unavailable",
      };
    case "failed":
      return {
        ...state,
        phase: "failed",
        transcript: "",
        insertIntoComposer: false,
        alert: event.reason ?? "unavailable",
      };
    case "cancelled":
    case "reset":
      return initialVoiceIntakeState;
  }
}

export function stopMediaStreamTracks(stream: {
  getTracks(): ReadonlyArray<{ stop(): void }>;
} | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}
