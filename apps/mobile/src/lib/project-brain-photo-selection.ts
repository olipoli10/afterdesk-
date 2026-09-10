import { createProjectBrainSourceAttempt, mobileProjectBrainCommandResultSchema, PROJECT_BRAIN_MAX_SOURCE_BYTES, type ProjectBrainSourceAttempt } from "./project-brain-intake";
import type { ProjectBrainPickerContext } from "./project-brain-source-picker";

export type ProjectBrainPhotoMode = "CAMERA" | "LIBRARY";
export type ProjectBrainPhotoPreview = Readonly<{ mode: ProjectBrainPhotoMode; context: ProjectBrainPickerContext; attempt: ProjectBrainSourceAttempt }>;
type Permission = { granted: boolean; canAskAgain: boolean };
export type PhotoSelectionResult = { status: "PREVIEW_ONLY"; preview: ProjectBrainPhotoPreview } | { status: "PERMISSION_DENIED"; canAskAgain: boolean } | { status: "BUSY" | "CANCELED" | "UNAVAILABLE" | "INVALID_PHOTO" | "CONTEXT_CHANGED" };
type PhotoImportResult = { status: "CONFIRMED" | "OUTCOME_UNKNOWN" | "CONTEXT_CHANGED" | "ALREADY_ATTEMPTED" | "BUSY" };

export const PROJECT_BRAIN_PHOTO_OPTIONS = Object.freeze({ mediaTypes: ["images"] as ["images"], allowsMultipleSelection: false,
  allowsEditing: false, exif: false, base64: false, quality: 1, legacy: false });

/** Shared by document, camera/library and microphone setup. A late/double release cannot clear another action's lease. */
export function createProjectBrainNativeActionGate() {
  let owner: object | null = null;
  return {
    isBusy: () => owner !== null,
    acquire(): (() => boolean) | null {
      if (owner) return null;
      const token = {}; owner = token;
      return () => { if (owner !== token) return false; owner = null; return true; };
    },
  };
}

function sameContext(current: ProjectBrainPickerContext | null, original: ProjectBrainPickerContext, captured: ProjectBrainPickerContext) {
  return current === original && current.workspaceId === captured.workspaceId && current.projectId === captured.projectId
    && current.intakeId === captured.intakeId && current.stateVersion === captured.stateVersion;
}

/** Validate only a user-selected local image. No gallery enumeration, EXIF extraction or implicit format conversion. */
export function prepareSelectedProjectBrainPhoto(raw: unknown, context: ProjectBrainPickerContext, mode: ProjectBrainPhotoMode, commandId: string): ProjectBrainPhotoPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const asset = raw as Record<string, unknown>;
  if (asset.type !== "image" || typeof asset.uri !== "string" || !/^(file|content):\/\/.+/i.test(asset.uri) || asset.uri.length > 8192
    || typeof asset.fileSize !== "number" || !Number.isSafeInteger(asset.fileSize) || asset.fileSize <= 0 || asset.fileSize > PROJECT_BRAIN_MAX_SOURCE_BYTES) return null;
  const mime = asset.mimeType;
  if (mime !== "image/jpeg" && mime !== "image/png") return null;
  const fallback = mime === "image/jpeg" ? "photo.jpg" : "photo.png";
  const name = asset.fileName == null ? fallback : asset.fileName;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 240 || /[\u0000-\u001f\\/]/.test(name)) return null;
  if (mime === "image/jpeg" ? !/\.jpe?g$/i.test(name) : !/\.png$/i.test(name)) return null;
  try {
    const attempt = createProjectBrainSourceAttempt({ schemaVersion: 1, commandId, action: "ADMIT_PROJECT_BRAIN_SOURCE",
      workspaceId: context.workspaceId, projectId: context.projectId, intakeId: context.intakeId, expectedStateVersion: context.stateVersion,
      kind: "PHOTO", fileName: name.trim(), mimeType: mime, sizeBytes: asset.fileSize, uri: asset.uri, durationMs: null });
    Object.freeze(attempt.command);
    return Object.freeze({ mode, context: Object.freeze({ ...context }), attempt });
  } catch { return null; }
}

