import { z } from "zod";
import {
  mobileProjectBrainCommandResultSchema,
  mobileProjectBrainCommandSchema,
  mobileProjectBrainSourceCommandSchema,
  type MobileProjectBrainCommand,
  type MobileProjectBrainCommandResult,
  type ProjectBrainSourceAttempt,
} from "@/lib/project-brain-intake";

export const PROJECT_BRAIN_INTENT_QUEUE_VERSION = 1 as const;
export const PROJECT_BRAIN_INTENT_QUEUE_LIMIT = 20;
export const PROJECT_BRAIN_INTENT_MAX_BYTES = 96 * 1024;
const PROJECT_BRAIN_INTENT_CHUNK_CHARACTERS = 1_800;
const PROJECT_BRAIN_INTENT_MAX_CHUNKS = 64;

export const projectBrainIntentStateSchema = z.enum([
  "READY",
  "SENDING",
  "CONFIRMED",
  "REPLAYED",
  "CONFLICT",
  "OUTCOME_UNKNOWN",
  "REFUSED",
]);

export type ProjectBrainIntentState = z.infer<typeof projectBrainIntentStateSchema>;

const attemptFields = {
  state: projectBrainIntentStateSchema,
  result: mobileProjectBrainCommandResultSchema.nullable(),
  publicError: z.string().max(500).nullable(),
};

export const projectBrainCommandAttemptSchema = z.object({
  command: mobileProjectBrainCommandSchema,
  ...attemptFields,
}).strict();

const projectBrainSourceAttemptSchema = z.object({
  command: mobileProjectBrainSourceCommandSchema,
  ...attemptFields,
}).strict();

export type ProjectBrainCommandAttempt = Readonly<{
  command: MobileProjectBrainCommand;
  state: ProjectBrainIntentState;
  result: MobileProjectBrainCommandResult | null;
  publicError: string | null;
}>;

export const storedProjectBrainIntentSchema = z.discriminatedUnion("kind", [
  z.object({
    schemaVersion: z.literal(PROJECT_BRAIN_INTENT_QUEUE_VERSION),
    kind: z.literal("COMMAND"),
    attempt: projectBrainCommandAttemptSchema,
  }).strict(),
  z.object({
    schemaVersion: z.literal(PROJECT_BRAIN_INTENT_QUEUE_VERSION),
    kind: z.literal("SOURCE"),
    attempt: projectBrainSourceAttemptSchema,
  }).strict(),
]);

export type StoredProjectBrainIntent = z.infer<typeof storedProjectBrainIntentSchema>;

const queueIndexSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_INTENT_QUEUE_VERSION),
  commandIds: z.array(z.string().uuid()).max(PROJECT_BRAIN_INTENT_QUEUE_LIMIT),
}).strict();

const entryManifestSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_INTENT_QUEUE_VERSION),
  chunkCount: z.number().int().positive().max(PROJECT_BRAIN_INTENT_MAX_CHUNKS),
  serializedCharacters: z.number().int().positive().max(PROJECT_BRAIN_INTENT_MAX_BYTES),
}).strict();

const entryPointerSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_INTENT_QUEUE_VERSION),
  activeGeneration: z.enum(["A", "B"]),
}).strict();

type EntryGeneration = z.infer<typeof entryPointerSchema>["activeGeneration"];

const mutationJournalSchema = z.object({
  schemaVersion: z.literal(PROJECT_BRAIN_INTENT_QUEUE_VERSION),
  operation: z.literal("ENQUEUE"),
  commandId: z.string().uuid(),
}).strict();

export type SecureProjectBrainIntentStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

const INDEX_KEY = "endvera.mobile.project-brain-intents.v1.index";
const JOURNAL_KEY = "endvera.mobile.project-brain-intents.v1.journal";
const ENTRY_PREFIX = "endvera.mobile.project-brain-intents.v1.entry.";
let intentStoreTail: Promise<void> = Promise.resolve();

function withIntentStoreLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = intentStoreTail.then(operation, operation);
  intentStoreTail = result.then(() => undefined, () => undefined);
  return result;
}

async function defaultStore(): Promise<SecureProjectBrainIntentStore> {
  return import("expo-secure-store");
}

function legacyManifestKey(commandId: string) {
  return `${ENTRY_PREFIX}${commandId}.manifest`;
}

function legacyChunkKey(commandId: string, index: number) {
  return `${ENTRY_PREFIX}${commandId}.chunk.${index}`;
}

