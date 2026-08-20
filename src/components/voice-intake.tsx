"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  assembleVoiceTranscript,
  cancelVoiceSession,
  createVoiceSession,
  finishVoiceSession,
  getVoiceReadiness,
  submitVoiceSegment,
} from "@/server/actions/voice-intake";
import {
  MAX_SEGMENT_BYTES,
  MAX_SESSION_DURATION_MS,
  MAX_SESSION_SEGMENTS,
  SEGMENT_ROLLOVER_TRIGGER_MS,
  VOICE_MIME_TYPES,
  evaluateVoiceReadiness,
  validateVoiceSegment,
  type VoiceAvailability,
  type VoiceMimeType,
  type VoiceStableResultKind,
} from "@/lib/voice-intake-contract";
import {
  initialVoiceIntakeState,
  reduceVoiceIntake,
  stopMediaStreamTracks,
} from "@/lib/voice-intake-state";
import type {
  ClientPortalLang,
  ClientPortalVoiceCopy,
} from "@/lib/i18n/client-portal";

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function alertCopy(kind: VoiceStableResultKind | "dispatched_unknown", copy: ClientPortalVoiceCopy) {
  switch (kind) {
    case "permission_denied":
      return copy.permissionDenied;
    case "device_missing":
      return copy.deviceMissing;
    case "limit":
      return copy.limit;
    case "incomplete":
      return copy.incomplete;
    case "uncertain":
    case "dispatched_unknown":
      return copy.uncertain;
    default:
      return copy.unavailable;
  }
}

function MicIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <rect x="8.2" y="3" width="7.6" height="12" rx="3.8" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
    </svg>
  );
}

