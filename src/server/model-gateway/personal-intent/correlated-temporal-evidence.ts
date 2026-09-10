import "server-only";
import { createHash } from "node:crypto";
import { correlateSmsTemporalClarification, type PreparedSmsTemporalClarification } from "@/server/personal-assistant/sms-temporal-clarification";
import { createPersonalIntentInput, inspectPersonalIntentCandidate } from "./contract";
import { classifyPersonalCalendarTemporalSlot, resolvePersonalCalendarTemporal } from "./temporal";

export const PERSONAL_CORRELATED_TEMPORAL_EVIDENCE_VERSION = "personal-correlated-temporal-evidence-v1";
export type CorrelatedPersonalTemporalEvidenceInput = Parameters<typeof correlateSmsTemporalClarification>[0];
const normalize = (text: string) => text.trim().toLowerCase().replace(/’/g, "'").replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ");
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)])) : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

/** Pure, two-source evidence inspection. This never authenticates the asserted
 * DB state, consumes a source, resolves dates, prepares an event or calls a model.
 * Invalid provenance/current state throws through the canonical pure correlator.
 * Well-bound but incomplete/unsafe templates return a closed refusal reason. */
export function inspectCorrelatedPersonalTemporalEvidence(input: CorrelatedPersonalTemporalEvidenceInput) {
  const correlation = correlateSmsTemporalClarification(input);
  return inspectPersonalTemporalCorrelationEvidence(correlation, input.waiting.prepared);
}

/** Shared internal pure calculation; callers must first inspect live or durable
 * correlation through its distinct strict boundary. This authenticates no DB. */
export function inspectPersonalTemporalCorrelationEvidence(correlation: ReturnType<typeof correlateSmsTemporalClarification>, prepared: PreparedSmsTemporalClarification) {
  // Use the newly parsed/frozen source packets, never caller-owned source objects.
  const [original, answer] = correlation.sources;
  const rawProposal = prepared.rawProposal;
  if (createHash("sha256").update(rawProposal).digest("hex") !== correlation.proposalHash) throw new Error("PERSONAL_CORRELATED_PROPOSAL_CHANGED");
  const originalInput = createPersonalIntentInput(original.operationId, original.body);
  const inspected = inspectPersonalIntentCandidate(rawProposal, originalInput);
  const temporal = resolvePersonalCalendarTemporal(originalInput, rawProposal, correlation.actionId,
    { receivedAt: correlation.anchorReceivedAt, timezone: correlation.timezone });
  const base = {
    schemaVersion: 1 as const, version: PERSONAL_CORRELATED_TEMPORAL_EVIDENCE_VERSION,
    executionAuthorized: false as const, providerExecutionPerformed: false as const,
    persistencePerformed: false as const, temporalResolutionPerformed: false as const,
    sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" as const, preview: null,
    correlation, correlationHash: hash(correlation), originalRequestFingerprint: originalInput.requestFingerprint,
    proposalHash: correlation.proposalHash, actionId: correlation.actionId,
    anchorReceivedAt: correlation.anchorReceivedAt, timezone: correlation.timezone,
  };
  const insufficient = (reason: "UNSAFE_SOURCE_CONTEXT" | "INCOMPLETE_ORIGINAL_TEMPLATE" | "UNSUPPORTED_SLOT_GRAMMAR" | "NON_UNIQUE_AMBIGUOUS_SLOT" | "TEMPORAL_QUESTION_CHANGED") =>
    freeze({ ...base, status: "INSUFFICIENT_ORIGINAL_TEMPLATE" as const, reason });
  if (hasUnsafePersonalTemporalSourceContext(original.body)) return insufficient("UNSAFE_SOURCE_CONTEXT");
  const action = inspected.proposal.actions[0];
  if (inspected.proposal.actions.length !== 1 || action.id !== correlation.actionId || action.dependsOn.length
    || action.kind !== "PREPARE_CALENDAR_EVENT") return insufficient("INCOMPLETE_ORIGINAL_TEMPLATE");
  if (temporal.status !== "CLARIFY" || temporal.reason !== "AMBIGUOUS_TIME" || correlation.reason !== "AMBIGUOUS_TIME") return insufficient("TEMPORAL_QUESTION_CHANGED");
  const context = { receivedAt: correlation.anchorReceivedAt, timezone: correlation.timezone };
  const start = classifyPersonalCalendarTemporalSlot(action.starts.quote, "START", context);
  const end = classifyPersonalCalendarTemporalSlot(action.ends.quote, "END", context);
  if (start === "UNSUPPORTED" || end === "UNSUPPORTED") return insufficient("UNSUPPORTED_SLOT_GRAMMAR");
  if ((start === "AMBIGUOUS") === (end === "AMBIGUOUS")) return insufficient("NON_UNIQUE_AMBIGUOUS_SLOT");
  const cite = (span: { start: number; end: number; quote: string }) => ({ sourceOperationId: original.operationId,
    requestHash: original.requestHash, ...span });
  const value = { ...base, status: "EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED" as const,
    slot: start === "AMBIGUOUS" ? "START" as const : "END" as const,
    citations: { title: cite(action.title), originalStart: cite(action.starts), originalEnd: cite(action.ends),
      answer: { sourceOperationId: answer.operationId, requestHash: answer.requestHash, start: 0, end: answer.body.length, quote: answer.body } },
    resolutionRequired: "EXISTING_CLOSED_TEMPORAL_PRIMITIVES_WITH_TWO_SOURCE_PROVENANCE" as const,
  };
  return freeze({ ...value, evidenceHash: hash(value) });
}
export type CorrelatedPersonalTemporalEvidence = ReturnType<typeof inspectCorrelatedPersonalTemporalEvidence>;
/** Existing closed lexical refusal predicate; not general-language comprehension. */
export function hasUnsafePersonalTemporalSourceContext(text: string): boolean {
  return /\b(?:ne|pas|jamais|non|sauf|annule|annuler|si|sinon|unless|except|not|never|cancel|cannot|puis|ensuite|avant|then|after|before|appelle|telephone|texte|envoie)\b|\b(?:do|does|did|is|are|was|were|wo|would|should|could|must|ca)n['’]t\b|\baprès\b(?!-midi\b)|\bn['’]/.test(normalize(text));
}