function pointerKey(commandId: string) {
  return `${ENTRY_PREFIX}${commandId}.pointer`;
}

function generationManifestKey(commandId: string, generation: EntryGeneration) {
  return `${ENTRY_PREFIX}${commandId}.${generation}.manifest`;
}

function generationChunkKey(commandId: string, generation: EntryGeneration, index: number) {
  return `${ENTRY_PREFIX}${commandId}.${generation}.chunk.${index}`;
}

function commandIdFor(intent: StoredProjectBrainIntent) {
  return intent.attempt.command.commandId;
}

function parseFrozenIntent(value: unknown): StoredProjectBrainIntent {
  return storedProjectBrainIntentSchema.parse(value);
}

async function readRawIndex(store: SecureProjectBrainIntentStore) {
  const raw = await store.getItemAsync(INDEX_KEY);
  if (!raw) {
    return queueIndexSchema.parse({
      schemaVersion: PROJECT_BRAIN_INTENT_QUEUE_VERSION,
      commandIds: [],
    });
  }
  try {
    return queueIndexSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("MOBILE_PROJECT_BRAIN_INTENT_INDEX_CORRUPT");
  }
}

async function writeIndex(store: SecureProjectBrainIntentStore, commandIds: readonly string[]) {
  await store.setItemAsync(INDEX_KEY, JSON.stringify(queueIndexSchema.parse({
    schemaVersion: PROJECT_BRAIN_INTENT_QUEUE_VERSION,
    commandIds,
  })));
}

async function readIndex(store: SecureProjectBrainIntentStore) {
  let index = await readRawIndex(store);
  const rawJournal = await store.getItemAsync(JOURNAL_KEY);
  if (!rawJournal) return index;
  let journal: z.infer<typeof mutationJournalSchema>;
  try {
    journal = mutationJournalSchema.parse(JSON.parse(rawJournal));
  } catch {
    throw new Error("MOBILE_PROJECT_BRAIN_INTENT_JOURNAL_CORRUPT");
  }
  try {
    await readIntent(store, journal.commandId);
  } catch {
    await deleteProjectBrainIntentEntry(store, journal.commandId, true);
    await store.deleteItemAsync(JOURNAL_KEY);
    return index;
  }
  if (!index.commandIds.includes(journal.commandId)) {
    index = queueIndexSchema.parse({
      schemaVersion: PROJECT_BRAIN_INTENT_QUEUE_VERSION,
      commandIds: [...index.commandIds, journal.commandId],
    });
    await writeIndex(store, index.commandIds);
  }
  await store.deleteItemAsync(JOURNAL_KEY);
  return index;
}

async function readSerializedIntent(
  store: SecureProjectBrainIntentStore,
  commandId: string,
  rawManifest: string | null,
  chunkKeyForIndex: (index: number) => string,
) {
  if (!rawManifest) throw new Error("MOBILE_PROJECT_BRAIN_INTENT_MISSING");
  let manifest: z.infer<typeof entryManifestSchema>;
  try {
    manifest = entryManifestSchema.parse(JSON.parse(rawManifest));
  } catch {
    throw new Error("MOBILE_PROJECT_BRAIN_INTENT_MANIFEST_CORRUPT");
  }
  const chunks: string[] = [];
  for (let index = 0; index < manifest.chunkCount; index += 1) {
    const chunk = await store.getItemAsync(chunkKeyForIndex(index));
    if (chunk === null) throw new Error("MOBILE_PROJECT_BRAIN_INTENT_CHUNK_MISSING");
    chunks.push(chunk);
  }
  const serialized = chunks.join("");
  if (serialized.length !== manifest.serializedCharacters) {
    throw new Error("MOBILE_PROJECT_BRAIN_INTENT_LENGTH_MISMATCH");
  }
  try {
    const intent = parseFrozenIntent(JSON.parse(serialized));
    if (commandIdFor(intent) !== commandId) throw new Error("COMMAND_ID_MISMATCH");
    return intent;
  } catch {
    throw new Error("MOBILE_PROJECT_BRAIN_INTENT_CORRUPT");
  }
}

