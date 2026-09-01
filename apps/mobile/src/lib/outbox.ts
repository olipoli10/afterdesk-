import { z } from "zod";
import { mobileAssistantRequestSchema } from "@/lib/assistant";
import { mobileCommandSchema } from "@/lib/commands";
import { mobilePreparedActionDecisionCommandSchema } from "@/lib/prepared-actions";
import { mobileRevokePermissionCommandSchema } from "@/lib/permissions";

export const MOBILE_OUTBOX_VERSION = 1 as const;
export const MOBILE_OUTBOX_LIMIT = 20;
export const MOBILE_OUTBOX_ENTRY_MAX_BYTES = 8 * 1024;

export const mobileOutboxStateSchema = z.enum([
  "QUEUED",
  "SENDING",
  "CONFIRMED",
  "REPLAYED",
  "CONFLICT",
  "REFUSED",
  "OUTCOME_UNKNOWN",
]);

const base = {
  schemaVersion: z.literal(MOBILE_OUTBOX_VERSION),
  entryId: z.string().min(1).max(200),
  workspaceId: z.string().min(1).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  state: mobileOutboxStateSchema,
  publicError: z.string().max(500).nullable(),
  automaticDispatchAllowed: z.literal(false),
};

export const mobileOutboxEntrySchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("OPERATING_COMMAND"), command: mobileCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("ASSISTANT_REQUEST"), command: mobileAssistantRequestSchema }).strict(),
  z.object({ ...base, kind: z.literal("PREPARED_ACTION_DECISION"), command: mobilePreparedActionDecisionCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("PERMISSION_REVOCATION"), command: mobileRevokePermissionCommandSchema }).strict(),
]);

const indexSchema = z.object({
  schemaVersion: z.literal(MOBILE_OUTBOX_VERSION),
  entryIds: z.array(z.string().min(1).max(200)).max(MOBILE_OUTBOX_LIMIT),
}).strict();

export type MobileOutboxEntry = z.infer<typeof mobileOutboxEntrySchema>;
export type MobileOutboxKind = MobileOutboxEntry["kind"];
export type MobileOutboxState = z.infer<typeof mobileOutboxStateSchema>;

export type SecureOutboxStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

const INDEX_KEY = "endvera.mobile.outbox.v1.index";
const ENTRY_PREFIX = "endvera.mobile.outbox.v1.entry.";

async function defaultStore(): Promise<SecureOutboxStore> {
  return import("expo-secure-store");
}

function entryKey(entryId: string) {
  return `${ENTRY_PREFIX}${entryId}`;
}

