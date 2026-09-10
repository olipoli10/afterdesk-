import { z } from "zod";
import type { SecureOutboxStore } from "./outbox";
import { correlatedApprovalId, correlatedApprovalUnicode, personalCorrelatedCalendarApprovalCommandSchema, parsePersonalCorrelatedCalendarApprovalResult,
  snapshotCorrelatedApprovalJson, type PersonalCorrelatedCalendarApprovalCommand } from "./personal-correlated-calendar-approval";

export const CORRELATED_APPROVAL_ATTEMPT_MAX_BYTES = 2000;
export const CORRELATED_APPROVAL_ATTEMPT_MAX_COUNT = 20;
const originSchema = z.string().min(1).max(240).refine(value => {
  try { const url = new URL(value); return correlatedApprovalUnicode(value) && ["http:", "https:"].includes(url.protocol) && url.origin === value; } catch { return false; }
});
const markerSchema = personalCorrelatedCalendarApprovalCommandSchema.extend({ fingerprintVersion: z.literal("personal-correlated-calendar-approval-view-v1"),
  state: z.literal("ATTEMPT_RESERVED") }).strict();
const blobSchema = z.object({ version: z.literal("personal-correlated-calendar-attempts-v1"), ownerId: correlatedApprovalId, apiOrigin: originSchema,
  entries: z.array(markerSchema).max(CORRELATED_APPROVAL_ATTEMPT_MAX_COUNT) }).strict().refine(value => new Set(value.entries.map(e => JSON.stringify([e.workspaceId, e.reviewId]))).size === value.entries.length);
export type CorrelatedCalendarAttemptMarker = Readonly<z.infer<typeof markerSchema>>;
const tails = new Map<string, Promise<unknown>>(), pendingCounts = new Map<string, number>();
const attempted = new Map<string, { ids: Set<string>; saturated: boolean }>();
let scopeOverflow = false;
function memoryFor(key: string) {
  let state = attempted.get(key);
  if (!state && attempted.size < 20) { state = { ids: new Set(), saturated: false }; attempted.set(key, state); }
  else if (!state) scopeOverflow = true;
  return state;
}
const hex = (value: string) => [...new TextEncoder().encode(value)].map(n => n.toString(16).padStart(2, "0")).join("");
export function correlatedCalendarAttemptStorageKey(owner: string, apiOrigin: string) {
  return `endvera.correlated.attempts.v1.${hex(originSchema.parse(apiOrigin))}.${hex(correlatedApprovalId.parse(owner))}`;
}
type Guard = { signal: AbortSignal; isCurrent: () => boolean };
const requireCurrent = (guard: Guard) => { if (guard.signal.aborted || !guard.isCurrent()) throw new Error("CORRELATED_ATTEMPT_SCOPE_CHANGED"); };
/** One serialized foreground JS runtime only, not a cross-process storage CAS.
 * Metadata is never a send queue, authorization, or proof a request left the app. */
