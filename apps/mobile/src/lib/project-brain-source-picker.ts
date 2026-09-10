import { PROJECT_BRAIN_MAX_SOURCE_BYTES, type MobileProjectBrainSourceCommand } from "./project-brain-intake";
import { mobileProductLocale } from "./product-experience";

export const PROJECT_BRAIN_PICKER_TYPES = ["image/jpeg", "image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
export type ProjectBrainPickerContext = Readonly<{ workspaceId: string; projectId: string; intakeId: string; stateVersion: number }>;
type SelectedSource = Pick<MobileProjectBrainSourceCommand, "kind" | "fileName" | "mimeType" | "sizeBytes" | "uri" | "durationMs">;
export type ProjectBrainPickerResult = { status: "BUSY" | "CANCELED" | "UNAVAILABLE" | "CONTEXT_CHANGED" | "INVALID_SELECTION" | "IMPORT_FAILED" } | { status: "SELECTED"; rejectedCount: number };
const extensionMimes: Record<string, SelectedSource["mimeType"]> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

function selectedSource(value: unknown): SelectedSource | null {
  if (!value || typeof value !== "object") return null;
  const asset = value as Record<string, unknown>;
  if (typeof asset.name !== "string" || !asset.name.trim() || asset.name.trim().length > 240
    || typeof asset.uri !== "string" || !/^(file:|content:|blob:)/i.test(asset.uri) || asset.uri.length > 8192
    || typeof asset.size !== "number" || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > PROJECT_BRAIN_MAX_SOURCE_BYTES) return null;
  const reported = asset.mimeType;
  const extension = asset.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = typeof reported === "string" && PROJECT_BRAIN_PICKER_TYPES.includes(reported)
    ? reported as SelectedSource["mimeType"] : Object.hasOwn(extensionMimes, extension) ? extensionMimes[extension] : null;
  if (!mime) return null;
  return { kind: mime.startsWith("image/") ? "PHOTO" : "DOCUMENT", fileName: asset.name.trim(), mimeType: mime, sizeBytes: asset.size, uri: asset.uri, durationMs: null };
}

/** One user-selected native dialog at a time, held until durable staging/upload returns. No permission or native API is invoked by this module. */
export function createProjectBrainSourcePicker() {
  let busy = false;
  return {
    isBusy: () => busy,
    async run(input: {
      context: ProjectBrainPickerContext;
      readCurrentContext: () => ProjectBrainPickerContext | null;
      pick: () => Promise<unknown>;
      onSelected: (context: ProjectBrainPickerContext, sources: SelectedSource[]) => Promise<void>;
    }): Promise<ProjectBrainPickerResult> {
      if (busy) return { status: "BUSY" };
      busy = true;
      const captured = { ...input.context };
      const isCurrent = () => {
        const current = input.readCurrentContext();
        return current === input.context && current.workspaceId === captured.workspaceId && current.projectId === captured.projectId
          && current.intakeId === captured.intakeId && current.stateVersion === captured.stateVersion;
      };
      try {
        if (!isCurrent()) return { status: "CONTEXT_CHANGED" };
        let result: unknown;
        try { result = await input.pick(); } catch { return { status: isCurrent() ? "UNAVAILABLE" : "CONTEXT_CHANGED" }; }
        if (!isCurrent()) return { status: "CONTEXT_CHANGED" };
        if (!result || typeof result !== "object") return { status: "INVALID_SELECTION" };
        const picked = result as Record<string, unknown>;
        if (picked.canceled === true) return { status: "CANCELED" };
        if (picked.canceled !== false || !Array.isArray(picked.assets) || picked.assets.length === 0 || picked.assets.length > 20) return { status: "INVALID_SELECTION" };
        const sources = picked.assets.map(selectedSource).filter((item): item is SelectedSource => item !== null);
        if (!sources.length) return { status: "INVALID_SELECTION" };
        if (!isCurrent()) return { status: "CONTEXT_CHANGED" };
        try { await input.onSelected(captured, sources); } catch { return { status: "IMPORT_FAILED" }; }
        return { status: "SELECTED", rejectedCount: picked.assets.length - sources.length };
      } finally { busy = false; }
    },
  };
}

export function projectBrainPickerMessage(status: ProjectBrainPickerResult["status"], locale?: string | null): string | null {
  const fr = mobileProductLocale(locale) === "fr-CA";
  if (status === "UNAVAILABLE") return fr ? "Le sélecteur de fichiers ne s’est pas ouvert ou a été interrompu. Aucun fichier n’a été importé. Réessaie." : "The file picker could not open or was interrupted. No file was imported. Try again.";
  if (status === "CONTEXT_CHANGED") return fr ? "Le chantier ou sa version a changé. Sélectionne tes fichiers de nouveau dans le bon chantier." : "The project or its version changed. Select your files again in the correct project.";
  if (status === "IMPORT_FAILED") return fr ? "L’import n’a pas été confirmé. Vérifie les fichiers en attente avant de réessayer." : "The import was not confirmed. Check pending files before trying again.";
  return null;
}
