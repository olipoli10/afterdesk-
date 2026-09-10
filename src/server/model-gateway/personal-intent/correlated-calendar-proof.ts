import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../evidence";
import { personalCalendarDraftSchema } from "@/server/personal-assistant/calendar-draft-contract";
import type { DurableSmsTemporalCorrelationInput } from "@/server/personal-assistant/sms-temporal-clarification";
import { inspectCorrelatedPersonalReceiptProof, PERSONAL_CORRELATED_RECEIPT_PROOF_VERSION } from "./correlated-receipt-proof";
import { personalCorrelatedCalendarRequestId } from "./correlated-calendar-id";

export const PERSONAL_CORRELATED_CALENDAR_PROOF_VERSION = "personal-sms-correlated-calendar-reference-v1";
export const PERSONAL_CORRELATED_CALENDAR_PROOF_MAX_BYTES = 16384;
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.object({
  version: z.literal(PERSONAL_CORRELATED_CALENDAR_PROOF_VERSION),
  inspectedReceiptProofHash: hex, receiptProofVersion: z.literal(PERSONAL_CORRELATED_RECEIPT_PROOF_VERSION),
  draft: personalCalendarDraftSchema, titleNormalization: z.literal("EXISTING_SCHEMA_TRIM_ONLY"),
  executionAuthorized: z.literal(false), semanticInterpretationVerified: z.literal(false),
  sourceAuthority: z.literal("NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT"),
}).strict();
export type CorrelatedCalendarReferenceProof = z.infer<typeof schema>;
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

/** Reject non-JSON objects/accessors/cycles and excessive shape before canonical
 * serialization. PostgreSQL JSONB cannot retain NUL or lone UTF-16 surrogates. */
function boundedJson(value: unknown): string {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 4096 || depth > 12) throw new Error("CORRELATED_CALENDAR_PROOF_BOUND_EXCEEDED");
    if (typeof item === "string") {
      if (item.length > PERSONAL_CORRELATED_CALENDAR_PROOF_MAX_BYTES || item.includes("\0") || Buffer.from(item, "utf8").toString("utf8") !== item)
        throw new Error("CORRELATED_CALENDAR_PROOF_STRING_INVALID");
      return;
    }
    if (item === null || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return;
    if (!item || typeof item !== "object" || (Array.isArray(item) ? Object.getPrototypeOf(item) !== Array.prototype
      : ![Object.prototype, null].includes(Object.getPrototypeOf(item)))
      || ancestors.has(item)) throw new Error("CORRELATED_CALENDAR_PROOF_JSON_REQUIRED");
    ancestors.add(item);
    const array = Array.isArray(item), keys = Reflect.ownKeys(item);
    // Sparse arrays have few enumerable keys but canonicalJson would still map
    // their entire length. Check dense bounded length before serialization.
    if (array && (item.length > 64 || keys.length !== item.length + 1)
      || keys.length > (array ? 65 : 64)) throw new Error("CORRELATED_CALENDAR_PROOF_BOUND_EXCEEDED");
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (array && key === "length") continue;
      if (typeof key !== "string" || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")
        || array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length)) throw new Error("CORRELATED_CALENDAR_PROOF_JSON_REQUIRED");
      visit(key, depth + 1); visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
  };
  visit(value, 0);
  const bytes = canonicalJson(value);
  if (Buffer.byteLength(bytes, "utf8") > PERSONAL_CORRELATED_CALENDAR_PROOF_MAX_BYTES) throw new Error("CORRELATED_CALENDAR_PROOF_BOUND_EXCEEDED");
  return bytes;
}

/** Structure/hash validation only. Even a freshly rehashed envelope is NOT
 * authenticated evidence; future DB projection must reconstruct it from receipt. */
export function inspectCorrelatedCalendarReferenceProof(untrusted: unknown, expectedHash: unknown) {
  const before = boundedJson(untrusted), parsed = schema.parse(untrusted);
  if (before !== canonicalJson(parsed) || sha(before) !== hex.parse(expectedHash)) throw new Error("CORRELATED_CALENDAR_REFERENCE_CHANGED");
  if (Date.parse(parsed.draft.startsAt) >= Date.parse(parsed.draft.endsAt)) throw new Error("CORRELATED_CALENDAR_REFERENCE_BINDING_CHANGED");
  return freeze({ status: "CORRELATED_CALENDAR_REFERENCE_INSPECTED_NOT_AUTHORIZED" as const,
    proof: parsed, proofHash: sha(before), executionAuthorized: false as const, persistencePerformed: false as const });
}

/** Calls the real durable receipt inspector, then projects references only.
 * Input facts still need the existing authenticated DB loader. No draft exists;
 * `proof.draft` is a pure proposed value, not a calendar operation or permission. */
export function buildCorrelatedCalendarReferenceProof(input: DurableSmsTemporalCorrelationInput, stored: { packet: unknown; packetHash: string }) {
  const snapshot = structuredClone(input), packet = structuredClone(stored);
  const inspected = inspectCorrelatedPersonalReceiptProof(snapshot, packet), r = inspected.resolution;
  const value = {
    version: PERSONAL_CORRELATED_CALENDAR_PROOF_VERSION,
    inspectedReceiptProofHash: inspected.proofHash, receiptProofVersion: inspected.version,
    draft: personalCalendarDraftSchema.parse({ title: r.citations.title.quote, startsAt: r.startsAtUtc, endsAt: r.endsAtUtc, timezone: r.timezone }),
    titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", executionAuthorized: false, semanticInterpretationVerified: false,
    sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT",
  };
  const checked = inspectCorrelatedCalendarReferenceProof(value, sha(canonicalJson(value)));
  return freeze({ ...checked, receiptId: inspected.subject.receiptId, packetHash: inspected.packetHash,
    requestId: personalCorrelatedCalendarRequestId(inspected.subject.receiptId), calendarOperationId: null,
    providerExecutionPerformed: false as const, approvalAvailable: false as const });
}
