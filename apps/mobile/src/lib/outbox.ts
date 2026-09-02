import { z } from "zod";
import { mobileAssistantRequestSchema } from "@/lib/assistant";
import { mobileCommandSchema } from "@/lib/commands";
import { mobilePreparedActionDecisionCommandSchema } from "@/lib/prepared-actions";
import { mobileRevokePermissionCommandSchema } from "@/lib/permissions";
import { mobileJobCommandSchema } from "@/lib/jobs";
import { mobileFollowUpCommandSchema } from "@/lib/follow-ups";
import { mobileEconomicCommandSchema } from "@/lib/invoices";
import { mobileHumanEscalationCommandSchema } from "@/lib/human-escalations";
import { mobileCalendarConnectorCommandSchema } from "@/lib/calendar-connectors";
import { mobileMessagingCommandSchema } from "@/lib/messages";
import { mobilePrepareCallWorkCommandSchema } from "@/lib/voice-calls";
import { mobileEmailAccountCommandSchema, mobileEmailDraftCommandSchema } from "@/lib/email-inbox";
import { mobileAccountingAccountCommandSchema, mobileAccountingDraftCommandSchema } from "@/lib/accounting";
import {
  mobileAuthorityDecisionCommandSchema,
  mobileAuthorityEvaluateCommandSchema,
  mobileAuthorityPolicyCommandSchema,
} from "@/lib/authority-policies";
import { mobilePrivacyCommandSchema } from "@/lib/privacy";

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
  z.object({ ...base, kind: z.literal("JOB_COMMAND"), command: mobileJobCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("FOLLOW_UP_COMMAND"), command: mobileFollowUpCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("ECONOMIC_COMMAND"), command: mobileEconomicCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("HUMAN_ESCALATION_COMMAND"), command: mobileHumanEscalationCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("CALENDAR_CONNECTOR_COMMAND"), command: mobileCalendarConnectorCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("MESSAGING_COMMAND"), command: mobileMessagingCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("VOICE_CALL_COMMAND"), command: mobilePrepareCallWorkCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("EMAIL_ACCOUNT_COMMAND"), command: mobileEmailAccountCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("EMAIL_DRAFT_COMMAND"), command: mobileEmailDraftCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("ACCOUNTING_ACCOUNT_COMMAND"), command: mobileAccountingAccountCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("ACCOUNTING_DRAFT_COMMAND"), command: mobileAccountingDraftCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("AUTHORITY_POLICY_COMMAND"), command: mobileAuthorityPolicyCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("AUTHORITY_EVALUATE"), command: mobileAuthorityEvaluateCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("AUTHORITY_DECIDE"), command: mobileAuthorityDecisionCommandSchema }).strict(),
  z.object({ ...base, kind: z.literal("PRIVACY_COMMAND"), command: mobilePrivacyCommandSchema }).strict(),
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
  if (kind === "JOB_COMMAND") {
    const parsed = mobileJobCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "FOLLOW_UP_COMMAND") {
    const parsed = mobileFollowUpCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "ECONOMIC_COMMAND") {
    const parsed = mobileEconomicCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "HUMAN_ESCALATION_COMMAND") {
    const parsed = mobileHumanEscalationCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "CALENDAR_CONNECTOR_COMMAND") {
    const parsed = mobileCalendarConnectorCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "MESSAGING_COMMAND") {
    const parsed = mobileMessagingCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "VOICE_CALL_COMMAND") {
    const parsed = mobilePrepareCallWorkCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "EMAIL_ACCOUNT_COMMAND") {
    const parsed = mobileEmailAccountCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "EMAIL_DRAFT_COMMAND") {
    const parsed = mobileEmailDraftCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "ACCOUNTING_ACCOUNT_COMMAND") {
    const parsed = mobileAccountingAccountCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "ACCOUNTING_DRAFT_COMMAND") {
    const parsed = mobileAccountingDraftCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "AUTHORITY_POLICY_COMMAND") {
    const parsed = mobileAuthorityPolicyCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "AUTHORITY_EVALUATE") {
    const parsed = mobileAuthorityEvaluateCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "AUTHORITY_DECIDE") {
    const parsed = mobileAuthorityDecisionCommandSchema.parse(command);
    return { entryId: parsed.commandId, workspaceId: parsed.workspaceId, command: parsed };
  }
  if (kind === "PRIVACY_COMMAND") {
    const parsed = mobilePrivacyCommandSchema.parse(command);
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
  if (entry.kind === "JOB_COMMAND") return "Décision d’horaire";
  if (entry.kind === "FOLLOW_UP_COMMAND") return "Décision de suivi";
  if (entry.kind === "ECONOMIC_COMMAND") return "Décision de facturation";
  if (entry.kind === "HUMAN_ESCALATION_COMMAND") return "Décision d’appui humain";
  if (entry.kind === "CALENDAR_CONNECTOR_COMMAND") return "Décision de calendrier";
  if (entry.kind === "MESSAGING_COMMAND") return "Décision de messagerie";
  if (entry.kind === "VOICE_CALL_COMMAND") return "Préparation d’un appel";
  if (entry.kind === "EMAIL_ACCOUNT_COMMAND") return "Accès courriel local";
  if (entry.kind === "EMAIL_DRAFT_COMMAND") return "Brouillon courriel";
  if (entry.kind === "ACCOUNTING_ACCOUNT_COMMAND") return "Accès comptable local";
  if (entry.kind === "ACCOUNTING_DRAFT_COMMAND") return "Opération comptable préparée";
  if (entry.kind === "AUTHORITY_POLICY_COMMAND") return "Politique d’autorité";
  if (entry.kind === "AUTHORITY_EVALUATE") return "Évaluation d’autorité";
  if (entry.kind === "AUTHORITY_DECIDE") return "Décision d’autorité";
  if (entry.kind === "PRIVACY_COMMAND") return "Décision de confidentialité";
  if (entry.command.type === "RECORD_RECEIVABLE") return "Compte à recevoir";
  if (entry.command.type === "RECORD_PAYMENT") return "Paiement reçu";
  return "Suivi planifié";
}
