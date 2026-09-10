import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createProjectBrainSourcePicker, projectBrainPickerMessage, type ProjectBrainPickerContext } from "../src/lib/project-brain-source-picker";
import { PROJECT_BRAIN_MAX_SOURCE_BYTES } from "../src/lib/project-brain-intake";

const context = { workspaceId: "synthetic-workspace", projectId: "synthetic-project", intakeId: "synthetic-intake", stateVersion: 2 };
const asset = { name: "plan.pdf", uri: "file:///synthetic/plan.pdf", size: 100, mimeType: "application/pdf" };
function fixture() {
  let current: ProjectBrainPickerContext | null = context;
  return { context, readCurrentContext: () => current, setCurrent: (value: ProjectBrainPickerContext | null) => { current = value; }, pick: vi.fn(async (): Promise<unknown> => ({ canceled: false, assets: [asset] })), onSelected: vi.fn(async () => undefined) };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("project brain native selected-file recovery", () => {
  it("delivers only selected file fields bound to the captured intake version", async () => {
    const input = fixture();
    input.pick.mockResolvedValue({ canceled: false, assets: [{ ...asset, privateMetadata: "not-retained", lastModified: 1 }] });
    expect(await createProjectBrainSourcePicker().run(input)).toEqual({ status: "SELECTED", rejectedCount: 0 });
    expect(input.onSelected).toHaveBeenCalledWith(context, [{ fileName: "plan.pdf", uri: asset.uri, sizeBytes: 100, mimeType: "application/pdf", kind: "DOCUMENT", durationMs: null }]);
  });
  it("catches native rejection without private error details and permits a later deliberate attempt", async () => {
    const picker = createProjectBrainSourcePicker(); const input = fixture();
    input.pick.mockRejectedValueOnce(new Error("private-file-or-native-detail"));
    expect(await picker.run(input)).toEqual({ status: "UNAVAILABLE" });
    expect(input.onSelected).not.toHaveBeenCalled(); expect(picker.isBusy()).toBe(false);
    expect(await picker.run(input)).toMatchObject({ status: "SELECTED" });
  });
  it("treats native cancellation as no import", async () => {
    const input = fixture(); input.pick.mockResolvedValue({ canceled: true, assets: [asset] });
    expect(await createProjectBrainSourcePicker().run(input)).toEqual({ status: "CANCELED" });
    expect(input.onSelected).not.toHaveBeenCalled();
  });
  it.each([null, undefined, {}, { canceled: false }, { canceled: "false", assets: [asset] }, { canceled: false, assets: [] }, { canceled: false, assets: Array.from({ length: 21 }, () => asset) }])("refuses malformed or unbounded native result %j", async (value) => {
    const input = fixture(); input.pick.mockResolvedValue(value);
    expect(await createProjectBrainSourcePicker().run(input)).toEqual({ status: "INVALID_SELECTION" });
    expect(input.onSelected).not.toHaveBeenCalled();
  });
  it.each([{ name: "" }, { name: "x".repeat(241) }, { size: -1 }, { size: 1.5 }, { size: NaN }, { size: Infinity }, { size: PROJECT_BRAIN_MAX_SOURCE_BYTES + 1 }, { uri: "" }, { uri: "https://external.invalid/file" }, { name: "x.__proto__", mimeType: null }, { name: "x.exe", mimeType: null }])("rejects malformed selected asset %j", async (change) => {
    const input = fixture(); input.pick.mockResolvedValue({ canceled: false, assets: [{ ...asset, ...change }] });
    expect(await createProjectBrainSourcePicker().run(input)).toEqual({ status: "INVALID_SELECTION" });
    expect(input.onSelected).not.toHaveBeenCalled();
  });
  it("preserves valid selected files and counts rejected files without sending their metadata", async () => {
    const input = fixture(); input.pick.mockResolvedValue({ canceled: false, assets: [{ ...asset, name: "photo.JPG", mimeType: null }, null] });
    expect(await createProjectBrainSourcePicker().run(input)).toEqual({ status: "SELECTED", rejectedCount: 1 });
    expect(input.onSelected).toHaveBeenCalledWith(context, [expect.objectContaining({ kind: "PHOTO", mimeType: "image/jpeg" })]);
  });
  it.each([null, { ...context, workspaceId: "other" }, { ...context, projectId: "other" }, { ...context, intakeId: "other" }, { ...context, stateVersion: 3 }, { ...context }])("discards files when context identity changes while native dialog is open: %j", async (changed) => {
    const input = fixture(); const gate = deferred<unknown>(); input.pick.mockReturnValue(gate.promise);
    const run = createProjectBrainSourcePicker().run(input); input.setCurrent(changed);
    gate.resolve({ canceled: false, assets: [asset] });
    expect(await run).toEqual({ status: "CONTEXT_CHANGED" }); expect(input.onSelected).not.toHaveBeenCalled();
  });
  it("never opens the dialog when context is already stale", async () => {
    const input = fixture(); input.setCurrent(null);
    expect(await createProjectBrainSourcePicker().run(input)).toEqual({ status: "CONTEXT_CHANGED" }); expect(input.pick).not.toHaveBeenCalled();
  });
  it("fences double taps synchronously until durable import completes", async () => {
    const picker = createProjectBrainSourcePicker(); const input = fixture(); const native = deferred<unknown>(); const upload = deferred<undefined>();
    input.pick.mockReturnValue(native.promise); input.onSelected.mockReturnValue(upload.promise);
    const first = picker.run(input);
    expect(picker.isBusy()).toBe(true); expect(await picker.run(input)).toEqual({ status: "BUSY" });
    native.resolve({ canceled: false, assets: [asset] }); await Promise.resolve(); await Promise.resolve();
    expect(input.onSelected).toHaveBeenCalledTimes(1); expect(await picker.run(input)).toEqual({ status: "BUSY" });
    upload.resolve(undefined); expect(await first).toMatchObject({ status: "SELECTED" }); expect(picker.isBusy()).toBe(false);
    expect(input.pick).toHaveBeenCalledTimes(1);
  });
  it("does not retry an uncertain import and releases the UI fence", async () => {
    const picker = createProjectBrainSourcePicker(); const input = fixture(); input.onSelected.mockRejectedValue(new Error("private"));
    expect(await picker.run(input)).toEqual({ status: "IMPORT_FAILED" });
    expect(input.onSelected).toHaveBeenCalledTimes(1); expect(picker.isBusy()).toBe(false);
  });
  it("offers localized native recovery without claiming upload success", () => {
    expect(projectBrainPickerMessage("UNAVAILABLE", "fr-CA")).toContain("Aucun fichier");
    expect(projectBrainPickerMessage("CONTEXT_CHANGED", "en-CA")).toContain("project");
    expect(projectBrainPickerMessage("IMPORT_FAILED", "fr-CA")).toContain("pas été confirmé");
    expect(projectBrainPickerMessage("CANCELED", "fr-CA")).toBeNull();
  });
  it("screen uses the durable queue with captured context and never requests added native permissions", () => {
    const screen = readFileSync("src/app/(app)/project-brain-intake.tsx", "utf8");
    const handler = screen.slice(screen.indexOf("const pickSources ="), screen.indexOf("const startVoice ="));
    expect(handler).toContain("sourcePicker.isBusy()"); expect(handler).toContain("sourcePicker.run(");
    expect(handler).toContain("workspaceId: context.workspaceId"); expect(handler).toContain("context.stateVersion");
    expect(handler).toContain("sendSources("); expect(handler).not.toContain("commandBase()"); expect(handler).not.toContain("fetch("); expect(handler).not.toContain("requestPermission");
    expect(screen).toContain("await stageProjectBrainSources(attempts)"); expect(screen).toContain("await uploadProjectBrainSource(attempt)");
  });
});