export function VoiceIntake({
  copy,
  language,
  composerRef,
  onTranscript,
}: {
  copy: ClientPortalVoiceCopy;
  language: ClientPortalLang;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onTranscript(text: string): void;
}) {
  const [state, dispatch] = useReducer(reduceVoiceIntake, initialVoiceIntakeState);
  const [availability, setAvailability] = useState<VoiceAvailability | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const speakButtonRef = useRef<HTMLButtonElement>(null);
  const failureActionRef = useRef<HTMLButtonElement>(null);
  const focusSpeakAfterResetRef = useRef(false);
  const terminalPhaseForFocusRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const ordinalRef = useRef(0);
  const capturedMsRef = useRef(0);
  const segmentMsRef = useRef(0);
  const activeSinceRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishRequestedRef = useRef(false);
  const cancellingRef = useRef(false);
  const mountedRef = useRef(true);

  const focusComposerAtEnd = useCallback(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.focus();
    const end = composer.value.length;
    composer.setSelectionRange(end, end);
  }, [composerRef]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const commitActiveTime = useCallback(() => {
    if (activeSinceRef.current === null) return;
    const delta = Math.max(0, performance.now() - activeSinceRef.current);
    capturedMsRef.current += delta;
    segmentMsRef.current += delta;
    activeSinceRef.current = null;
    setElapsedMs(capturedMsRef.current);
  }, []);

  const stopLocalCapture = useCallback(() => {
    stopTimer();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    stopMediaStreamTracks(streamRef.current);
    streamRef.current = null;
    activeSinceRef.current = null;
    chunksRef.current = [];
  }, [stopTimer]);

  const resetAndFocusSpeak = useCallback(() => {
    focusSpeakAfterResetRef.current = true;
    dispatch({ type: "reset" });
    setConfirmCancel(false);
    setElapsedMs(0);
  }, []);

  useEffect(() => {
    if (state.phase !== "idle" || !focusSpeakAfterResetRef.current) return;
    focusSpeakAfterResetRef.current = false;
    speakButtonRef.current?.focus();
  }, [state.phase]);

  useEffect(() => {
    if (!state.alert || terminalPhaseForFocusRef.current === state.phase) return;
    terminalPhaseForFocusRef.current = state.phase;
    if (state.phase === "uncertain") {
      composerRef.current?.focus();
    } else {
      failureActionRef.current?.focus();
    }
  }, [composerRef, state.alert, state.phase]);

  const finishTranscript = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const total = ordinalRef.current;
    if (!sessionId || total === 0) {
      dispatch({ type: "transcription_incomplete" });
      stopLocalCapture();
      return;
    }
    dispatch({ type: "transcription_started", total });
    const finished = await finishVoiceSession({ sessionId, expectedSegmentCount: total });
    if (finished.kind !== "ok") {
      dispatch(
        finished.kind === "uncertain" || finished.dispatchState === "dispatched_unknown"
          ? { type: "transcription_uncertain", dispatchState: "dispatched_unknown" }
          : finished.kind === "incomplete"
            ? { type: "transcription_incomplete" }
            : { type: "failed", reason: finished.kind === "limit" ? "limit" : "unavailable" },
      );
      stopLocalCapture();
      return;
    }
    dispatch({ type: "transcription_progress", current: total, total });
    const assembled = await assembleVoiceTranscript({ sessionId });
    stopLocalCapture();
    if (assembled.kind === "ok") {
      onTranscript(assembled.transcript);
      dispatch({ type: "transcript_ready", transcript: assembled.transcript });
      sessionIdRef.current = null;
      setTimeout(focusComposerAtEnd, 0);
      return;
    }
    dispatch(
      assembled.kind === "uncertain" || assembled.dispatchState === "dispatched_unknown"
        ? { type: "transcription_uncertain", dispatchState: "dispatched_unknown" }
        : assembled.kind === "incomplete"
          ? { type: "transcription_incomplete" }
          : { type: "failed", reason: assembled.kind === "limit" ? "limit" : "unavailable" },
    );
  }, [focusComposerAtEnd, onTranscript, stopLocalCapture]);

  function startRecorderSegment(stream: MediaStream, mimeType: VoiceMimeType) {
      if (!mountedRef.current || cancellingRef.current) return;
      if (ordinalRef.current >= MAX_SESSION_SEGMENTS) {
        finishRequestedRef.current = true;
        dispatch({ type: "failed", reason: "limit" });
        void finishTranscript();
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      segmentMsRef.current = 0;
      activeSinceRef.current = performance.now();

      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunksRef.current.push(event.data);
        const bytes = chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
        if (bytes >= MAX_SEGMENT_BYTES && recorder.state !== "inactive") {
          recorder.stop();
        }
      };

      recorder.onstop = async () => {
        commitActiveTime();
        if (cancellingRef.current || !mountedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        const durationMs = Math.round(segmentMsRef.current);
        const bounded = validateVoiceSegment({ durationMs, bytes: blob.size });
        if (!bounded.ok || blob.size === 0) {
          dispatch({ type: "failed", reason: bounded.ok ? "unavailable" : "limit" });
          stopLocalCapture();
          return;
        }
        const sessionId = sessionIdRef.current;
        if (!sessionId) {
          dispatch({ type: "failed", reason: "unavailable" });
          stopLocalCapture();
          return;
        }
        const ordinal = ordinalRef.current;
        const submitted = await submitVoiceSegment({
          sessionId,
          ordinal,
          format: mimeType,
          mimeType,
          durationMs,
          bytes: blob.size,
          audio: await blob.arrayBuffer(),
        });
        if (submitted.kind !== "ok") {
          dispatch(
            submitted.kind === "uncertain" || submitted.dispatchState === "dispatched_unknown"
              ? { type: "transcription_uncertain", dispatchState: "dispatched_unknown" }
              : submitted.kind === "incomplete"
                ? { type: "transcription_incomplete" }
                : { type: "failed", reason: submitted.kind === "limit" ? "limit" : "unavailable" },
          );
          stopLocalCapture();
          return;
        }
        ordinalRef.current += 1;
        if (finishRequestedRef.current || capturedMsRef.current >= MAX_SESSION_DURATION_MS) {
          void finishTranscript();
          return;
        }
        startRecorderSegment(stream, mimeType);
      };

      recorder.start(250);
  }

  useEffect(() => {
    mountedRef.current = true;
    let live = true;
    void getVoiceReadiness().then((facts) => {
      if (!live) return;
      const hasRecorder = typeof MediaRecorder !== "undefined";
      const supportedMimeTypes = hasRecorder
        ? VOICE_MIME_TYPES.filter((mime) => MediaRecorder.isTypeSupported(mime))
        : [];
      let topLevel = false;
      try {
        topLevel = window.top === window.self;
      } catch {
        topLevel = false;
      }
      setAvailability(
        evaluateVoiceReadiness(
          facts,
          {
            secureContext: window.isSecureContext,
            topLevel,
            hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
            hasMediaRecorder: hasRecorder,
            supportedMimeTypes,
          },
          language,
        ),
      );
    });
    return () => {
      live = false;
      mountedRef.current = false;
    };
  }, [language]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!["recording", "paused", "finishing", "transcribing"].includes(state.phase)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state.phase]);

  useEffect(() => {
    return () => {
      const sessionId = sessionIdRef.current;
      cancellingRef.current = true;
      stopLocalCapture();
      if (sessionId) void cancelVoiceSession({ sessionId });
    };
  }, [stopLocalCapture]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (["recording", "paused", "finishing", "transcribing"].includes(state.phase)) {
        event.preventDefault();
        setConfirmCancel(true);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [state.phase]);

  async function beginRecording() {
    if (!availability?.available || !state.consentAccepted) return;
    dispatch({ type: "request_permission" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const created = await createVoiceSession({
        languageHint: availability.language,
        consentVersion: availability.consentVersion,
        consentAccepted: true,
      });
      if (created.kind !== "ok") {
        stopMediaStreamTracks(stream);
        dispatch({ type: "failed", reason: "unavailable" });
        return;
      }
      streamRef.current = stream;
      sessionIdRef.current = created.sessionId;
      ordinalRef.current = 0;
      capturedMsRef.current = 0;
      finishRequestedRef.current = false;
      cancellingRef.current = false;
      dispatch({ type: "capture_started" });
      startRecorderSegment(stream, availability.mimeType);
      stopTimer();
      timerRef.current = setInterval(() => {
        const delta = activeSinceRef.current === null ? 0 : performance.now() - activeSinceRef.current;
        const captured = capturedMsRef.current + delta;
        const segment = segmentMsRef.current + delta;
        setElapsedMs(captured);
        if (captured >= MAX_SESSION_DURATION_MS) {
          finishRequestedRef.current = true;
          if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
        } else if (segment >= SEGMENT_ROLLOVER_TRIGGER_MS) {
          if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
        }
      }, 250);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      dispatch({ type: name === "NotAllowedError" ? "permission_denied" : name === "NotFoundError" ? "device_missing" : "failed", ...(name === "NotAllowedError" || name === "NotFoundError" ? {} : { reason: "unavailable" as const }) });
      stopLocalCapture();
    }
  }

  function pauseRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    commitActiveTime();
    recorder.pause();
    dispatch({ type: "pause" });
  }

  function resumeRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    activeSinceRef.current = performance.now();
    dispatch({ type: "resume" });
  }

  function finishRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (recorder.state === "paused") commitActiveTime();
    finishRequestedRef.current = true;
    dispatch({ type: "finish" });
    recorder.stop();
  }

  async function confirmCancellation() {
    cancellingRef.current = true;
    const sessionId = sessionIdRef.current;
    stopLocalCapture();
    if (sessionId) await cancelVoiceSession({ sessionId });
    sessionIdRef.current = null;
    resetAndFocusSpeak();
  }

  const unavailableText =
    availability?.available === false && availability.reason === "device_missing"
      ? copy.deviceMissing
      : copy.disabled;
  const currentAlert = state.alert ? alertCopy(state.alert, copy) : null;

  return (
    <div data-voice-intake="" className="mt-2 rounded-[9px] border border-white/[0.09] bg-black/15 p-2.5 sm:p-3">
      {availability === null ? (
        <p aria-live="polite" className="text-[13px] leading-relaxed text-[#929AA6]">{copy.checking}</p>
      ) : !availability.available ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            ref={speakButtonRef}
            type="button"
            disabled
            aria-describedby="voice-disabled-reason"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[7px] border border-white/[0.13] px-3 text-[13px] font-medium text-[#A1A8B3] disabled:cursor-not-allowed disabled:opacity-65"
          >
            <MicIcon /> {copy.speak}
          </button>
          <p id="voice-disabled-reason" className="text-[13px] leading-relaxed text-[#858D99]">{unavailableText}</p>
        </div>
      ) : (
        <>
          {state.phase === "idle" ? (
            <button
              ref={speakButtonRef}
              type="button"
              onClick={() => dispatch({ type: "open_disclosure" })}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[7px] border border-[#6F4C29] bg-[#1B1510] px-3 text-[13px] font-semibold text-[#E2C486] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E2C486]"
            >
              <MicIcon /> {copy.speak}
            </button>
          ) : null}

          {state.phase === "disclosure" ? (
            <div className="space-y-3">
              <div>
                <p className="text-[14px] font-semibold text-[#F7F6F3]">{copy.disclosureTitle}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#A1A8B3]">{copy.disclosure}</p>
              </div>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-[#D7DBE1]">
                <input
                  type="checkbox"
                  checked={state.consentAccepted}
                  onChange={(event) => dispatch({ type: "consent_changed", accepted: event.target.checked })}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#D87526]"
                />
                <span>{copy.consent}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!state.consentAccepted} onClick={beginRecording} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[7px] bg-[#C9A76A] px-4 text-[13px] font-semibold text-[#14161A] disabled:cursor-not-allowed disabled:opacity-40">
                  <MicIcon /> {copy.start}
                </button>
                <button type="button" onClick={resetAndFocusSpeak} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[7px] border border-white/15 px-4 text-[13px] font-medium text-[#B7BDC7]">{copy.cancel}</button>
              </div>
            </div>
          ) : null}

          {state.phase === "requesting_permission" ? (
            <p data-voice-primary-status="" aria-live="polite" className="w-full text-[13px] leading-relaxed text-[#E2C486]">{copy.checking}</p>
          ) : null}

          {state.phase === "recording" || state.phase === "paused" ? (
            <div className="space-y-3">
              <p data-voice-primary-status="" aria-live="polite" className="w-full font-mono text-[13px] font-semibold tabular-nums text-[#F7F6F3]">
                {copy.recording.replace("{time}", formatTime(elapsedMs))}{state.phase === "paused" ? ` · ${copy.paused}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={state.phase === "paused" ? resumeRecording : pauseRecording} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[7px] border border-[#6F4C29] px-4 text-[13px] font-medium text-[#E2C486]">{state.phase === "paused" ? copy.resume : copy.pause}</button>
                <button type="button" onClick={finishRecording} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[7px] bg-[#C9A76A] px-4 text-[13px] font-semibold text-[#14161A]">{copy.finish}</button>
                <button type="button" onClick={() => setConfirmCancel(true)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[7px] border border-white/15 px-4 text-[13px] font-medium text-[#B7BDC7]">{copy.cancel}</button>
              </div>
            </div>
          ) : null}

          {state.phase === "finishing" || state.phase === "transcribing" ? (
            <p data-voice-primary-status="" aria-live="polite" className="w-full text-[13px] leading-relaxed text-[#E2C486]">
              {state.progress
                ? copy.transcribing.replace("{current}", String(state.progress.current)).replace("{total}", String(state.progress.total))
                : copy.transcribing.replace("{current}", "0").replace("{total}", "1")}
            </p>
          ) : null}

          {state.phase === "ready" ? (
            <div aria-live="polite">
              <p className="text-[14px] font-semibold text-[#F7F6F3]">{copy.readyTitle}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#A1A8B3]">{copy.readyHelp}</p>
              <button type="button" onClick={resetAndFocusSpeak} className="mt-2 inline-flex min-h-11 min-w-11 items-center rounded-[7px] border border-white/15 px-3 text-[13px] text-[#B7BDC7]">{copy.recordAgain}</button>
            </div>
          ) : null}

          {currentAlert ? (
            <div role="alert" className="mt-2 rounded-[7px] border border-[#FF9A8B]/25 bg-[#A23B2E]/15 px-3 py-2.5">
              <p className="text-[13px] leading-relaxed text-[#FFB1A5]">{currentAlert}</p>
              {state.phase !== "uncertain" ? (
                <button ref={failureActionRef} type="button" onClick={resetAndFocusSpeak} className="mt-2 inline-flex min-h-11 min-w-11 items-center text-[13px] font-medium text-[#F7C1B8] underline underline-offset-4">{copy.recordAgain}</button>
              ) : null}
            </div>
          ) : null}

          {confirmCancel ? (
            <div role="alertdialog" aria-modal="true" aria-labelledby="voice-cancel-title" className="mt-3 rounded-[8px] border border-[#C9A76A]/35 bg-[#17130E] p-3">
              <p id="voice-cancel-title" className="text-[13px] leading-relaxed text-[#F7F6F3]">{copy.cancelConfirmation}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={confirmCancellation} className="inline-flex min-h-11 min-w-11 items-center rounded-[7px] border border-[#FF9A8B]/35 px-3 text-[13px] font-medium text-[#FFB1A5]">{copy.confirmCancel}</button>
                <button type="button" autoFocus onClick={() => setConfirmCancel(false)} className="inline-flex min-h-11 min-w-11 items-center rounded-[7px] border border-white/15 px-3 text-[13px] font-medium text-[#D7DBE1]">{copy.keepRecording}</button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
