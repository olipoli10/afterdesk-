import { describe, expect, it, vi } from "vitest";
import { createProjectBrainVoiceCapture, stopProjectBrainVoiceCapture } from "../src/lib/project-brain-voice-capture";
import type { ProjectBrainPickerContext } from "../src/lib/project-brain-source-picker";
import type { ProjectBrainSourceAttempt } from "../src/lib/project-brain-intake";

function fixture() {
  const context = { workspaceId: "workspace-one", projectId: "project-one", intakeId: "intake-one", stateVersion: 1 };
  let current: ProjectBrainPickerContext | null = context;
  const capture = createProjectBrainVoiceCapture(context, "00000000-0000-4000-8000-000000000081", "memo.m4a");
  capture.bindNativeRecorder("recorder-one", "file:///recording.m4a");
  capture.observeNativeStatus({ id: "recorder-one", isFinished: true, hasError: false, url: "file:///recording.m4a" });
  const input = { uri: "file:///recording.m4a", durationMs: 1000, readCurrentContext: () => current,
    readSize: vi.fn(async () => 100), stage: vi.fn(async (attempts: readonly ProjectBrainSourceAttempt[]) => attempts),
    upload: vi.fn(async (attempt: ProjectBrainSourceAttempt) => attempt) };
  return { context, capture, input, change: (value: ProjectBrainPickerContext | null) => { current = value; } };
}