async function readIntent(store: SecureProjectBrainIntentStore, commandId: string) {
  const rawPointer = await store.getItemAsync(pointerKey(commandId));
  if (!rawPointer) {
    return readSerializedIntent(
      store,
      commandId,
      await store.getItemAsync(legacyManifestKey(commandId)),
      (index) => legacyChunkKey(commandId, index),
    );
  }
  let pointer: z.infer<typeof entryPointerSchema>;
  try {
    pointer = entryPointerSchema.parse(JSON.parse(rawPointer));
  } catch {
    throw new Error("MOBILE_PROJECT_BRAIN_INTENT_POINTER_CORRUPT");
  }
  return readSerializedIntent(
    store,
    commandId,
    await store.getItemAsync(generationManifestKey(commandId, pointer.activeGeneration)),
    (index) => generationChunkKey(commandId, pointer.activeGeneration, index),
  );
}

async function writeIntent(store: SecureProjectBrainIntentStore, input: StoredProjectBrainIntent) {
  const intent = parseFrozenIntent(input);
  const serialized = JSON.stringify(intent);
  if (new TextEncoder().encode(serialized).byteLength > PROJECT_BRAIN_INTENT_MAX_BYTES) {
    throw new Error("MOBILE_PROJECT_BRAIN_INTENT_TOO_LARGE");
  }
  const commandId = commandIdFor(intent);
  const rawPointer = await store.getItemAsync(pointerKey(commandId));
  let activeGeneration: EntryGeneration | null = null;
  if (rawPointer) {
    try {
      activeGeneration = entryPointerSchema.parse(JSON.parse(rawPointer)).activeGeneration;
    } catch {
      throw new Error("MOBILE_PROJECT_BRAIN_INTENT_POINTER_CORRUPT");
    }
  }
  const targetGeneration: EntryGeneration = activeGeneration === "A" ? "B" : "A";
  const priorTargetManifestRaw = await store.getItemAsync(generationManifestKey(commandId, targetGeneration));
  let priorTargetChunkCount = 0;
  if (priorTargetManifestRaw) {
    try {
      priorTargetChunkCount = entryManifestSchema.parse(JSON.parse(priorTargetManifestRaw)).chunkCount;
    } catch {
      throw new Error("MOBILE_PROJECT_BRAIN_INTENT_MANIFEST_CORRUPT");
    }
  }
  const chunks: string[] = [];
  for (let offset = 0; offset < serialized.length; offset += PROJECT_BRAIN_INTENT_CHUNK_CHARACTERS) {
    chunks.push(serialized.slice(offset, offset + PROJECT_BRAIN_INTENT_CHUNK_CHARACTERS));
  }
  for (let index = 0; index < chunks.length; index += 1) {
    await store.setItemAsync(generationChunkKey(commandId, targetGeneration, index), chunks[index]!);
  }
  await store.setItemAsync(generationManifestKey(commandId, targetGeneration), JSON.stringify(entryManifestSchema.parse({
    schemaVersion: PROJECT_BRAIN_INTENT_QUEUE_VERSION,
    chunkCount: chunks.length,
    serializedCharacters: serialized.length,
  })));
  for (let index = chunks.length; index < priorTargetChunkCount; index += 1) {
    await store.deleteItemAsync(generationChunkKey(commandId, targetGeneration, index));
  }
  await store.setItemAsync(pointerKey(commandId), JSON.stringify(entryPointerSchema.parse({
    schemaVersion: PROJECT_BRAIN_INTENT_QUEUE_VERSION,
    activeGeneration: targetGeneration,
  })));
  const legacyManifestRaw = await store.getItemAsync(legacyManifestKey(commandId));
  if (legacyManifestRaw) {
    let legacyChunkCount = 0;
    try {
      legacyChunkCount = entryManifestSchema.parse(JSON.parse(legacyManifestRaw)).chunkCount;
    } catch {
      throw new Error("MOBILE_PROJECT_BRAIN_INTENT_MANIFEST_CORRUPT");
    }
    await store.deleteItemAsync(legacyManifestKey(commandId));
    for (let index = 0; index < legacyChunkCount; index += 1) {
      await store.deleteItemAsync(legacyChunkKey(commandId, index));
    }
  }
  return intent;
}

export function createProjectBrainCommandAttempt(command: unknown): ProjectBrainCommandAttempt {
  return Object.freeze(projectBrainCommandAttemptSchema.parse({
    command,
    state: "READY",
    result: null,
    publicError: null,
  }));
}

