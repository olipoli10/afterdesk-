import "server-only";
import { createHash } from "node:crypto";
import { inspectCorrelatedPersonalTemporalEvidence, type CorrelatedPersonalTemporalEvidenceInput, type CorrelatedPersonalTemporalEvidence } from "./correlated-temporal-evidence";
import { createPersonalIntentInput } from "./contract";
import { resolvePersonalCalendarTemporalClarifiedSlot } from "./temporal";

export const PERSONAL_CORRELATED_TEMPORAL_RESOLUTION_VERSION = "personal-correlated-temporal-resolution-v1";
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)])) : value;
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

/** Re-inspects two real source packets. This is deterministic calculation only:
 * no draft, approval, persisted consumption, provider call or model invocation. */
export function resolveCorrelatedPersonalCalendarTemporal(input: CorrelatedPersonalTemporalEvidenceInput) {
  const evidence = inspectCorrelatedPersonalTemporalEvidence(input);
  return resolveInspectedPersonalTemporalEvidence(evidence, input.waiting.prepared.rawProposal);
}

/** Internal phase-independent calculation, shared by live and durable receipt
 * inspectors. Its input is evidence, never execution authority. */
export function resolveInspectedPersonalTemporalEvidence(evidence: CorrelatedPersonalTemporalEvidence, raw: string) {
  if (evidence.status === "INSUFFICIENT_ORIGINAL_TEMPLATE") return evidence;
  const original = evidence.correlation.sources[0];
  if (createHash("sha256").update(raw).digest("hex") !== evidence.proposalHash) throw new Error("PERSONAL_CORRELATED_PROPOSAL_CHANGED");
  const temporal = resolvePersonalCalendarTemporalClarifiedSlot(createPersonalIntentInput(original.operationId, original.body), raw, evidence.actionId,
    { receivedAt: evidence.anchorReceivedAt, timezone: evidence.timezone }, { slot: evidence.slot, ...evidence.correlation.explicitReplyTime });
  const base = { schemaVersion: 1 as const, version: PERSONAL_CORRELATED_TEMPORAL_RESOLUTION_VERSION,
    evidence, executionAuthorized: false as const, providerExecutionPerformed: false as const,
    persistencePerformed: false as const, preview: null,
    sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" as const };
  if (temporal.status === "CLARIFY") return freeze({ ...base, status: "CLARIFY" as const,
    reason: temporal.reason, question: temporal.question, temporalResolutionPerformed: false as const });
  const value = { ...base, status: "RESOLVED_NOT_AUTHORIZED" as const, temporalResolutionPerformed: true as const,
    startsAtUtc: temporal.startsAtUtc, endsAtUtc: temporal.endsAtUtc, timezone: temporal.timezone,
    anchorReceivedAt: temporal.anchorReceivedAt, grammarVersion: temporal.grammarVersion,
    actionId: evidence.actionId, sources: evidence.correlation.sources, citations: evidence.citations,
  };
  return freeze({ ...value, resolutionHash: createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex") });
}
export type CorrelatedPersonalTemporalResolution = ReturnType<typeof resolveCorrelatedPersonalCalendarTemporal>;