describe("recording context remains bound from Record through durable import", () => {
  it("permits another explicit stop after native failure without importing the recording", async () => {
    const stop = vi.fn().mockRejectedValueOnce(new Error("native stop failure")).mockResolvedValueOnce(undefined);
    const finalize = vi.fn(async () => undefined);
    const input = { stop, isRecording: vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false), finalize };
    expect(await stopProjectBrainVoiceCapture(input)).toBe("STOP_FAILED"); expect(finalize).not.toHaveBeenCalled();
    expect(await stopProjectBrainVoiceCapture(input)).toBe("STOPPED"); expect(finalize).toHaveBeenCalledOnce();
  });
  it("keeps stop unresolved if native status is unavailable", async () => {
    const finalize = vi.fn(async () => undefined);
    expect(await stopProjectBrainVoiceCapture({ stop: async () => { throw new Error("stop"); }, isRecording: () => { throw new Error("status"); }, finalize })).toBe("STOP_FAILED");
    expect(finalize).not.toHaveBeenCalled();
  });
  it.each(["still-recording", "unknown-status"])("does not finalize even after a resolved stop when %s", async mode => {
    const finalize = vi.fn(async () => undefined);
    expect(await stopProjectBrainVoiceCapture({ stop: async () => undefined, isRecording: () => { if (mode === "unknown-status") throw new Error("unknown"); return true; }, finalize })).toBe("STOP_FAILED");
    expect(finalize).not.toHaveBeenCalled();
  });
  it("finalizes only after explicit native evidence that recording already stopped", async () => {
    const finalize = vi.fn(async () => undefined);
    expect(await stopProjectBrainVoiceCapture({ stop: async () => { throw new Error("already stopped"); }, isRecording: () => false, finalize })).toBe("STOPPED");
    expect(finalize).toHaveBeenCalledOnce();
  });
  it("imports exactly once into its original project and permits durable URI relocation", async () => {
    const f = fixture();
    f.input.stage.mockImplementation(async attempts => attempts.map(a => ({ ...a, command: { ...a.command, uri: "file:///retained.m4a" } })));
    await f.capture.import(f.input);
    expect(f.input.upload).toHaveBeenCalledOnce();
    expect(f.input.upload.mock.calls[0][0].command).toMatchObject({ workspaceId: f.context.workspaceId, projectId: f.context.projectId, intakeId: f.context.intakeId, expectedStateVersion: 1, uri: "file:///retained.m4a" });
    await expect(f.capture.import(f.input)).rejects.toThrow("VOICE_ALREADY_ATTEMPTED");
  });
  it.each(["workspaceId", "projectId", "intakeId", "stateVersion"] as const)("refuses an in-place %s change before reading", async field => {
    const f = fixture(); Object.assign(f.context, { [field]: field === "stateVersion" ? 2 : "changed" });
    await expect(f.capture.import(f.input)).rejects.toThrow("VOICE_CONTEXT_CHANGED");
    expect(f.input.readSize).not.toHaveBeenCalled();
  });
  it.each(["new-reference", "unmounted"])("refuses %s even if values return to original context", async mode => {
    const f = fixture(); f.change(mode === "unmounted" ? null : { ...f.context });
    await expect(f.capture.import(f.input)).rejects.toThrow("VOICE_CONTEXT_CHANGED"); expect(f.input.stage).not.toHaveBeenCalled();
  });
  it("refuses context change during local file read", async () => {
    const f = fixture(); f.input.readSize.mockImplementation(async () => { f.change(null); return 100; });
    await expect(f.capture.import(f.input)).rejects.toThrow("VOICE_CONTEXT_CHANGED"); expect(f.input.stage).not.toHaveBeenCalled();
  });
  it("retains the old bound queue entry but does not upload after context changes during staging", async () => {
    const f = fixture(); f.input.stage.mockImplementation(async attempts => { f.change({ ...f.context, projectId: "other" }); return attempts; });
    await expect(f.capture.import(f.input)).rejects.toThrow("VOICE_CONTEXT_CHANGED"); expect(f.input.upload).not.toHaveBeenCalled();
    expect(f.input.stage.mock.calls[0][0][0].command.projectId).toBe("project-one");
  });
  it("does not replace captured project with a changed durable command", async () => {
    const f = fixture(); f.input.stage.mockImplementation(async attempts => attempts.map(a => ({ ...a, command: { ...a.command, projectId: "other" } })));
    await expect(f.capture.import(f.input)).rejects.toThrow("VOICE_DURABLE_SOURCE_CHANGED"); expect(f.input.upload).not.toHaveBeenCalled();
  });
  it("allows only one concurrent finalization", async () => {
    const f = fixture(); const results = await Promise.allSettled([f.capture.import(f.input), f.capture.import(f.input)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(f.input.upload).toHaveBeenCalledOnce();
  });
  it.each(["https://example.test/voice.m4a", "data:audio/m4a;base64,AAAA", ""])("never reads nonlocal URI %s", async uri => {
    const f = fixture(); f.input.uri = uri;
    await expect(f.capture.import(f.input)).rejects.toThrow("VOICE_LOCAL_FILE_REQUIRED"); expect(f.input.readSize).not.toHaveBeenCalled();
  });
  it("requires a matching successful native completion rather than an available file URI", async () => {
    const f = fixture(); const capture = createProjectBrainVoiceCapture(f.context, "00000000-0000-4000-8000-000000000082", "memo.m4a");
    capture.bindNativeRecorder("recorder-one", f.input.uri);
    await expect(capture.import(f.input)).rejects.toThrow("VOICE_NATIVE_COMPLETION_UNCONFIRMED");
    expect(f.input.readSize).not.toHaveBeenCalled();
  });
  it("waits for the queued native completion event after stop resolves", async () => {
    const f = fixture(); const capture = createProjectBrainVoiceCapture(f.context, "00000000-0000-4000-8000-000000000082", "memo.m4a");
    capture.bindNativeRecorder("recorder-one", f.input.uri);
    const pending = capture.completedNativeUri();
    capture.observeNativeStatus({ id: "recorder-one", isFinished: true, hasError: false, url: f.input.uri });
    expect(await pending).toBe(f.input.uri);
  });
  it("bounds missing native completion and never falls back to recorder URI", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); const capture = createProjectBrainVoiceCapture(f.context, "00000000-0000-4000-8000-000000000082", "memo.m4a");
      capture.bindNativeRecorder("recorder-one", f.input.uri);
      const assertion = expect(capture.completedNativeUri()).rejects.toThrow("VOICE_NATIVE_COMPLETION_UNCONFIRMED");
      await vi.advanceTimersByTimeAsync(2000); await assertion;
    } finally { vi.useRealTimers(); }
  });
  it.each(["native-error", "media-reset"])("refuses %s even if a valid URI and later success exist", async mode => {
    const f = fixture();
    f.capture.observeNativeStatus({ id: "recorder-one", isFinished: true, hasError: mode === "native-error", mediaServicesDidReset: mode === "media-reset", url: null });
    f.capture.observeNativeStatus({ id: "recorder-one", isFinished: true, hasError: false, url: f.input.uri });
    await expect(f.capture.completedNativeUri()).rejects.toThrow("VOICE_NATIVE_RECORDING_FAILED");
    await expect(f.capture.import(f.input)).rejects.toThrow("VOICE_NATIVE_RECORDING_FAILED"); expect(f.input.readSize).not.toHaveBeenCalled();
  });
  it("does not accept an old session's success on the same native recorder", async () => {
    const f = fixture(); const capture = createProjectBrainVoiceCapture(f.context, "00000000-0000-4000-8000-000000000082", "memo.m4a");
    capture.bindNativeRecorder("recorder-one", f.input.uri);
    expect(capture.observeNativeStatus({ id: "recorder-one", isFinished: true, hasError: false, url: "file:///old-recording.m4a" })).toBe(false);
    expect(capture.observeNativeStatus({ id: "another-recorder", isFinished: true, hasError: true, url: null })).toBe(false);
    await expect(capture.import(f.input)).rejects.toThrow("VOICE_NATIVE_COMPLETION_UNCONFIRMED");
  });
  it.each(["read", "stage"])("refuses a native error received during %s before upload", async phase => {
    const f = fixture(); const fail = () => f.capture.observeNativeStatus({ id: "recorder-one", isFinished: true, hasError: true, url: null });
    if (phase === "read") f.input.readSize.mockImplementation(async () => { fail(); return 100; });
    else f.input.stage.mockImplementation(async attempts => { fail(); return attempts; });
    await expect(f.capture.import(f.input)).rejects.toThrow("VOICE_NATIVE_RECORDING_FAILED"); expect(f.input.upload).not.toHaveBeenCalled();
  });
  it("refuses a different local file than the native completion receipt", async () => {
    const f = fixture(); f.input.uri = "file:///different.m4a";
    await expect(f.capture.import(f.input)).rejects.toThrow("VOICE_NATIVE_BINDING_REFUSED"); expect(f.input.readSize).not.toHaveBeenCalled();
  });
});