export function beginProjectBrainCommandAttempt(value: ProjectBrainCommandAttempt): ProjectBrainCommandAttempt {
  const parsed = projectBrainCommandAttemptSchema.parse(value);
  if (parsed.state !== "READY" && parsed.state !== "OUTCOME_UNKNOWN") {
    throw new Error("MOBILE_PROJECT_BRAIN_COMMAND_ALREADY_DISPATCHED");
  }
  return Object.freeze(projectBrainCommandAttemptSchema.parse({
    ...parsed,
    state: "SENDING",
    publicError: null,
  }));
}

export function finishProjectBrainCommandAttempt(
  value: ProjectBrainCommandAttempt,
  input: {
    state: Exclude<ProjectBrainIntentState, "READY" | "SENDING">;
    result?: MobileProjectBrainCommandResult | null;
    publicError?: string | null;
  },
): ProjectBrainCommandAttempt {
  const parsed = projectBrainCommandAttemptSchema.parse(value);
  if (parsed.state !== "SENDING") throw new Error("MOBILE_PROJECT_BRAIN_COMMAND_NOT_SENDING");
  return Object.freeze(projectBrainCommandAttemptSchema.parse({
    ...parsed,
    state: input.state,
    result: input.result ?? null,
    publicError: input.publicError ?? null,
  }));
}

export function projectBrainCommandQueueForContext(
  queue: readonly ProjectBrainCommandAttempt[],
  workspaceId: string | undefined,
  projectId: string | undefined,
) {
  return queue.filter(
    (attempt) => attempt.command.workspaceId === workspaceId && attempt.command.projectId === projectId,
  );
}

export function projectBrainIntentPresentation(value: {
  state: ProjectBrainIntentState;
  publicError: string | null;
}) {
  return Object.freeze({
    publicError: value.publicError,
    retryable: value.state === "READY" || value.state === "OUTCOME_UNKNOWN",
    dismissible: value.state === "CONFLICT" || value.state === "REFUSED",
    consequentialMutationBlocked:
      value.state === "READY" || value.state === "SENDING" || value.state === "OUTCOME_UNKNOWN",
  });
}

export function projectBrainCanCreateNewVersion(
  status: "DRAFT" | "READY_FOR_REVIEW" | "CONFIRMED" | "REJECTED" | null | undefined,
) {
  return status === "CONFIRMED" || status === "REJECTED";
}

export async function enqueueProjectBrainIntent(input: {
  intent: StoredProjectBrainIntent;
  store?: SecureProjectBrainIntentStore;
}) {
  return withIntentStoreLock(async () => {
    const store = input.store ?? await defaultStore();
    const intent = parseFrozenIntent(input.intent);
    const commandId = commandIdFor(intent);
    const index = await readIndex(store);
    if (index.commandIds.includes(commandId)) {
      const existing = await readIntent(store, commandId);
      if (existing.kind !== intent.kind || JSON.stringify(existing.attempt.command) !== JSON.stringify(intent.attempt.command)) {
        throw new Error("MOBILE_PROJECT_BRAIN_INTENT_IDEMPOTENCY_CONFLICT");
      }
      return existing;
    }
    if (index.commandIds.length >= PROJECT_BRAIN_INTENT_QUEUE_LIMIT) {
      throw new Error("MOBILE_PROJECT_BRAIN_INTENT_QUEUE_FULL");
    }
    await store.setItemAsync(JOURNAL_KEY, JSON.stringify(mutationJournalSchema.parse({
      schemaVersion: PROJECT_BRAIN_INTENT_QUEUE_VERSION,
      operation: "ENQUEUE",
      commandId,
    })));
    const stored = await writeIntent(store, intent);
    await writeIndex(store, [...index.commandIds, commandId]);
    await store.deleteItemAsync(JOURNAL_KEY);
    return stored;
  });
}

function sourceCommandWithoutExpectedStateVersion(value: ProjectBrainSourceAttempt["command"]) {
  const { expectedStateVersion: _expectedStateVersion, ...body } = value;
  return body;
}

