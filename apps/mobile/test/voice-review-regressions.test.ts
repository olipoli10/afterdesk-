import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { createProjectBrainVoiceCapture, stopProjectBrainVoiceCapture } from "../src/lib/project-brain-voice-capture";
import { beginProjectBrainVoiceJournal as begin, clearProjectBrainVoiceJournal as clear,
  loadProjectBrainVoiceJournal as load, projectBrainVoiceJournalAttempt as attempt,
  transitionProjectBrainVoiceJournal as transition, requireProjectBrainVoiceRetainedAttempt,
  type ProjectBrainVoiceJournal } from "../src/lib/project-brain-voice-journal";
import type { ProjectBrainSourceAttempt } from "../src/lib/project-brain-intake";

// Execute the actual screen's arrow body with synthetic dependencies, not a rewritten lifecycle.
// This is not a React render, a native callback-timing test, or a Samsung observation.
const screen = ts.createSourceFile("screen.tsx", readFileSync(new URL("../src/app/(app)/project-brain-intake.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function screenFunction(name: string, scope: object): (...args: unknown[]) => Promise<void> {
  let body: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) body = node.initializer.getText(screen);
    ts.forEachChild(node, visit);
  }
  visit(screen);
  if (!body) throw new Error(`AUDIT_SCREEN_FUNCTION_MISSING:${name}`);
  const emitted = ts.transpileModule(`const audited = ${body};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Script(`(() => { ${emitted}\nreturn audited; })();`).runInContext(createContext(scope));
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const commandId = "7eca9d25-4e4d-476f-9963-0f790985079c";
const context = { workspaceId: "workspace", projectId: "project", intakeId: "intake", stateVersion: 1 };
const journal = (): ProjectBrainVoiceJournal => ({ schemaVersion: 1, ownerId: "owner", ...context, commandId,
  recordingId: "recorder", uri: "file:///document/audit-recording.m4a", fileName: `memo-${commandId}.m4a`,
  phase: "RECORDING", durationMs: null, sizeBytes: null });
function fakeStore() {
  const rows = new Map<string, string>();
  return { rows, getItemAsync: vi.fn(async (key: string) => rows.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => { rows.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { rows.delete(key); }) };
}
async function staged() {
  const store = fakeStore();
  const recording = await begin(journal(), store);
  const stopped = await transition(recording, "STOP_CONFIRMED", { durationMs: 2500, sizeBytes: 4000 }, store);
  return { store, value: await transition(stopped, "STAGED", undefined, store) };
}
function receipt(value: ProjectBrainVoiceJournal): ProjectBrainSourceAttempt {
  return { ...attempt(value, { ownerId: "owner", ...context }), state: "CONFIRMED", result: {
    schemaVersion: 1, commandId, action: "ADMIT_PROJECT_BRAIN_SOURCE", intakeId: context.intakeId,
    workspaceId: context.workspaceId, projectId: context.projectId, stateVersion: 2, status: "DRAFT", reviewFingerprint: null,
    canonicalEffectId: "synthetic-effect", replayed: false, providerExecutionPerformed: false, externalTransportPerformed: false,
  } };
}
function screenScope() {
  const release = vi.fn();
  const scope = {
    Platform: { OS: "android" }, crypto: { randomUUID: () => commandId }, ownerId: "owner", journalLoaded: true,
    ownerRef: { current: "owner" }, journalRef: { current: null as ProjectBrainVoiceJournal | null },
    pickerContextRef: { current: context as typeof context | null }, pickerMounted: { current: true },
    appActive: { current: true }, voiceInterrupted: { current: false }, voiceStarting: { current: false },
    voiceCapture: { current: null as { capture: ReturnType<typeof createProjectBrainVoiceCapture>; release: () => void } | null },
    manualVoiceStop: { current: false }, finalizingVoice: { current: false }, recordingSeen: { current: false },
    invalidVoiceCommands: { current: new Set<string>() }, journalAction: { current: false }, sourceQueue: [],
    setVoiceSessionActive: vi.fn(), setLocalError: vi.fn(), setJournalBusy: vi.fn(), setVoiceInvalidated: vi.fn(),
    acquireNativeAction: vi.fn(() => release), release,
    createProjectBrainVoiceCapture, stopProjectBrainVoiceCapture,
    requestRecordingPermissionsAsync: vi.fn(async () => ({ granted: true })),
    setAudioModeAsync: vi.fn(async () => undefined),
    recorder: { id: "recorder", uri: journal().uri, prepareToRecordAsync: vi.fn(async () => undefined),
      record: vi.fn(), stop: vi.fn(async () => undefined), getStatus: vi.fn(() => ({ isRecording: false, durationMillis: 2500 })) },
    recorderState: { durationMillis: 2500 }, PROJECT_BRAIN_MAX_VOICE_DURATION_MS: 600_000, PROJECT_BRAIN_MAX_SOURCE_BYTES: 10485760,
    copy: { voicePending: "pending", voiceReadFailed: "read-failed", voiceContextChanged: "context", voiceStopFailed: "stop-failed" },
    beginProjectBrainVoiceJournal: vi.fn(async (value: ProjectBrainVoiceJournal) => value),
    transitionProjectBrainVoiceJournal: vi.fn(async (value: ProjectBrainVoiceJournal, phase: ProjectBrainVoiceJournal["phase"], metadata?: object) => ({ ...value, phase, ...metadata })),
    loadProjectBrainVoiceJournal: vi.fn(async () => scope.journalRef.current),
    projectBrainVoiceJournalAttempt: attempt, requireProjectBrainVoiceRetainedAttempt,
    stageProjectBrainSources: vi.fn(async (values: ProjectBrainSourceAttempt[]) => values),
    uploadProjectBrainSource: vi.fn(async (value: ProjectBrainSourceAttempt) => ({ ...value, state: "OUTCOME_UNKNOWN" as const })),
    clearProjectBrainVoiceJournal: vi.fn(async () => undefined), removeRecordedFile: vi.fn(async () => undefined),
    publishJournal: (value: ProjectBrainVoiceJournal | null) => { scope.journalRef.current = value; },
    readJournal: () => scope.journalRef.current,
    require: (id: string) => { if (id !== "expo-file-system") throw new Error("AUDIT_IMPORT_REFUSED"); return { File: class { size = 4000; } }; },
  };
  return scope;
}

describe("independent voice review — synthetic, single-runtime lifecycle", () => {
  it("positive control: a current foreground start reaches native record exactly once", async () => {
    const scope = screenScope();
    await screenFunction("startVoice", scope)();
    expect(scope.recorder.record).toHaveBeenCalledExactlyOnceWith({ forDuration: 600 });
    expect(scope.journalRef.current?.phase).toBe("RECORDING");
    expect(scope.voiceCapture.current).not.toBeNull();
    expect(scope.release).not.toHaveBeenCalled();
  });
  it("positive control: matching native completion is retained locally without automatic upload", async () => {
    const scope = screenScope(), capture = createProjectBrainVoiceCapture(context, commandId, journal().fileName);
    capture.bindNativeRecorder("recorder", journal().uri);
    capture.observeNativeStatus({ id: "recorder", url: journal().uri, isFinished: true, hasError: false });
    scope.voiceCapture.current = { capture, release: scope.release }; scope.journalRef.current = journal();
    await screenFunction("finalizeRecordedVoice", scope)();
    expect(scope.journalRef.current?.phase).toBe("STOP_CONFIRMED");
    expect(scope.invalidVoiceCommands.current.size).toBe(0);
    expect(scope.stageProjectBrainSources).not.toHaveBeenCalled();
    expect(scope.uploadProjectBrainSource).not.toHaveBeenCalled();
    expect(scope.release).toHaveBeenCalledOnce();
  });
  it("positive control: explicit Continue dispatches the exact staged command once and retains unknown outcome", async () => {
    const scope = screenScope();
    const stopped: ProjectBrainVoiceJournal = { ...journal(), phase: "STOP_CONFIRMED", durationMs: 2500, sizeBytes: 4000 };
    scope.journalRef.current = stopped;
    await screenFunction("resumeVoice", scope)();
    expect(scope.uploadProjectBrainSource).toHaveBeenCalledOnce();
    expect(scope.uploadProjectBrainSource.mock.calls[0][0].command).toEqual(attempt(stopped, { ownerId: "owner", ...context }).command);
    expect(scope.clearProjectBrainVoiceJournal).not.toHaveBeenCalled();
    expect(scope.journalRef.current?.phase).toBe("STAGED");
  });
  it("retains cleanup-only intent after delete failure and resumes without an audio read or upload", async () => {
    const { store, value } = await staged();
    let fileExists = true;
    const removeFile = vi.fn(async (uri: string) => { expect(uri).toBe(value.uri); fileExists = false; });
    store.deleteItemAsync.mockRejectedValueOnce(new Error("synthetic journal deletion failure"));
    await expect(clear(value, { receipt: receipt(value), removeFile }, store)).rejects.toThrow("deletion");
    expect(fileExists).toBe(false);
    const recovered = await load("owner", store);
    expect(recovered?.phase).toBe("CLEANUP_PENDING");
    expect(() => attempt(recovered!, { ownerId: "owner", ...context })).toThrow();
    await clear(recovered!, { removeFile }, store);
    expect(store.rows.size).toBe(0);
    expect(removeFile).toHaveBeenCalledTimes(2);
  });
  it("never deletes audio if cleanup-marker persistence fails", async () => {
    const { store, value } = await staged(), removeFile = vi.fn();
    store.setItemAsync.mockRejectedValueOnce(new Error("synthetic full storage"));
    await expect(clear(value, { receipt: receipt(value), removeFile }, store)).rejects.toThrow("full storage");
    expect(removeFile).not.toHaveBeenCalled();
    expect((await load("owner", store))?.phase).toBe("STAGED");
  });
  it("the actual screen resumes cleanup without a current project, restaging, or transport", async () => {
    const scope = screenScope();
    scope.journalRef.current = { ...journal(), phase: "CLEANUP_PENDING", durationMs: 2500, sizeBytes: 4000 };
    scope.pickerContextRef.current = null;
    await screenFunction("resumeVoice", scope)();
    expect(scope.clearProjectBrainVoiceJournal).toHaveBeenCalledOnce();
    expect(scope.stageProjectBrainSources).not.toHaveBeenCalled();
    expect(scope.uploadProjectBrainSource).not.toHaveBeenCalled();
    expect(scope.journalRef.current).toBeNull();
  });
  it("a different owner cannot clear the previous owner's cleanup journal", async () => {
    const scope = screenScope();
    scope.journalRef.current = { ...journal(), phase: "CLEANUP_PENDING" };
    scope.ownerRef.current = "different-owner";
    await screenFunction("resumeVoice", scope)();
    expect(scope.clearProjectBrainVoiceJournal).not.toHaveBeenCalled();
    expect(scope.journalRef.current?.ownerId).toBe("owner");
  });
  it("unknown transport outcome cannot authorize audio deletion or a cleanup marker", async () => {
    const { store, value } = await staged(), removeFile = vi.fn();
    const pending: ProjectBrainSourceAttempt = { ...attempt(value, { ownerId: "owner", ...context }), state: "OUTCOME_UNKNOWN" };
    await expect(clear(value, { receipt: pending, removeFile }, store)).rejects.toThrow("RECEIPT_REQUIRED");
    expect(removeFile).not.toHaveBeenCalled();
    expect((await load("owner", store))?.phase).toBe("STAGED");
  });
  it("a restart rejects unstaged STOP after failed invalidation persistence and preserves its exact audio identity", async () => {
    const store = fakeStore(), recording = await begin(journal(), store);
    const stopped = await transition(recording, "STOP_CONFIRMED", { durationMs: 2500, sizeBytes: 4000 }, store);
    store.setItemAsync.mockRejectedValueOnce(new Error("synthetic invalidation persistence failed"));
    await expect(transition(stopped, "INTERRUPTED", undefined, store)).rejects.toThrow("persistence");
    const recovered = await load("owner", store);
    expect(recovered).toEqual({ ...stopped, phase: "INTERRUPTED", durationMs: null, sizeBytes: null });
    expect(recovered?.uri).toBe(stopped.uri);
    expect(recovered?.commandId).toBe(stopped.commandId);
    expect(() => attempt(recovered!, { ownerId: "owner", ...context })).toThrow("CONTEXT_REFUSED");
    expect(store.deleteItemAsync).not.toHaveBeenCalled();
  });
  it("restart preserves a staged attempt's original version, owner, URI and command for explicit replay only", async () => {
    const { store, value } = await staged(), recovered = await load("owner", store);
    expect(recovered).toEqual(value);
    const replay = attempt(recovered!, { ownerId: "owner", ...context, stateVersion: 9 });
    expect(replay.command.expectedStateVersion).toBe(1);
    expect(replay.command.commandId).toBe(commandId);
    expect(replay.command.uri).toBe(value.uri);
    expect(() => attempt(recovered!, { ownerId: "different", ...context, stateVersion: 9 })).toThrow("CONTEXT_REFUSED");
  });
  it("a late native error invalidates successful completion while STOP persistence is pending, even if demotion fails", async () => {
    const scope = screenScope(), capture = createProjectBrainVoiceCapture(context, commandId, journal().fileName);
    capture.bindNativeRecorder("recorder", journal().uri);
    capture.observeNativeStatus({ id: "recorder", url: journal().uri, isFinished: true, hasError: false });
    scope.voiceCapture.current = { capture, release: scope.release };
    scope.journalRef.current = journal();
    scope.transitionProjectBrainVoiceJournal.mockImplementation(async (value, phase, metadata) => {
      if (phase === "INTERRUPTED") throw new Error("synthetic invalidation write failure");
      capture.observeNativeStatus({ id: "recorder", url: journal().uri, isFinished: true, hasError: true });
      return { ...value, phase, ...metadata };
    });
    await screenFunction("finalizeRecordedVoice", scope)();
    expect(scope.invalidVoiceCommands.current.has(commandId)).toBe(true);
    expect(scope.setLocalError).toHaveBeenCalledWith("VOICE_INTERRUPTION_PERSISTENCE_FAILED");
    await screenFunction("resumeVoice", scope)();
    expect(scope.stageProjectBrainSources).not.toHaveBeenCalled();
    expect(scope.uploadProjectBrainSource).not.toHaveBeenCalled();
    expect(scope.release).toHaveBeenCalledOnce();
  });
  it.each(["permission", "preparation"] as const)("Stop during %s cancels the actual screen start before native record", async phase => {
    const scope = screenScope(), reached = deferred<void>(), resume = deferred<void>();
    if (phase === "permission") scope.requestRecordingPermissionsAsync.mockImplementation(async () => { reached.resolve(); await resume.promise; return { granted: true }; });
    else scope.recorder.prepareToRecordAsync.mockImplementation(async () => { reached.resolve(); await resume.promise; });
    const running = screenFunction("startVoice", scope)();
    await reached.promise;
    await screenFunction("stopVoice", scope)();
    resume.resolve(); await running;
    expect(scope.recorder.record).not.toHaveBeenCalled();
    expect(scope.release).toHaveBeenCalledOnce();
    expect(scope.voiceStarting.current).toBe(false);
  });
  it.each(["recording", "unknown"] as const)("a start error with %s native stop status retains Stop and the owned gate", async status => {
    const scope = screenScope();
    scope.recorder.record.mockImplementation(() => { throw new Error("synthetic record started then rejected"); });
    scope.recorder.stop.mockRejectedValue(new Error("synthetic stop rejected"));
    scope.recorder.getStatus.mockImplementation(() => {
      if (status === "unknown") throw new Error("synthetic native status unavailable");
      return { isRecording: true, durationMillis: 500 };
    });
    await screenFunction("startVoice", scope)();
    expect(scope.recorder.record).toHaveBeenCalledOnce();
    expect(scope.voiceCapture.current).not.toBeNull();
    expect(scope.setVoiceSessionActive).not.toHaveBeenCalledWith(false);
    expect(scope.release).not.toHaveBeenCalled();
  });
  it("background then active during permission never resumes a cancelled recording start", async () => {
    const scope = screenScope();
    scope.requestRecordingPermissionsAsync.mockImplementation(async () => {
      scope.appActive.current = false; scope.voiceInterrupted.current = true; scope.appActive.current = true;
      return { granted: true };
    });
    await screenFunction("startVoice", scope)();
    expect(scope.recorder.record).not.toHaveBeenCalled();
    expect(scope.beginProjectBrainVoiceJournal).not.toHaveBeenCalled();
    expect(scope.release).toHaveBeenCalledOnce();
  });
  it.each(["owner", "context", "background", "unmount"] as const)("rechecks %s after STAGED persistence and before any upload", async changed => {
    const scope = screenScope();
    scope.journalRef.current = { ...journal(), phase: "STOP_CONFIRMED", durationMs: 2500, sizeBytes: 4000 };
    scope.transitionProjectBrainVoiceJournal.mockImplementation(async (value, phase, metadata) => {
      if (changed === "owner") scope.ownerRef.current = "other";
      if (changed === "context") scope.pickerContextRef.current = { ...context };
      if (changed === "background") scope.appActive.current = false;
      if (changed === "unmount") scope.pickerMounted.current = false;
      return { ...value, phase, ...metadata };
    });
    await screenFunction("resumeVoice", scope)();
    expect(scope.stageProjectBrainSources).toHaveBeenCalledOnce();
    expect(scope.uploadProjectBrainSource).not.toHaveBeenCalled();
  });
});