function commandIdentity(kind: MobileOutboxKind, command: unknown) {
  if (kind === "OPERATING_COMMAND") {
    const parsed = mobileCommandSchema.parse(command);
    return { entryId: parsed.requestId, workspaceId: parsed.payload.workspaceId, command: parsed };
  }
  if (kind === "ASSISTANT_REQUEST") {
    const parsed = mobileAssistantRequestSchema.parse(command);
    return { entryId: parsed.requestId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "PREPARED_ACTION_DECISION") {
    const parsed = mobilePreparedActionDecisionCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  const parsed = mobileRevokePermissionCommandSchema.parse(command);
  return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
}

async function readIndex(store: SecureOutboxStore) {
  const raw = await store.getItemAsync(INDEX_KEY);
  if (!raw) return indexSchema.parse({ schemaVersion: MOBILE_OUTBOX_VERSION, entryIds: [] });
  try {
    return indexSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("MOBILE_OUTBOX_INDEX_CORRUPT");
  }
}

async function writeIndex(store: SecureOutboxStore, entryIds: string[]) {
  await store.setItemAsync(
    INDEX_KEY,
    JSON.stringify(indexSchema.parse({ schemaVersion: MOBILE_OUTBOX_VERSION, entryIds })),
  );
}

async function readEntry(store: SecureOutboxStore, entryId: string) {
  const raw = await store.getItemAsync(entryKey(entryId));
  if (!raw) throw new Error("MOBILE_OUTBOX_ENTRY_MISSING");
  try {
    return mobileOutboxEntrySchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("MOBILE_OUTBOX_ENTRY_CORRUPT");
  }
}

async function writeEntry(store: SecureOutboxStore, entry: MobileOutboxEntry) {
  const serialized = JSON.stringify(mobileOutboxEntrySchema.parse(entry));
  if (new TextEncoder().encode(serialized).byteLength > MOBILE_OUTBOX_ENTRY_MAX_BYTES) {
    throw new Error("MOBILE_OUTBOX_ENTRY_TOO_LARGE");
  }
  await store.setItemAsync(entryKey(entry.entryId), serialized);
}

export async function enqueueMobileOutbox(input: {
  kind: MobileOutboxKind;
  command: unknown;
  now?: Date;
  store?: SecureOutboxStore;
}) {
  const store = input.store ?? await defaultStore();
  const identity = commandIdentity(input.kind, input.command);
  const index = await readIndex(store);
  if (index.entryIds.includes(identity.entryId)) {
    const existing = await readEntry(store, identity.entryId);
    const requested = JSON.stringify(identity.command);
    if (
      existing.kind !== input.kind ||
      existing.workspaceId !== identity.workspaceId ||
      JSON.stringify(existing.command) !== requested
    ) {
      throw new Error("MOBILE_OUTBOX_IDEMPOTENCY_CONFLICT");
    }
    return existing;
  }
  if (index.entryIds.length >= MOBILE_OUTBOX_LIMIT) throw new Error("MOBILE_OUTBOX_FULL");
  const timestamp = (input.now ?? new Date()).toISOString();
  const entry = mobileOutboxEntrySchema.parse({
    schemaVersion: MOBILE_OUTBOX_VERSION,
    kind: input.kind,
    entryId: identity.entryId,
    workspaceId: identity.workspaceId,
    command: identity.command,
    createdAt: timestamp,
    updatedAt: timestamp,
    state: "QUEUED",
    publicError: null,
    automaticDispatchAllowed: false,
  });
  await writeEntry(store, entry);
  await writeIndex(store, [...index.entryIds, entry.entryId]);
  return entry;
}

const ALLOWED_TRANSITIONS: Record<MobileOutboxState, readonly MobileOutboxState[]> = {
  QUEUED: ["SENDING", "REFUSED"],
  SENDING: ["CONFIRMED", "REPLAYED", "CONFLICT", "REFUSED", "OUTCOME_UNKNOWN"],
  OUTCOME_UNKNOWN: ["SENDING", "REFUSED"],
  CONFIRMED: [],
  REPLAYED: [],
  CONFLICT: [],
  REFUSED: [],
};

export async function transitionMobileOutbox(input: {
  entryId: string;
  state: MobileOutboxState;
  publicError?: string | null;
  now?: Date;
  store?: SecureOutboxStore;
}) {
  const store = input.store ?? await defaultStore();
  const existing = await readEntry(store, input.entryId);
  if (existing.state === input.state) return existing;
  if (!ALLOWED_TRANSITIONS[existing.state].includes(input.state)) {
    throw new Error("MOBILE_OUTBOX_TRANSITION_REFUSED");
  }
  const updated = mobileOutboxEntrySchema.parse({
    ...existing,
    state: input.state,
    publicError: input.publicError ?? null,
    updatedAt: (input.now ?? new Date()).toISOString(),
  });
  await writeEntry(store, updated);
  return updated;
}

export async function loadMobileOutbox(input: {
  workspaceId: string;
  now?: Date;
  store?: SecureOutboxStore;
}) {
  const store = input.store ?? await defaultStore();
  const index = await readIndex(store);
  const entries: MobileOutboxEntry[] = [];
  for (const entryId of index.entryIds) {
    let entry = await readEntry(store, entryId);
    if (entry.state === "SENDING") {
      entry = await transitionMobileOutbox({
        entryId,
        state: "OUTCOME_UNKNOWN",
        publicError: "L’application a redémarré pendant l’envoi. Réessaie exactement cette commande.",
        now: input.now,
        store,
      });
    }
    if (entry.workspaceId === input.workspaceId) entries.push(entry);
  }
  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.entryId.localeCompare(b.entryId));
}

export async function discardMobileOutboxEntry(input: {
  entryId: string;
  store?: SecureOutboxStore;
}) {
  const store = input.store ?? await defaultStore();
  const index = await readIndex(store);
  if (!index.entryIds.includes(input.entryId)) return false;
  await store.deleteItemAsync(entryKey(input.entryId));
  await writeIndex(store, index.entryIds.filter((entryId) => entryId !== input.entryId));
  return true;
}

export async function clearMobileOutbox(inputStore?: SecureOutboxStore) {
  const store = inputStore ?? await defaultStore();
  const index = await readIndex(store);
  for (const entryId of index.entryIds) await store.deleteItemAsync(entryKey(entryId));
  await store.deleteItemAsync(INDEX_KEY);
}

export function mobileOutboxLabel(entry: MobileOutboxEntry) {
  if (entry.kind === "ASSISTANT_REQUEST") return "Commande à l’assistant";
  if (entry.kind === "PREPARED_ACTION_DECISION") return "Décision sur une action préparée";
  if (entry.kind === "PERMISSION_REVOCATION") return "Révocation locale";
  if (entry.command.type === "RECORD_RECEIVABLE") return "Compte à recevoir";
  if (entry.command.type === "RECORD_PAYMENT") return "Paiement reçu";
  return "Suivi planifié";
}
