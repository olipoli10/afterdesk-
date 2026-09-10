import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { beginProjectBrainVoiceJournal as begin, loadProjectBrainVoiceJournal as load, transitionProjectBrainVoiceJournal as transition,
  projectBrainVoiceJournalAttempt as attempt, requireProjectBrainVoiceRetainedAttempt as retained, clearProjectBrainVoiceJournal as clear, type ProjectBrainVoiceJournal } from "../src/lib/project-brain-voice-journal";
import { mobileProjectBrainSourceCommandSchema, type ProjectBrainSourceAttempt } from "../src/lib/project-brain-intake";

const initial = (): ProjectBrainVoiceJournal => ({ schemaVersion: 1, ownerId: "owner", workspaceId: "workspace", projectId: "project", intakeId: "intake",
  stateVersion: 1, commandId: "b3e8a52c-5ce1-4e8d-a99b-e9660c9fceac", recordingId: "recorder", uri: "file:///document/recording.m4a", fileName: "memo-1000.m4a",
  phase: "RECORDING", durationMs: null, sizeBytes: null });
const context = { ownerId: "owner", workspaceId: "workspace", projectId: "project", intakeId: "intake", stateVersion: 1 };
const store = () => {
  const rows = new Map<string, string>();
  return { rows, getItemAsync: vi.fn(async (key: string) => rows.get(key) ?? null), setItemAsync: vi.fn(async (key: string, value: string) => { rows.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { rows.delete(key); }) };
};
async function confirmed() { const s = store(), recording = await begin(initial(), s); return { s, recording, value: await transition(recording, "STOP_CONFIRMED", { durationMs: 600000, sizeBytes: 4800000 }, s) }; }
const receipt = (value: ProjectBrainVoiceJournal): ProjectBrainSourceAttempt => ({ ...attempt(value, context), state: "CONFIRMED", result: {
  schemaVersion: 1, commandId: value.commandId, action: "ADMIT_PROJECT_BRAIN_SOURCE", intakeId: value.intakeId,
  workspaceId: value.workspaceId, projectId: value.projectId, stateVersion: 2, status: "DRAFT", reviewFingerprint: null,
  canonicalEffectId: "decision", replayed: false, providerExecutionPerformed: false, externalTransportPerformed: false,
} });
describe("bounded local voice journal, never authority or automatic upload", () => {
  it("persists one exact owner/context/native URI before recording; refuses replacement", async () => {
    const s = store(), value = await begin(initial(), s); expect(Object.isFrozen(value)).toBe(true);
    await expect(begin({ ...initial(), ownerId: "other" }, s)).rejects.toThrow("PENDING"); expect(s.rows.size).toBe(1);
  });
  it("records interrupted rather than successful completion after restart", async () => {
    const s = store(); await begin(initial(), s); const recovered = await load("owner", s);
    expect(recovered).toEqual({ ...initial(), phase: "INTERRUPTED" }); expect(() => attempt(recovered!, context)).toThrow();
    expect(await load("owner", s)).toEqual(recovered);
  });
  it("never exposes another owner's journal", async () => { const s = store(); await begin(initial(), s); expect(await load("other", s)).toBeNull(); });
  it.each(["ownerId", "workspaceId", "projectId", "intakeId"] as const)("refuses changed %s", async field => {
    const { value } = await confirmed(); expect(() => attempt(value, { ...context, [field]: "other" })).toThrow("CONTEXT");
  });
  it("requires exact version before staging but replays the same old command after a staged lost receipt", async () => {
    const { s, value } = await confirmed(); expect(() => attempt(value, { ...context, stateVersion: 2 })).toThrow("CONTEXT");
    const staged = await transition(value, "STAGED", undefined, s);
    expect(attempt(staged, { ...context, stateVersion: 2 }).command).toEqual(attempt(value, context).command);
  });
  it.each([600001, 0, NaN])("refuses invalid actual duration %s without changing prior phase", async durationMs => {
    const s = store(), value = await begin(initial(), s);
    await expect(transition(value, "STOP_CONFIRMED", { durationMs, sizeBytes: 10 }, s)).rejects.toThrow();
    expect(JSON.parse([...s.rows.values()][0]).phase).toBe("RECORDING");
  });
  it.each([120000, 600000])("accepts bounded %s ms without clamping", async durationMs => {
    const { value } = await confirmed(); const command = attempt({ ...value, durationMs }, context).command;
    expect(mobileProjectBrainSourceCommandSchema.parse(command).durationMs).toBe(durationMs);
  });
  it("keeps the 10 MiB bound", async () => {
    const { value } = await confirmed(); expect(() => attempt({ ...value, sizeBytes: 10 * 1024 * 1024 + 1 }, context)).toThrow();
  });
  it("rejects stale native success after interruption", async () => {
    const s = store(), value = await begin(initial(), s); await transition(value, "INTERRUPTED", undefined, s);
    await expect(transition(value, "STOP_CONFIRMED", { durationMs: 1000, sizeBytes: 10 }, s)).rejects.toThrow("CHANGED");
  });
  it("background arriving during stop persistence invalidates completion before staging", async () => {
    const { s, value } = await confirmed(); const interrupted = await transition(value, "INTERRUPTED", undefined, s);
    expect(interrupted.durationMs).toBeNull(); expect(interrupted.sizeBytes).toBeNull();
    expect(() => attempt(interrupted, context)).toThrow("CONTEXT");
    await expect(transition(interrupted, "STAGED", undefined, s)).rejects.toThrow("TRANSITION");
  });
  it("snapshots native context before asynchronous persistence", async () => {
    const s = store(), input = { ...initial() }; const pending = begin(input, s); input.ownerId = "other";
    expect((await pending).ownerId).toBe("owner");
  });
  it("deletes only the exact original file after a canonical matching receipt", async () => {
    const { s, value } = await confirmed(), removeFile = vi.fn();
    await clear(value, { receipt: receipt(value), removeFile }, s);
    expect(removeFile).toHaveBeenCalledExactlyOnceWith(value.uri); expect(s.rows.size).toBe(0);
  });
  it.each(["intakeId", "workspaceId", "projectId", "commandId"] as const)("rejects receipt with changed %s without deleting", async field => {
    const { s, value } = await confirmed(), removeFile = vi.fn(), r = receipt(value);
    await expect(clear(value, { receipt: { ...r, result: { ...r.result!, [field]: field === "commandId" ? "75d72501-32c2-4671-b479-6d4799e74b96" : "other" } }, removeFile }, s)).rejects.toThrow("RECEIPT");
    expect(removeFile).not.toHaveBeenCalled(); expect(s.rows.size).toBe(1);
  });
  it("retains upload deadline specifically for sources and reuses a previously confirmed result", () => {
    const api = readFileSync("src/lib/api.ts", "utf8"), screen = readFileSync("src/app/(app)/project-brain-intake.tsx", "utf8");
    const upload = api.slice(api.indexOf("async uploadProjectBrainSource("), api.indexOf("async uploadProjectBrainSource(") + 1600);
    expect(upload).toContain("}, 120_000)");
    expect(screen).toContain('["CONFIRMED", "REPLAYED"].includes(durable.state) ? durable : await uploadProjectBrainSource(durable)');
    const resume = screen.slice(screen.indexOf("const resumeVoice ="), screen.indexOf("const retrySource ="));
    expect(resume).toMatch(/await transitionProjectBrainVoiceJournal\(journal, "STAGED"\)[\s\S]*if \(!pickerMounted.current \|\| !appActive.current \|\| ownerRef.current !== ownerId \|\| pickerContextRef.current !== context\)[\s\S]*await uploadProjectBrainSource/);
  });
  it.each(["workspaceId", "projectId", "intakeId", "commandId", "fileName"] as const)("retention cannot change %s before upload", async field => {
    const { value } = await confirmed(), original = attempt(value, context);
    expect(() => retained(original, [{ ...original, command: { ...original.command, [field]: "other" } }])).toThrow();
  });
  it("retention keeps exact replay identity and snapshots the one allowed changed URI", async () => {
    const { value } = await confirmed(), original = attempt(value, context), input = { ...original, command: { ...original.command, uri: "file:///document/retained.m4a" }, state: "OUTCOME_UNKNOWN" as const };
    const result = retained(original, [input]); input.command.workspaceId = "other";
    expect(result.command.workspaceId).toBe("workspace"); expect(result.command.uri).toBe("file:///document/retained.m4a"); expect(result.state).toBe("OUTCOME_UNKNOWN");
  });
  it("storage failure does not acknowledge a recording start", async () => {
    const s = store(); s.setItemAsync.mockRejectedValue(new Error("synthetic disk full")); await expect(begin(initial(), s)).rejects.toThrow("disk full");
  });
  it("refuses oversized journal before storage write", async () => {
    const s = store(); await expect(begin({ ...initial(), uri: `file:///${"x".repeat(701)}` }, s)).rejects.toThrow(); expect(s.setItemAsync).not.toHaveBeenCalled();
  });
  it("unknown outcome never clears or deletes retained audio", async () => {
    const { s, value } = await confirmed(), removeFile = vi.fn(); const pending = attempt(value, context);
    await expect(clear(value, { receipt: { ...pending, state: "OUTCOME_UNKNOWN" }, removeFile }, s)).rejects.toThrow("RECEIPT");
    expect(removeFile).not.toHaveBeenCalled(); expect(s.rows.size).toBe(1);
  });
  it("explicit discard is permitted for interrupted evidence, not an invented completion", async () => {
    const s = store(), value = await begin(initial(), s), interrupted = await transition(value, "INTERRUPTED", undefined, s), removeFile = vi.fn();
    await clear(interrupted, { discarded: true, removeFile }, s); expect(removeFile).toHaveBeenCalledWith(value.uri); expect(s.rows.size).toBe(0);
  });
  it("file removal failure retains the journal", async () => {
    const s = store(), value = await begin(initial(), s); await expect(clear(value, { discarded: true, removeFile: async () => { throw new Error("synthetic file error"); } }, s)).rejects.toThrow();
    expect(s.rows.size).toBe(1);
  });
  it("failed journal deletion resumes cleanup only after the audio is already gone", async () => {
    const { s, value } = await confirmed(), removeFile = vi.fn(async () => undefined);
    s.deleteItemAsync.mockRejectedValueOnce(new Error("synthetic secure store failure"));
    await expect(clear(value, { receipt: receipt(value), removeFile }, s)).rejects.toThrow("secure store");
    const cleanup = await load("owner", s); expect(cleanup?.phase).toBe("CLEANUP_PENDING");
    expect(() => attempt(cleanup!, context)).toThrow("CONTEXT");
    await clear(cleanup!, { removeFile }, s); expect(s.rows.size).toBe(0); expect(removeFile).toHaveBeenCalledTimes(2);
  });
  it("failed cleanup-intent persistence never deletes audio", async () => {
    const { s, value } = await confirmed(), removeFile = vi.fn(); s.setItemAsync.mockRejectedValueOnce(new Error("synthetic disk"));
    await expect(clear(value, { receipt: receipt(value), removeFile }, s)).rejects.toThrow("disk");
    expect(removeFile).not.toHaveBeenCalled(); expect((await load("owner", s))?.phase).toBe("INTERRUPTED");
  });
  it("restart refuses an unstaged completion that may have lost its invalidation write", async () => {
    const { s, value } = await confirmed(); s.setItemAsync.mockRejectedValueOnce(new Error("synthetic invalidation write failed"));
    await expect(transition(value, "INTERRUPTED", undefined, s)).rejects.toThrow("invalidation");
    const recovered = await load("owner", s); expect(recovered?.phase).toBe("INTERRUPTED"); expect(recovered?.uri).toBe(value.uri);
    expect(() => attempt(recovered!, context)).toThrow("CONTEXT");
  });
  it("restart preserves already-staged exact command replay, never rebases", async () => {
    const { s, value } = await confirmed(); const saved = await transition(value, "STAGED", undefined, s);
    const recovered = await load("owner", s); expect(recovered).toEqual(saved);
    expect(attempt(recovered!, { ...context, stateVersion: 2 }).command.expectedStateVersion).toBe(1);
  });
  it("screen explicitly stages without auto-upload, stops on background and blocks accidental navigation", () => {
    const screen = readFileSync("src/app/(app)/project-brain-intake.tsx", "utf8");
    expect(screen).toContain('directory: "document"'); expect(screen).toContain("bitRate: 64_000, numberOfChannels: 1");
    expect(screen).toContain("maxFileSize: PROJECT_BRAIN_MAX_SOURCE_BYTES"); expect(screen).toContain("allowsBackgroundRecording: false");
    expect(screen).toContain("usePreventRemove(voiceSessionActive"); expect(screen).toContain('AppState.addEventListener("change"');
    const finalize = screen.slice(screen.indexOf("const finalizeRecordedVoice ="), screen.indexOf("const removeRecordedFile ="));
    expect(finalize).not.toContain("stageProjectBrainSources"); expect(finalize).not.toContain("uploadProjectBrainSource");
    expect(finalize).toContain("voiceInterrupted.current");
    expect(finalize).toContain('invalidVoiceCommands.current.add(journalRef.current.commandId)');
    expect(finalize).toContain('VOICE_INTERRUPTION_PERSISTENCE_FAILED');
    expect(screen).toContain('!discarded && invalidVoiceCommands.current.has(journal.commandId)');
    expect(screen).toContain('voiceInterrupted.current || !appActive.current || ownerRef.current !== ownerId');
    expect(screen).toContain('voiceInterrupted.current = true; void stopVoiceRef.current()');
    expect(screen.indexOf("await beginProjectBrainVoiceJournal")).toBeLessThan(screen.indexOf("recorder.record({ forDuration"));
  });
});
