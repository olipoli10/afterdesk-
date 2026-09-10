import { createProjectBrainSourceAttempt, type ProjectBrainSourceAttempt } from "./project-brain-intake";
import type { ProjectBrainPickerContext } from "./project-brain-source-picker";

/** A failed stop is not proof that recording ended. The owner must retain the session and Stop control. */
export async function stopProjectBrainVoiceCapture(input: { stop: () => Promise<void>; isRecording: () => boolean; finalize: () => Promise<void> }) {
  try { await input.stop(); }
  catch { /* A rejected stop may have stopped natively; only current status can resolve that ambiguity. */ }
  try { if (input.isRecording()) return "STOP_FAILED" as const; }
  catch { return "STOP_FAILED" as const; }
  await input.finalize();
  return "STOPPED" as const;
}

/** One recording belongs to the exact context present when the user pressed Record. */
export function createProjectBrainVoiceCapture(context: ProjectBrainPickerContext, commandId: string, fileName: string) {
  const captured = Object.freeze({ ...context });
  let attempted = false;
  let nativeBinding: { id: string; uri: string } | null = null;
  let nativeFailed = false;
  let nativeCompleted = false;
  const nativeWaiters = new Set<() => void>();
  const requireNativeSuccess = () => {
    if (nativeFailed) throw new Error("VOICE_NATIVE_RECORDING_FAILED");
    if (!nativeBinding || !nativeCompleted) throw new Error("VOICE_NATIVE_COMPLETION_UNCONFIRMED");
  };
  const isCurrent = (current: ProjectBrainPickerContext | null) => current === context
    && current.workspaceId === captured.workspaceId && current.projectId === captured.projectId
    && current.intakeId === captured.intakeId && current.stateVersion === captured.stateVersion;
  return {
    isCurrent,
    assertNativeCompletion() { requireNativeSuccess(); return nativeBinding!.uri; },
    bindNativeRecorder(id: string, uri: string | null) {
      if (nativeBinding || attempted || !id || !uri || !/^(file|content):\/\/.+/i.test(uri) || uri.length > 8192) throw new Error("VOICE_NATIVE_BINDING_REFUSED");
      nativeBinding = { id, uri };
    },
    observeNativeStatus(status: { id: string; isFinished: boolean; hasError: boolean; url: string | null; mediaServicesDidReset?: boolean }) {
      if (!nativeBinding || status.id !== nativeBinding.id) return false;
      // A recorder ID may survive between sessions. A success needs this exact session's unique native file URI.
      // An ambiguous error without a URI is never permission to use a possibly damaged file.
      if (status.hasError || status.mediaServicesDidReset) nativeFailed = true;
      else if (status.isFinished && status.url === nativeBinding.uri) nativeCompleted = true;
      else return false;
      for (const resolve of nativeWaiters) resolve();
      return true;
    },
    async completedNativeUri() {
      if (!nativeBinding) throw new Error("VOICE_NATIVE_BINDING_REFUSED");
      if (!nativeCompleted && !nativeFailed) {
        // Android stop() can resolve before its queued status event. Never replace that event with recorder.uri.
        await new Promise<void>(resolve => {
          const done = () => { clearTimeout(timer); nativeWaiters.delete(done); resolve(); };
          const timer = setTimeout(done, 2000);
          nativeWaiters.add(done);
        });
      }
      requireNativeSuccess();
      return nativeBinding.uri;
    },
    async import(input: {
      uri: string; durationMs: number; readCurrentContext: () => ProjectBrainPickerContext | null;
      readSize: (uri: string) => Promise<number>;
      stage: (attempts: readonly ProjectBrainSourceAttempt[]) => Promise<readonly ProjectBrainSourceAttempt[]>;
      upload: (attempt: ProjectBrainSourceAttempt) => Promise<ProjectBrainSourceAttempt>;
    }) {
      if (attempted) throw new Error("VOICE_ALREADY_ATTEMPTED");
      attempted = true;
      const requireCurrent = () => { if (!isCurrent(input.readCurrentContext())) throw new Error("VOICE_CONTEXT_CHANGED"); };
      requireCurrent();
      if (!/^(file|content):\/\/.+/i.test(input.uri) || input.uri.length > 8192) throw new Error("VOICE_LOCAL_FILE_REQUIRED");
      requireNativeSuccess();
      if (input.uri !== nativeBinding?.uri) throw new Error("VOICE_NATIVE_BINDING_REFUSED");
      const sizeBytes = await input.readSize(input.uri);
      requireCurrent(); requireNativeSuccess();
      const attempt = createProjectBrainSourceAttempt({ schemaVersion: 1, commandId, action: "ADMIT_PROJECT_BRAIN_SOURCE",
        workspaceId: captured.workspaceId, projectId: captured.projectId, intakeId: captured.intakeId,
        expectedStateVersion: captured.stateVersion, kind: "VOICE_NOTE", fileName, mimeType: "audio/m4a",
        sizeBytes, durationMs: input.durationMs, uri: input.uri });
      const expected = { ...attempt.command };
      const staged = await input.stage([attempt]);
      requireCurrent(); requireNativeSuccess();
      const durable = staged[0];
      if (staged.length !== 1 || !durable || durable.state !== "READY") throw new Error("VOICE_DURABLE_SOURCE_CHANGED");
      const fields = ["schemaVersion", "commandId", "action", "workspaceId", "projectId", "intakeId", "expectedStateVersion", "kind", "fileName", "mimeType", "sizeBytes", "durationMs"] as const;
      if (fields.some(field => durable.command[field] !== expected[field])) throw new Error("VOICE_DURABLE_SOURCE_CHANGED");
      // Only the URI may change when the app retains the selected file in durable local storage.
      return input.upload(durable);
    },
  };
}
