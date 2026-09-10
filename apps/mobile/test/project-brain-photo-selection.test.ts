import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createProjectBrainNativeActionGate, createProjectBrainPhotoSelection, importReviewedProjectBrainPhoto, prepareSelectedProjectBrainPhoto, PROJECT_BRAIN_PHOTO_OPTIONS } from "../src/lib/project-brain-photo-selection";
import type { ProjectBrainPickerContext } from "../src/lib/project-brain-source-picker";
import { PROJECT_BRAIN_MAX_SOURCE_BYTES, type ProjectBrainSourceAttempt } from "../src/lib/project-brain-intake";

const context = { workspaceId: "synthetic-workspace", projectId: "synthetic-project", intakeId: "synthetic-intake", stateVersion: 3 };
const commandId = "00000000-0000-4000-8000-000000000001";
const asset = { uri: "file:///synthetic/photo.jpg", fileName: "photo.jpg", mimeType: "image/jpeg", fileSize: 100, width: 50, height: 50, type: "image" };
function fixture(mode: "CAMERA" | "LIBRARY" = "CAMERA") {
  let current: ProjectBrainPickerContext | null = context;
  return { mode, context, readCurrentContext: () => current, setCurrent: (value: ProjectBrainPickerContext | null) => { current = value; },
    getCameraPermission: vi.fn(async () => ({ granted: true, canAskAgain: true })), requestCameraPermission: vi.fn(async () => ({ granted: true, canAskAgain: true })),
    pickCamera: vi.fn(async (): Promise<unknown> => ({ canceled: false, assets: [asset] })), pickLibrary: vi.fn(async (): Promise<unknown> => ({ canceled: false, assets: [asset] })), commandId: () => commandId };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const receipt = { schemaVersion: 1 as const, commandId, action: "ADMIT_PROJECT_BRAIN_SOURCE" as const, intakeId: context.intakeId,
  workspaceId: context.workspaceId, projectId: context.projectId, stateVersion: 4, status: "DRAFT" as const, reviewFingerprint: null,
  canonicalEffectId: "synthetic-photo", replayed: false, providerExecutionPerformed: false as const, externalTransportPerformed: false as const };

describe("explicit project photo preview/import", () => {
  it("shares one synchronous native lease and ignores a stale release after a new owner acquires", () => {
    const gate = createProjectBrainNativeActionGate(); const first = gate.acquire()!;
    expect(gate.isBusy()).toBe(true); expect(gate.acquire()).toBeNull();
    expect(first()).toBe(true); const second = gate.acquire()!;
    expect(first()).toBe(false); expect(gate.isBusy()).toBe(true); expect(gate.acquire()).toBeNull();
    expect(second()).toBe(true); expect(gate.isBusy()).toBe(false);
  });
  it("requires camera consent only when taking a photo", async () => {
    const input = fixture(); input.getCameraPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    expect(await createProjectBrainPhotoSelection().select(input)).toMatchObject({ status: "PREVIEW_ONLY" });
    expect(input.requestCameraPermission).toHaveBeenCalledTimes(1); expect(input.pickCamera).toHaveBeenCalledTimes(1); expect(input.pickLibrary).not.toHaveBeenCalled();
  });
  it("opens the system image library without broad gallery or camera permission requests", async () => {
    const input = fixture("LIBRARY");
    expect(await createProjectBrainPhotoSelection().select(input)).toMatchObject({ status: "PREVIEW_ONLY" });
    expect(input.getCameraPermission).not.toHaveBeenCalled(); expect(input.requestCameraPermission).not.toHaveBeenCalled(); expect(input.pickLibrary).toHaveBeenCalledTimes(1);
    expect(PROJECT_BRAIN_PHOTO_OPTIONS).toEqual({ mediaTypes: ["images"], allowsMultipleSelection: false, allowsEditing: false, exif: false, base64: false, quality: 1, legacy: false });
  });
  it.each([true, false])("does not launch camera after denied consent (canAskAgain=%s)", async canAskAgain => {
    const input = fixture(); input.getCameraPermission.mockResolvedValue({ granted: false, canAskAgain }); input.requestCameraPermission.mockResolvedValue({ granted: false, canAskAgain });
    expect(await createProjectBrainPhotoSelection().select(input)).toEqual({ status: "PERMISSION_DENIED", canAskAgain });
    expect(input.pickCamera).not.toHaveBeenCalled(); expect(input.requestCameraPermission).toHaveBeenCalledTimes(canAskAgain ? 1 : 0);
  });
  it("discards a late permission result when context changed before capture", async () => {
    const input = fixture(); input.getCameraPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    const gate = deferred<{ granted: boolean; canAskAgain: boolean }>(); input.requestCameraPermission.mockReturnValue(gate.promise);
    const run = createProjectBrainPhotoSelection().select(input); await Promise.resolve(); input.setCurrent(null); gate.resolve({ granted: true, canAskAgain: true });
    expect(await run).toEqual({ status: "CONTEXT_CHANGED" }); expect(input.pickCamera).not.toHaveBeenCalled();
  });
  it("contains native rejection and allows a later voluntary retry", async () => {
    const input = fixture("LIBRARY"); input.pickLibrary.mockRejectedValueOnce(new Error("private-native-error")); const controller = createProjectBrainPhotoSelection();
    expect(await controller.select(input)).toEqual({ status: "UNAVAILABLE" }); expect(controller.isBusy()).toBe(false);
    expect(await controller.select(input)).toMatchObject({ status: "PREVIEW_ONLY" });
  });
  it("cancellation creates no preview and no import", async () => {
    const input = fixture(); input.pickCamera.mockResolvedValue({ canceled: true, assets: null });
    expect(await createProjectBrainPhotoSelection().select(input)).toEqual({ status: "CANCELED" });
  });
  it.each([null, {}, { canceled: false, assets: [] }, { canceled: false, assets: [asset, asset] }, { canceled: "false", assets: [asset] }])("refuses malformed native result %j", async raw => {
    const input = fixture(); input.pickCamera.mockResolvedValue(raw);
    expect(await createProjectBrainPhotoSelection().select(input)).toEqual({ status: "INVALID_PHOTO" });
  });
  it.each([{ type: "video" }, { type: "livePhoto" }, { mimeType: "image/heic", fileName: "photo.heic" }, { mimeType: "image/jpeg", fileName: "photo.heic" },
    { mimeType: "image/png", fileName: "photo.jpg" }, { fileSize: undefined }, { fileSize: -1 }, { fileSize: 1.2 }, { fileSize: NaN },
    { fileSize: PROJECT_BRAIN_MAX_SOURCE_BYTES + 1 }, { uri: "https://external.invalid/photo.jpg" }, { fileName: "../photo.jpg" }, { fileName: "" }])("rejects incompatible photo without silently renaming %j", change => {
    expect(prepareSelectedProjectBrainPhoto({ ...asset, ...change }, context, "CAMERA", commandId)).toBeNull();
  });
  it("keeps exact selected fields, excluding EXIF, location, asset IDs and paired videos", () => {
    const preview = prepareSelectedProjectBrainPhoto({ ...asset, exif: { GPSLatitude: 1 }, assetId: "private-gallery-id", base64: "private-bytes", pairedVideoAsset: {} }, context, "LIBRARY", commandId)!;
    expect(preview.attempt.command).toEqual({ schemaVersion: 1, commandId, action: "ADMIT_PROJECT_BRAIN_SOURCE", workspaceId: context.workspaceId,
      projectId: context.projectId, intakeId: context.intakeId, expectedStateVersion: 3, kind: "PHOTO", fileName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 100, uri: asset.uri, durationMs: null });
    expect(Object.isFrozen(preview)).toBe(true); expect(Object.isFrozen(preview.attempt.command)).toBe(true);
    expect(JSON.stringify(preview)).not.toMatch(/GPS|private-gallery|base64|pairedVideo/);
  });
  it("uses a neutral filename only when native name is absent and MIME is explicitly known", () => {
    expect(prepareSelectedProjectBrainPhoto({ ...asset, fileName: null, mimeType: "image/png" }, context, "CAMERA", commandId)?.attempt.command.fileName).toBe("photo.png");
    expect(prepareSelectedProjectBrainPhoto({ ...asset, fileName: null, mimeType: undefined }, context, "CAMERA", commandId)).toBeNull();
  });
  it("never imports on selection alone and allows discarding the preview", async () => {
    const controller = createProjectBrainPhotoSelection(); const input = fixture();
    const selected = await controller.select(input); expect(selected.status).toBe("PREVIEW_ONLY");
    expect(await controller.select(input)).toEqual({ status: "BUSY" }); expect(input.pickCamera).toHaveBeenCalledTimes(1);
    expect(controller.discard()).toBe(true); expect(await controller.select(input)).toMatchObject({ status: "PREVIEW_ONLY" });
  });
  it("synchronously refuses a second native picker while the first is open", async () => {
    const controller = createProjectBrainPhotoSelection(); const input = fixture("LIBRARY"); const gate = deferred<unknown>(); input.pickLibrary.mockReturnValue(gate.promise);
    const run = controller.select(input); expect(await controller.select(input)).toEqual({ status: "BUSY" });
    gate.resolve({ canceled: true, assets: null }); await run; expect(input.pickLibrary).toHaveBeenCalledTimes(1);
  });
  it.each([null, { ...context }, { ...context, workspaceId: "other" }, { ...context, stateVersion: 4 }])("discards a late result after context change %j", async changed => {
    const input = fixture("LIBRARY"); const gate = deferred<unknown>(); input.pickLibrary.mockReturnValue(gate.promise);
    const run = createProjectBrainPhotoSelection().select(input); input.setCurrent(changed); gate.resolve({ canceled: false, assets: [asset] });
    expect(await run).toEqual({ status: "CONTEXT_CHANGED" });
  });
  it("requires the exact preview instance and current context before explicit import", async () => {
    const controller = createProjectBrainPhotoSelection(); const input = fixture(); const selected = await controller.select(input);
    if (selected.status !== "PREVIEW_ONLY") throw new Error("fixture");
    const onImport = vi.fn();
    expect(await controller.confirm({ preview: { ...selected.preview }, readCurrentContext: input.readCurrentContext, onImport })).toEqual({ status: "ALREADY_ATTEMPTED" });
    input.setCurrent(null);
    expect(await controller.confirm({ preview: selected.preview, readCurrentContext: input.readCurrentContext, onImport })).toEqual({ status: "CONTEXT_CHANGED" }); expect(onImport).not.toHaveBeenCalled();
  });
  it("imports the original command once and confirms only a matching durable receipt", async () => {
    const controller = createProjectBrainPhotoSelection(); const input = fixture(); const selected = await controller.select(input);
    if (selected.status !== "PREVIEW_ONLY") throw new Error("fixture");
    const onImport = vi.fn(async (attempt: ProjectBrainSourceAttempt): Promise<ProjectBrainSourceAttempt> => ({ ...attempt, state: "CONFIRMED", result: receipt }));
    const confirm = { preview: selected.preview, readCurrentContext: input.readCurrentContext, onImport };
    expect(await controller.confirm(confirm)).toEqual({ status: "CONFIRMED" });
    expect(await controller.confirm(confirm)).toEqual({ status: "ALREADY_ATTEMPTED" }); expect(onImport).toHaveBeenCalledExactlyOnceWith(selected.preview.attempt);
  });
  it.each(["throw", "missing-receipt", "foreign-receipt"])("retains a one-attempt fence after %s without retry", async failure => {
    const controller = createProjectBrainPhotoSelection(); const input = fixture(); const selected = await controller.select(input);
    if (selected.status !== "PREVIEW_ONLY") throw new Error("fixture");
    const onImport = vi.fn(async (attempt: ProjectBrainSourceAttempt): Promise<ProjectBrainSourceAttempt> => {
      if (failure === "throw") throw new Error("private-error");
      return { ...attempt, state: "CONFIRMED", result: failure === "missing-receipt" ? null : { ...receipt, workspaceId: "other" } };
    });
    const confirm = { preview: selected.preview, readCurrentContext: input.readCurrentContext, onImport };
    expect(await controller.confirm(confirm)).toEqual({ status: "OUTCOME_UNKNOWN" }); expect(await controller.confirm(confirm)).toEqual({ status: "ALREADY_ATTEMPTED" });
    expect(controller.discard()).toBe(false); expect(onImport).toHaveBeenCalledTimes(1);
  });
  it("component requires visible preview and explicit import; native APIs are only in user action callbacks", () => {
    const source = readFileSync("src/components/project-brain-photo-capture.tsx", "utf8");
    expect(source).toContain("!previewLoaded"); expect(source).toContain("Confirm and import this photo"); expect(source).toContain("controller.confirm(");
    expect(source).toContain("controller.select("); expect(source).toContain("const release = acquireNativeAction()"); expect(source).toContain("finally { release()");
    expect(source).toContain("Image source={{ uri: preview.attempt.command.uri }}");
    expect(source).not.toMatch(/requestMediaLibraryPermissions|getMediaLibraryPermissions|getPendingResultAsync|fetch\(|getCurrentPosition|saveToLibrary/);
    expect(source).toContain("their removal is not guaranteed"); expect(source).toContain("key={JSON.stringify([workspaceId, projectId, intakeId, stateVersion])}");
  });
  it("imports the exact reviewed attempt through durable storage, permitting only the retained URI change", async () => {
    const attempt = prepareSelectedProjectBrainPhoto(asset, context, "CAMERA", commandId)!.attempt;
    const durable = { ...attempt, command: { ...attempt.command, uri: "file:///synthetic/durable/photo.jpg" } };
    const stage = vi.fn(async () => [durable]); const upload = vi.fn(async () => ({ ...durable, state: "CONFIRMED" as const, result: receipt }));
    expect(await importReviewedProjectBrainPhoto({ attempt, readCurrentContext: () => context, stage, upload })).toMatchObject({ state: "CONFIRMED" });
    expect(stage).toHaveBeenCalledExactlyOnceWith([attempt]); expect(upload).toHaveBeenCalledExactlyOnceWith(durable);
  });
  it.each([null, { ...context, workspaceId: "other" }, { ...context, projectId: "other" }, { ...context, intakeId: "other" }, { ...context, stateVersion: 4 }])("does not stage a photo for a changed context %j", async changed => {
    const attempt = prepareSelectedProjectBrainPhoto(asset, context, "LIBRARY", commandId)!.attempt;
    const stage = vi.fn(); const upload = vi.fn();
    await expect(importReviewedProjectBrainPhoto({ attempt, readCurrentContext: () => changed, stage, upload })).rejects.toThrow("PHOTO_IMPORT_CONTEXT_CHANGED");
    expect(stage).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  });
  it("leaves the original durable entry untouched without upload after context changes during staging", async () => {
    const attempt = prepareSelectedProjectBrainPhoto(asset, context, "CAMERA", commandId)!.attempt;
    let current: ProjectBrainPickerContext | null = context;
    const stage = vi.fn(async () => { current = null; return [attempt]; }); const upload = vi.fn();
    await expect(importReviewedProjectBrainPhoto({ attempt, readCurrentContext: () => current, stage, upload })).rejects.toThrow("PHOTO_IMPORT_CONTEXT_CHANGED");
    expect(stage).toHaveBeenCalledTimes(1); expect(upload).not.toHaveBeenCalled();
  });
  it.each([{ commandId: "00000000-0000-4000-8000-000000000002" }, { fileName: "other.jpg" }, { sizeBytes: 101 }, { expectedStateVersion: 4 }])("refuses a changed durable command %j", async change => {
    const attempt = prepareSelectedProjectBrainPhoto(asset, context, "CAMERA", commandId)!.attempt;
    const stage = vi.fn(async () => [{ ...attempt, command: { ...attempt.command, ...change } }]); const upload = vi.fn();
    await expect(importReviewedProjectBrainPhoto({ attempt, readCurrentContext: () => context, stage, upload })).rejects.toThrow("PHOTO_DURABLE_SOURCE_CHANGED"); expect(upload).not.toHaveBeenCalled();
  });
  it("screen shares one native gate across documents, photos and voice setup before their first await", () => {
    const screen = readFileSync("src/app/(app)/project-brain-intake.tsx", "utf8");
    const document = screen.slice(screen.indexOf("const pickSources ="), screen.indexOf("const startVoice ="));
    const voice = screen.slice(screen.indexOf("const startVoice ="), screen.indexOf("const finalizeRecordedVoice ="));
    expect(document.indexOf("const release = acquireNativeAction()")).toBeLessThan(document.indexOf("await sourcePicker.run"));
    expect(document).toContain("release()"); expect(voice.indexOf("voiceStarting.current = true")).toBeLessThan(voice.indexOf("await requestRecordingPermissionsAsync()"));
    expect(voice).toContain("voiceStarting.current = false;");
    expect(voice).toMatch(/if \(!handedToRecording\) \{[\s\S]*await recorder\.stop\(\)[\s\S]*voiceCapture\.current = null;[\s\S]*release\(\)/);
    expect(screen).toContain("session.release()");
    expect(screen).toContain("if (release() && pickerMounted.current) setNativeBusy(false)");
    expect(screen).toContain("acquireNativeAction={acquireNativeAction} onImport={importPhoto}");
    expect(screen).toContain("stage: stageProjectBrainSources, upload: uploadProjectBrainSource");
    expect(screen).toContain("hasUnknownSourceOutcome || recorderState.isRecording");
    expect(voice).not.toContain("stageProjectBrainSources");
  });
});
