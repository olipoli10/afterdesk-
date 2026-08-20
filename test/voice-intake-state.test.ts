import { describe, expect, it, vi } from "vitest";
import {
  initialVoiceIntakeState,
  reduceVoiceIntake,
  stopMediaStreamTracks,
} from "@/lib/voice-intake-state";

describe("voice intake interaction state", () => {
  it("requires disclosure consent before requesting microphone permission", () => {
    const disclosure = reduceVoiceIntake(initialVoiceIntakeState, { type: "open_disclosure" });
    expect(disclosure.phase).toBe("disclosure");
    expect(reduceVoiceIntake(disclosure, { type: "request_permission" })).toEqual(disclosure);

    const consented = reduceVoiceIntake(disclosure, { type: "consent_changed", accepted: true });
    expect(reduceVoiceIntake(consented, { type: "request_permission" }).phase).toBe("requesting_permission");
  });

  it.each([
    ["permission_denied", "permission_denied"],
    ["device_missing", "device_missing"],
  ] as const)("returns to the typed fallback after %s", (event, alert) => {
    const state = reduceVoiceIntake(
      { ...initialVoiceIntakeState, phase: "requesting_permission", consentAccepted: true },
      { type: event },
    );
    expect(state.phase).toBe("idle");
    expect(state.alert).toBe(alert);
    expect(state.autoSend).toBe(false);
  });

  it("supports record, pause, resume and finish without auto-send", () => {
    const recording = reduceVoiceIntake(
      { ...initialVoiceIntakeState, phase: "requesting_permission", consentAccepted: true },
      { type: "capture_started" },
    );
    expect(recording.phase).toBe("recording");
    expect(reduceVoiceIntake(recording, { type: "pause" }).phase).toBe("paused");
    expect(
      reduceVoiceIntake({ ...recording, phase: "paused" }, { type: "resume" }).phase,
    ).toBe("recording");
    const finishing = reduceVoiceIntake(recording, { type: "finish" });
    expect(finishing.phase).toBe("finishing");
    expect(finishing.autoSend).toBe(false);
  });

  it("keeps incomplete and dispatched-unknown results out of the send flow", () => {
    const transcribing = {
      ...initialVoiceIntakeState,
      phase: "transcribing" as const,
      progress: { current: 1, total: 2 },
    };
    const incomplete = reduceVoiceIntake(transcribing, { type: "transcription_incomplete" });
    expect(incomplete.phase).toBe("incomplete");
    expect(incomplete.transcript).toBe("");
    expect(incomplete.autoSend).toBe(false);

    const uncertain = reduceVoiceIntake(transcribing, {
      type: "transcription_uncertain",
      dispatchState: "dispatched_unknown",
    });
    expect(uncertain.phase).toBe("uncertain");
    expect(uncertain.alert).toBe("dispatched_unknown");
    expect(uncertain.autoSend).toBe(false);
  });

  it("makes a conclusive transcript editable but never submitted", () => {
    const ready = reduceVoiceIntake(
      { ...initialVoiceIntakeState, phase: "transcribing" },
      { type: "transcript_ready", transcript: "A detailed workflow" },
    );
    expect(ready.phase).toBe("ready");
    expect(ready.transcript).toBe("A detailed workflow");
    expect(ready.insertIntoComposer).toBe(true);
    expect(ready.autoSend).toBe(false);
  });

  it("cancels explicitly and stops every media track during teardown", () => {
    const stopped = [vi.fn(), vi.fn()];
    stopMediaStreamTracks({
      getTracks: () => stopped.map((stop) => ({ stop })),
    });
    expect(stopped.every((stop) => stop.mock.calls.length === 1)).toBe(true);

    const cancelled = reduceVoiceIntake(
      { ...initialVoiceIntakeState, phase: "recording", consentAccepted: true },
      { type: "cancelled" },
    );
    expect(cancelled.phase).toBe("idle");
    expect(cancelled.consentAccepted).toBe(false);
    expect(cancelled.autoSend).toBe(false);
  });
});
