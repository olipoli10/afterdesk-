import { z } from "zod";
import { createProjectBrainSourceAttempt, mobileProjectBrainCommandResultSchema, mobileProjectBrainSourceCommandSchema, PROJECT_BRAIN_MAX_SOURCE_BYTES, PROJECT_BRAIN_MAX_VOICE_DURATION_MS, type ProjectBrainSourceAttempt } from "./project-brain-intake";
import type { SecureProjectBrainIntentStore } from "./project-brain-intent-queue";

const key = "endvera.mobile.project-brain-voice.v1";
const id = z.string().min(1).max(200);
const schema = z.object({ schemaVersion: z.literal(1), ownerId: id, workspaceId: id, projectId: id, intakeId: id,
  stateVersion: z.number().int().positive(), commandId: z.string().uuid(), recordingId: id,
  uri: z.string().regex(/^file:\/\/.+/).max(700), fileName: z.string().regex(/^memo-[0-9a-f-]+\.m4a$/).max(64),
  phase: z.enum(["RECORDING", "INTERRUPTED", "STOP_CONFIRMED", "STAGED", "CLEANUP_PENDING"]),
  durationMs: z.number().int().positive().max(PROJECT_BRAIN_MAX_VOICE_DURATION_MS).nullable(),
  sizeBytes: z.number().int().positive().max(PROJECT_BRAIN_MAX_SOURCE_BYTES).nullable(),
}).strict().superRefine((value, context) => {
  const confirmed = value.phase === "STOP_CONFIRMED" || value.phase === "STAGED";
  if ((value.durationMs === null) !== (value.sizeBytes === null)
    || value.phase !== "CLEANUP_PENDING" && confirmed !== (value.durationMs !== null && value.sizeBytes !== null)) context.addIssue({ code: "custom", message: "VOICE_JOURNAL_COMPLETION_INVALID" });
});
export type ProjectBrainVoiceJournal = Readonly<z.infer<typeof schema>>;
// The foreground application has one JS runtime. This is not a cross-process SecureStore CAS.
let tail: Promise<unknown> = Promise.resolve();
const serialized = <T>(run: () => Promise<T>): Promise<T> => { const result = tail.then(run, run); tail = result.catch(() => undefined); return result; };
async function storeOrDefault(store?: SecureProjectBrainIntentStore) { return store ?? import("expo-secure-store"); }
async function read(store: SecureProjectBrainIntentStore) {
  const value = await store.getItemAsync(key);
  if (value === null) return null;
  if (new TextEncoder().encode(value).length > 2000) throw new Error("VOICE_JOURNAL_INVALID");
  return Object.freeze(schema.parse(JSON.parse(value)));
}
async function write(store: SecureProjectBrainIntentStore, value: unknown) {
  const parsed = schema.parse(value), encoded = JSON.stringify(parsed);
  if (new TextEncoder().encode(encoded).length > 2000) throw new Error("VOICE_JOURNAL_TOO_LARGE");
  await store.setItemAsync(key, encoded); return Object.freeze(parsed);
}
export function loadProjectBrainVoiceJournal(ownerId: string, store?: SecureProjectBrainIntentStore) {
  return serialized(async () => {
    const target = await storeOrDefault(store), prior = await read(target);
    if (!prior || prior.ownerId !== ownerId) return null;
    // A new screen/process cannot attest completion or an invalidation whose storage write failed.
    // Only a source already validated and STAGED retains its exact uncertain-upload replay.
    return prior.phase === "RECORDING" || prior.phase === "STOP_CONFIRMED"
      ? write(target, { ...prior, phase: "INTERRUPTED", durationMs: null, sizeBytes: null }) : prior;
  });
}
export async function beginProjectBrainVoiceJournal(value: ProjectBrainVoiceJournal, store?: SecureProjectBrainIntentStore) {
  const snapshot = schema.parse(value);
  return serialized(async () => {
    const target = await storeOrDefault(store);
    if (await read(target)) throw new Error("VOICE_JOURNAL_PENDING");
    if (snapshot.phase !== "RECORDING" || snapshot.durationMs !== null || snapshot.sizeBytes !== null) throw new Error("VOICE_JOURNAL_START_INVALID");
    return write(target, snapshot);
  });
}
export async function transitionProjectBrainVoiceJournal(expected: ProjectBrainVoiceJournal, phase: "INTERRUPTED" | "STOP_CONFIRMED" | "STAGED", metadata?: { durationMs: number; sizeBytes: number }, store?: SecureProjectBrainIntentStore) {
  const snapshot = schema.parse(expected), completion = metadata ? { ...metadata } : undefined;
  return serialized(async () => {
    const target = await storeOrDefault(store), current = await read(target);
    if (JSON.stringify(current) !== JSON.stringify(snapshot)) throw new Error("VOICE_JOURNAL_CHANGED");
    if (!(current?.phase === "RECORDING" && ["INTERRUPTED", "STOP_CONFIRMED"].includes(phase)
      || current?.phase === "STOP_CONFIRMED" && ["STAGED", "INTERRUPTED"].includes(phase))) throw new Error("VOICE_JOURNAL_TRANSITION_REFUSED");
    return write(target, { ...current, phase, ...(phase === "STOP_CONFIRMED" ? completion : phase === "INTERRUPTED" ? { durationMs: null, sizeBytes: null } : {}) });
  });
}
export function projectBrainVoiceJournalAttempt(value: ProjectBrainVoiceJournal, context: { ownerId: string; workspaceId: string; projectId: string; intakeId: string; stateVersion: number }) {
  const journal = schema.parse(value);
  if (!["STOP_CONFIRMED", "STAGED"].includes(journal.phase) || journal.ownerId !== context.ownerId
    || journal.workspaceId !== context.workspaceId || journal.projectId !== context.projectId || journal.intakeId !== context.intakeId
    || (journal.phase !== "STAGED" && journal.stateVersion !== context.stateVersion)) throw new Error("VOICE_JOURNAL_CONTEXT_REFUSED");
  return createProjectBrainSourceAttempt({ schemaVersion: 1, commandId: journal.commandId, action: "ADMIT_PROJECT_BRAIN_SOURCE",
    workspaceId: journal.workspaceId, projectId: journal.projectId, intakeId: journal.intakeId, expectedStateVersion: journal.stateVersion,
    kind: "VOICE_NOTE", mimeType: "audio/m4a", fileName: journal.fileName, uri: journal.uri, sizeBytes: journal.sizeBytes!, durationMs: journal.durationMs! });
}
export function requireProjectBrainVoiceRetainedAttempt(expected: ProjectBrainSourceAttempt, retained: readonly ProjectBrainSourceAttempt[]) {
  if (retained.length !== 1 || !["READY", "OUTCOME_UNKNOWN", "CONFIRMED", "REPLAYED"].includes(retained[0]?.state)) throw new Error("VOICE_DURABLE_SOURCE_CHANGED");
  const command = mobileProjectBrainSourceCommandSchema.parse(retained[0].command);
  if (Object.entries(expected.command).some(([field, value]) => field !== "uri" && command[field as keyof typeof command] !== value)
    || !/^file:\/\/.+/.test(command.uri)) throw new Error("VOICE_DURABLE_SOURCE_CHANGED");
  return Object.freeze({ ...retained[0], command: Object.freeze(command), result: retained[0].result ? mobileProjectBrainCommandResultSchema.parse(retained[0].result) : null });
}