export async function replaceReadyProjectBrainSourceIntent(input: {
  expected: ProjectBrainSourceAttempt;
  replacement: ProjectBrainSourceAttempt;
  store?: SecureProjectBrainIntentStore;
}) {
  return withIntentStoreLock(async () => {
    const store = input.store ?? await defaultStore();
    const expected = sourceIntent(input.expected);
    const replacement = sourceIntent(input.replacement);
    if (expected.kind !== "SOURCE" || replacement.kind !== "SOURCE") {
      throw new Error("MOBILE_PROJECT_BRAIN_INTENT_KIND_MISMATCH");
    }
    const commandId = expected.attempt.command.commandId;
    if (
      expected.attempt.state !== "READY"
      || replacement.attempt.state !== "READY"
      || replacement.attempt.command.commandId !== commandId
      || JSON.stringify(sourceCommandWithoutExpectedStateVersion(expected.attempt.command))
        !== JSON.stringify(sourceCommandWithoutExpectedStateVersion(replacement.attempt.command))
    ) {
      throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_REPLACE_BODY_REFUSED");
    }
    const index = await readIndex(store);
    if (!index.commandIds.includes(commandId)) throw new Error("MOBILE_PROJECT_BRAIN_INTENT_MISSING");
    const existing = await readIntent(store, commandId);
    if (
      existing.kind !== "SOURCE"
      || existing.attempt.state !== "READY"
      || JSON.stringify(existing.attempt.command) !== JSON.stringify(expected.attempt.command)
    ) {
      throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_REPLACE_CONFLICT");
    }
    const stored = await writeIntent(store, replacement);
    if (stored.kind !== "SOURCE") throw new Error("MOBILE_PROJECT_BRAIN_INTENT_KIND_MISMATCH");
    return stored.attempt;
  });
}

const ALLOWED_TRANSITIONS: Record<ProjectBrainIntentState, readonly ProjectBrainIntentState[]> = {
  READY: ["SENDING", "REFUSED"],
  SENDING: ["CONFIRMED", "REPLAYED", "CONFLICT", "OUTCOME_UNKNOWN", "REFUSED"],
  OUTCOME_UNKNOWN: ["SENDING", "REFUSED"],
  CONFIRMED: [],
  REPLAYED: [],
  CONFLICT: [],
  REFUSED: [],
};

async function transitionProjectBrainIntentUnlocked(input: {
  commandId: string;
  state: ProjectBrainIntentState;
  result?: MobileProjectBrainCommandResult | null;
  publicError?: string | null;
  store?: SecureProjectBrainIntentStore;
}) {
  const store = input.store ?? await defaultStore();
  const existing = await readIntent(store, input.commandId);
  if (existing.attempt.state === input.state) return existing;
  if (!ALLOWED_TRANSITIONS[existing.attempt.state].includes(input.state)) {
    throw new Error("MOBILE_PROJECT_BRAIN_INTENT_TRANSITION_REFUSED");
  }
  if (existing.kind === "COMMAND") {
    return writeIntent(store, {
      schemaVersion: PROJECT_BRAIN_INTENT_QUEUE_VERSION,
      kind: "COMMAND",
      attempt: {
        ...existing.attempt,
        state: input.state,
        result: input.result ?? null,
        publicError: input.publicError ?? null,
      },
    });
  }
  return writeIntent(store, {
    schemaVersion: PROJECT_BRAIN_INTENT_QUEUE_VERSION,
    kind: "SOURCE",
    attempt: {
      ...existing.attempt,
      state: input.state,
      result: input.result ?? null,
      publicError: input.publicError ?? null,
    },
  });
}

export async function transitionProjectBrainIntent(input: {
  commandId: string;
  state: ProjectBrainIntentState;
  result?: MobileProjectBrainCommandResult | null;
  publicError?: string | null;
  store?: SecureProjectBrainIntentStore;
}) {
  return withIntentStoreLock(() => transitionProjectBrainIntentUnlocked(input));
}

async function loadProjectBrainIntentSnapshotUnlocked(input: {
  workspaceId: string;
  projectId: string;
  interruptedPublicError: string;
  store?: SecureProjectBrainIntentStore;
}) {
  const store = input.store ?? await defaultStore();
  const index = await readIndex(store);
  const allIntents: StoredProjectBrainIntent[] = [];
  for (const commandId of index.commandIds) {
    let intent = await readIntent(store, commandId);
    if (
      intent.kind === "COMMAND"
      && (intent.attempt.state === "CONFIRMED" || intent.attempt.state === "REPLAYED")
      && intent.attempt.result
    ) {
      await removeProjectBrainIntentUnlocked({ commandId, store });
      continue;
    }
    if (intent.attempt.state === "SENDING") {
      intent = await transitionProjectBrainIntentUnlocked({
        commandId,
        state: "OUTCOME_UNKNOWN",
        publicError: input.interruptedPublicError,
        store,
      });
    }
    allIntents.push(intent);
  }
  return Object.freeze({
    allIntents,
    contextIntents: allIntents.filter((intent) =>
      intent.attempt.command.workspaceId === input.workspaceId
      && intent.attempt.command.projectId === input.projectId),
  });
}