export function createCorrelatedCalendarApprovalAttempts(input: { ownerId: string; apiOrigin: string; store?: SecureOutboxStore }) {
  const ownerId = correlatedApprovalId.parse(input.ownerId), apiOrigin = originSchema.parse(input.apiOrigin), store = input.store;
  const key = correlatedCalendarAttemptStorageKey(ownerId, apiOrigin);
  const identity = (workspaceId: string, reviewId: string) => JSON.stringify([correlatedApprovalId.parse(workspaceId), correlatedApprovalId.parse(reviewId)]);
  function serialize<T>(run: () => Promise<T>) {
    const count = pendingCounts.get(key) ?? 0;
    if (count >= 20 || !pendingCounts.has(key) && pendingCounts.size >= 20) return Promise.reject(new Error("CORRELATED_ATTEMPT_CAPACITY"));
    pendingCounts.set(key, count + 1);
    const task = (tails.get(key) ?? Promise.resolve()).then(run, run), tail = task.catch(() => undefined); tails.set(key, tail);
    void tail.finally(() => { const left = (pendingCounts.get(key) ?? 1) - 1; if (left) pendingCounts.set(key, left); else pendingCounts.delete(key);
      if (tails.get(key) === tail) tails.delete(key); }); return task;
  }
  async function target() { return store ?? await import("expo-secure-store"); }
  function decode(raw: string | null) {
    const empty = { version: "personal-correlated-calendar-attempts-v1", ownerId, apiOrigin, entries: [] };
    if (raw !== null && (typeof raw !== "string" || raw.length > CORRELATED_APPROVAL_ATTEMPT_MAX_BYTES
      || new TextEncoder().encode(raw).length > CORRELATED_APPROVAL_ATTEMPT_MAX_BYTES)) throw new Error("CORRELATED_ATTEMPT_STORAGE_INVALID");
    const value = blobSchema.parse(snapshotCorrelatedApprovalJson(raw === null ? empty : JSON.parse(raw)));
    if (value.ownerId !== ownerId || value.apiOrigin !== apiOrigin) throw new Error("CORRELATED_ATTEMPT_STORAGE_SCOPE");
    const memory = memoryFor(key);
    value.entries.forEach(e => { const id = identity(e.workspaceId, e.reviewId); if (memory && !memory.ids.has(id)) {
      if (memory.ids.size >= 20) memory.saturated = true; else memory.ids.add(id);
    } });
    return value;
  }
  function encode(value: unknown) { const raw = JSON.stringify(blobSchema.parse(value));
    if (new TextEncoder().encode(raw).length > CORRELATED_APPROVAL_ATTEMPT_MAX_BYTES) throw new Error("CORRELATED_ATTEMPT_CAPACITY"); return raw; }
  function frozen(entries: z.infer<typeof markerSchema>[]) { return Object.freeze(entries.map(e => Object.freeze({ ...e }))); }
  return Object.freeze({
    has(workspaceId: string, reviewId: string) { const memory = attempted.get(key); return scopeOverflow || memory?.saturated === true || memory?.ids.has(identity(workspaceId, reviewId)) === true; },
    load() { return serialize(async () => { const storage = await target(); return frozen(decode(await storage.getItemAsync(key)).entries); }); },
    reserve(raw: PersonalCorrelatedCalendarApprovalCommand, supplied: Guard) {
      const command = personalCorrelatedCalendarApprovalCommandSchema.parse(snapshotCorrelatedApprovalJson(raw));
      const guard = { signal: supplied.signal, isCurrent: supplied.isCurrent }, id = identity(command.workspaceId, command.reviewId);
      requireCurrent(guard);
      const memory = memoryFor(key);
      if (scopeOverflow || !memory || memory.saturated || memory.ids.size >= 20) { if (memory) memory.saturated = true; return Promise.reject(new Error("CORRELATED_ATTEMPT_CAPACITY")); }
      if (memory.ids.has(id)) return Promise.reject(new Error("CORRELATED_ATTEMPT_ALREADY_RESERVED"));
      // Synchronous, before any await. Errors never erase this conservative latch.
      memory.ids.add(id);
      return serialize(async () => {
        requireCurrent(guard); const storage = await target(); requireCurrent(guard);
        const value = decode(await storage.getItemAsync(key)); requireCurrent(guard);
        if (value.entries.some(e => identity(e.workspaceId, e.reviewId) === id)) throw new Error("CORRELATED_ATTEMPT_ALREADY_RESERVED");
        if (value.entries.length >= CORRELATED_APPROVAL_ATTEMPT_MAX_COUNT) throw new Error("CORRELATED_ATTEMPT_CAPACITY");
        const marker = markerSchema.parse({ ...command, fingerprintVersion: "personal-correlated-calendar-approval-view-v1", state: "ATTEMPT_RESERVED" });
        const encoded = encode({ ...value, entries: [...value.entries, marker] });
        requireCurrent(guard); await storage.setItemAsync(key, encoded);
        // Read-back even if scope disappeared after write: preserve the marker,
        // but never permit POST. No removal/rollback of a possibly reserved send.
        const readback = await storage.getItemAsync(key);
        if (readback !== encoded) throw new Error("CORRELATED_ATTEMPT_READBACK_CHANGED");
        decode(readback); requireCurrent(guard); return Object.freeze(marker);
      });
    },
    dismissConfirmed(rawResult: unknown, supplied: Guard) {
      const result = snapshotCorrelatedApprovalJson(rawResult) as { workspaceId?: unknown; reviewId?: unknown };
      const workspaceId = correlatedApprovalId.parse(result?.workspaceId), reviewId = correlatedApprovalId.parse(result?.reviewId);
      const exact = parsePersonalCorrelatedCalendarApprovalResult(result, workspaceId, reviewId), guard = { signal: supplied.signal, isCurrent: supplied.isCurrent };
      if (exact.outcome !== "CONFIRMED") return Promise.reject(new Error("CORRELATED_ATTEMPT_NOT_TERMINAL"));
      return serialize(async () => { requireCurrent(guard); const storage = await target(); requireCurrent(guard);
        const value = decode(await storage.getItemAsync(key)); requireCurrent(guard);
        const encoded = encode({ ...value, entries: value.entries.filter(e => e.workspaceId !== workspaceId || e.reviewId !== reviewId) });
        requireCurrent(guard); await storage.setItemAsync(key, encoded); const readback = await storage.getItemAsync(key);
        if (readback !== encoded) throw new Error("CORRELATED_ATTEMPT_READBACK_CHANGED");
        requireCurrent(guard); return frozen(decode(readback).entries);
      });
    },
  });
}