/** Persist cleanup-only intent before deleting the file: a later storage failure must never require re-upload. */
export async function clearProjectBrainVoiceJournal(expected: ProjectBrainVoiceJournal, input: { discarded?: boolean; receipt?: ProjectBrainSourceAttempt; removeFile: (uri: string) => Promise<void> }, store?: SecureProjectBrainIntentStore) {
  expected = Object.freeze(schema.parse(expected));
  const discarded = input.discarded === true, removeFile = input.removeFile;
  const r = input.receipt ? { ...input.receipt, command: { ...input.receipt.command }, result: input.receipt.result ? mobileProjectBrainCommandResultSchema.parse(input.receipt.result) : null } : undefined;
  return serialized(async () => {
    const target = await storeOrDefault(store), current = await read(target);
    if (JSON.stringify(current) !== JSON.stringify(schema.parse(expected))) throw new Error("VOICE_JOURNAL_CHANGED");
    const cleanup = expected.phase === "CLEANUP_PENDING";
    const command = discarded || cleanup ? null : projectBrainVoiceJournalAttempt(expected,
      { ownerId: expected.ownerId, workspaceId: expected.workspaceId, projectId: expected.projectId, intakeId: expected.intakeId, stateVersion: expected.stateVersion });
    if (!discarded && !cleanup && (!r || !["CONFIRMED", "REPLAYED"].includes(r.state) || !r.result
      || r.command.commandId !== expected.commandId || r.result.commandId !== expected.commandId
      || r.result.workspaceId !== expected.workspaceId || r.result.projectId !== expected.projectId
      || r.result.intakeId !== expected.intakeId
      || r.result.action !== "ADMIT_PROJECT_BRAIN_SOURCE"
      || Object.entries(command!.command).some(([field, value]) => field !== "uri" && r.command[field as keyof typeof r.command] !== value))) throw new Error("VOICE_JOURNAL_RECEIPT_REQUIRED");
    if (!cleanup) await write(target, { ...expected, phase: "CLEANUP_PENDING" });
    await removeFile(expected.uri);
    await target.deleteItemAsync(key);
  });
}