export async function loadProjectBrainIntentSnapshot(input: {
  workspaceId: string;
  projectId: string;
  interruptedPublicError: string;
  store?: SecureProjectBrainIntentStore;
}) {
  return withIntentStoreLock(() => loadProjectBrainIntentSnapshotUnlocked(input));
}

export async function loadProjectBrainIntents(input: {
  workspaceId: string;
  projectId: string;
  interruptedPublicError: string;
  store?: SecureProjectBrainIntentStore;
}) {
  return (await loadProjectBrainIntentSnapshot(input)).contextIntents;
}

async function removeProjectBrainIntentUnlocked(input: {
  commandId: string;
  store?: SecureProjectBrainIntentStore;
}) {
  const store = input.store ?? await defaultStore();
  const index = await readIndex(store);
  if (!index.commandIds.includes(input.commandId)) return false;
  await writeIndex(store, index.commandIds.filter((commandId) => commandId !== input.commandId));
  await deleteProjectBrainIntentEntry(store, input.commandId);
  return true;
}

export async function removeProjectBrainIntent(input: {
  commandId: string;
  store?: SecureProjectBrainIntentStore;
}) {
  return withIntentStoreLock(() => removeProjectBrainIntentUnlocked(input));
}

async function deleteManifestAndChunks(
  store: SecureProjectBrainIntentStore,
  manifest: string,
  chunkForIndex: (index: number) => string,
  scanWhenManifestMissing: boolean,
) {
  const rawManifest = await store.getItemAsync(manifest);
  let chunkCount = scanWhenManifestMissing ? PROJECT_BRAIN_INTENT_MAX_CHUNKS : 0;
  if (rawManifest) {
    try {
      chunkCount = entryManifestSchema.parse(JSON.parse(rawManifest)).chunkCount;
    } catch {
      throw new Error("MOBILE_PROJECT_BRAIN_INTENT_MANIFEST_CORRUPT");
    }
  }
  await store.deleteItemAsync(manifest);
  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    await store.deleteItemAsync(chunkForIndex(chunk));
  }
}

async function deleteProjectBrainIntentEntry(
  store: SecureProjectBrainIntentStore,
  commandId: string,
  scanWhenManifestMissing = false,
) {
  await store.deleteItemAsync(pointerKey(commandId));
  await deleteManifestAndChunks(
    store,
    generationManifestKey(commandId, "A"),
    (index) => generationChunkKey(commandId, "A", index),
    scanWhenManifestMissing,
  );
  await deleteManifestAndChunks(
    store,
    generationManifestKey(commandId, "B"),
    (index) => generationChunkKey(commandId, "B", index),
    scanWhenManifestMissing,
  );
  await deleteManifestAndChunks(
    store,
    legacyManifestKey(commandId),
    (index) => legacyChunkKey(commandId, index),
    scanWhenManifestMissing,
  );
}

export async function clearProjectBrainIntents(inputStore?: SecureProjectBrainIntentStore) {
  return withIntentStoreLock(async () => {
    const store = inputStore ?? await defaultStore();
    const index = await readIndex(store);
    await store.deleteItemAsync(INDEX_KEY);
    for (const commandId of index.commandIds) {
      await deleteProjectBrainIntentEntry(store, commandId);
    }
  });
}

export async function hasProjectBrainIntents(inputStore?: SecureProjectBrainIntentStore) {
  return withIntentStoreLock(async () => {
    const store = inputStore ?? await defaultStore();
    return (await readIndex(store)).commandIds.length > 0;
  });
}

export function commandIntent(value: ProjectBrainCommandAttempt): StoredProjectBrainIntent {
  return parseFrozenIntent({
    schemaVersion: PROJECT_BRAIN_INTENT_QUEUE_VERSION,
    kind: "COMMAND",
    attempt: value,
  });
}

export function sourceIntent(value: ProjectBrainSourceAttempt): StoredProjectBrainIntent {
  return parseFrozenIntent({
    schemaVersion: PROJECT_BRAIN_INTENT_QUEUE_VERSION,
    kind: "SOURCE",
    attempt: value,
  });
}