export function createProjectBrainPhotoSelection() {
  let busy = false;
  let pending: ProjectBrainPhotoPreview | null = null;
  let original: ProjectBrainPickerContext | null = null;
  let attempted = false;
  return {
    isBusy: () => busy,
    discard() { if (busy || attempted) return false; pending = null; original = null; return true; },
    async select(input: {
      mode: ProjectBrainPhotoMode; context: ProjectBrainPickerContext; readCurrentContext: () => ProjectBrainPickerContext | null;
      getCameraPermission: () => Promise<Permission>; requestCameraPermission: () => Promise<Permission>;
      pickCamera: () => Promise<unknown>; pickLibrary: () => Promise<unknown>; commandId: () => string;
    }): Promise<PhotoSelectionResult> {
      if (busy || attempted || pending) return { status: "BUSY" };
      busy = true;
      const captured = { ...input.context };
      const current = () => sameContext(input.readCurrentContext(), input.context, captured);
      try {
        if (!current()) return { status: "CONTEXT_CHANGED" };
        if (input.mode === "CAMERA") {
          let permission = await input.getCameraPermission();
          if (!current()) return { status: "CONTEXT_CHANGED" };
          if (!permission.granted && permission.canAskAgain) permission = await input.requestCameraPermission();
          if (!current()) return { status: "CONTEXT_CHANGED" };
          if (permission.granted !== true) return { status: "PERMISSION_DENIED", canAskAgain: permission.canAskAgain === true };
        }
        const raw = await (input.mode === "CAMERA" ? input.pickCamera() : input.pickLibrary());
        if (!current()) return { status: "CONTEXT_CHANGED" };
        if (!raw || typeof raw !== "object") return { status: "INVALID_PHOTO" };
        const picked = raw as Record<string, unknown>;
        if (picked.canceled === true) return { status: "CANCELED" };
        if (picked.canceled !== false || !Array.isArray(picked.assets) || picked.assets.length !== 1) return { status: "INVALID_PHOTO" };
        const preview = prepareSelectedProjectBrainPhoto(picked.assets[0], captured, input.mode, input.commandId());
        if (!preview) return { status: "INVALID_PHOTO" };
        if (!current()) return { status: "CONTEXT_CHANGED" };
        pending = preview; original = input.context;
        return { status: "PREVIEW_ONLY", preview };
      } catch { return { status: current() ? "UNAVAILABLE" : "CONTEXT_CHANGED" }; }
      finally { busy = false; }
    },
    async confirm(input: { preview: ProjectBrainPhotoPreview; readCurrentContext: () => ProjectBrainPickerContext | null;
      onImport: (attempt: ProjectBrainSourceAttempt) => Promise<ProjectBrainSourceAttempt> }): Promise<PhotoImportResult> {
      if (busy) return { status: "BUSY" };
      if (attempted || pending !== input.preview) return { status: "ALREADY_ATTEMPTED" };
      if (!original || !sameContext(input.readCurrentContext(), original, input.preview.context)) return { status: "CONTEXT_CHANGED" };
      busy = true; attempted = true;
      try {
        const outcome = await input.onImport(input.preview.attempt);
        if (!sameContext(input.readCurrentContext(), original, input.preview.context)) return { status: "CONTEXT_CHANGED" };
        const result = mobileProjectBrainCommandResultSchema.safeParse(outcome.result);
        const command = input.preview.attempt.command;
        if ((outcome.state !== "CONFIRMED" && outcome.state !== "REPLAYED") || !result.success
          || result.data.commandId !== command.commandId || result.data.action !== command.action || result.data.workspaceId !== command.workspaceId
          || result.data.projectId !== command.projectId || result.data.intakeId !== command.intakeId) return { status: "OUTCOME_UNKNOWN" };
        return { status: "CONFIRMED" };
      } catch { return { status: "OUTCOME_UNKNOWN" }; }
      finally { busy = false; }
    },
  };
}
