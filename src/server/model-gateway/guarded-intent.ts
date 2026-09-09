import "server-only";
import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { assistantRoutingRequestSchema } from "@/lib/construction-operating-assistant-r36a/contracts";
import { prepareAssistantRoutingDecision } from "./assistant-routing";

/** PURE INSPECTION ONLY. No authenticated repository is connected to this module.
 * Caller snapshots can be stale or forged. Successful inspection NEVER emits an
 * authorized preview or permission. A future authenticated store-reloading wrapper
 * must authorize separately immediately before ANY user-visible preview or action.
 * Nothing here installs or calls a candidate model. No endpoint/config is accepted.
 */
export const GUARDED_INTENT_LIMITS = Object.freeze({
  sourceCodeUnits: 64_000, sourceBytes: 256_000, segmentCodeUnits: 4_000,
  proposalBytes: 64_000, actions: 10, recipients: 10, totalWorkUnits: 10,
});
const operations = ["READ_CONTACT", "READ_CALENDAR", "READ_TASK", "DRAFT_MESSAGE", "PREPARE_EVENT", "PREPARE_TASK", "PREPARE_NOTE"] as const;
const id = z.string().min(1).max(191);
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const role = z.enum(["OWNER", "MANAGER", "FIELD_WORKER", "VIEWER"]);
const kind = z.enum(["CONTACT", "EVENT", "TASK", "PROJECT"]);
const operation = z.enum(operations);
const evidenceSchema = z.object({
  id, workspaceId: id, kind: z.enum(["SERVER_RECORD", "USER_INPUT", "PUBLIC_SOURCE"]),
  observedAt: z.string().datetime({ offset: true }), contentFingerprint: hash,
  classification: z.enum(["OPERATIONAL", "FINANCIAL"]), allowedRoles: z.array(role).max(4),
}).strict();
const contextSchema = z.object({
  workspaceId: id, actorId: id, role, permissionRevision: id, contextRevision: id,
  policy: z.object({
    dataClassFloor: assistantRoutingRequestSchema.shape.declaredDataClass,
    privacyFloor: assistantRoutingRequestSchema.shape.privacyRequirement,
    riskFloor: assistantRoutingRequestSchema.shape.riskClass,
    budgetCeilingMicros: z.number().int().nonnegative().max(100_000),
    acceptedAt: z.string().datetime({ offset: true }),
  }).strict(),
  allowedOperations: z.array(operation).max(operations.length),
  entities: z.array(z.object({
    id, workspaceId: id, kind, aliases: z.array(id).max(16), allowedRoles: z.array(role).max(4),
  }).strict()).max(200),
  evidence: z.array(evidenceSchema).max(500),
  facts: z.array(z.object({
    id, evidenceId: id, value: z.string().max(4_000),
    classification: z.enum(["OPERATIONAL", "FINANCIAL"]), allowedRoles: z.array(role).max(4),
  }).strict()).max(500),
}).strict();
export type GuardedIntentSnapshot = z.infer<typeof contextSchema>;
const metadataSchema = assistantRoutingRequestSchema.omit({ message: true });
const spanSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1).max(4_000) }).strict();
const proposalSchema = z.object({
  schemaVersion: z.literal(1), requestFingerprint: hash, contextFingerprint: hash,
  actions: z.array(z.object({
    id, operation,
    targets: z.array(z.object({ kind, reference: id }).strict()).max(10),
    fields: z.array(z.object({
      name: z.enum(["title", "body", "start", "durationMinutes", "date"]),
      proposedValue: z.string().min(1).max(4_000),
      provenance: z.enum(["USER_QUOTED", "MODEL_PROPOSED"]),
      sourceSpans: z.array(spanSchema).max(16),
    }).strict()).max(5),
    evidenceIds: z.array(id).max(16), dependsOn: z.array(id).max(9),
  }).strict()).min(1).max(10),
  factClaims: z.array(z.object({ factId: id, evidenceId: id, value: z.string().max(4_000) }).strict()).max(32),
}).strict();
const fingerprint = (value: unknown) => `sha256:${sha256Canonical(value)}` as const;
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const normalizedAlias = (value: string) => value.normalize("NFC").toLocaleLowerCase("fr-CA");
const sortedSet = <T extends string>(values: T[]) => [...new Set(values)].sort();
function canonicalSnapshot(context: GuardedIntentSnapshot) {
  const byId = <T extends { id: string }>(items: T[]) => items.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { ...context, allowedOperations: sortedSet(context.allowedOperations),
    entities: byId(context.entities.map(entity => ({...entity, aliases:sortedSet(entity.aliases.map(normalizedAlias)), allowedRoles:sortedSet(entity.allowedRoles)}))),
    evidence: byId(context.evidence.map(item => ({...item, allowedRoles:sortedSet(item.allowedRoles)}))),
    facts: byId(context.facts.map(fact => ({...fact, allowedRoles:sortedSet(fact.allowedRoles)}))),
  };
}
const capabilityOperations: Readonly<Record<string, readonly string[]>> = {
  CANONICAL_STATE: ["READ_CONTACT", "READ_CALENDAR", "READ_TASK"],
  CALENDAR: ["PREPARE_EVENT"], COMMUNICATION_PREPARATION: ["DRAFT_MESSAGE"],
  // No R36a internal action-capable route exists for task/note creation here.
};
function requireCondition(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Offsets are UTF-16 code units into the ORIGINAL string, not token offsets.
 * Segments reconstruct the exact source; no trimming/normalization/truncation.
 * Segmentation supplies routing/admission only, not cross-segment understanding.
 */
export function segmentGuardedIntentSource(source: string) {
  requireCondition(typeof source === "string" && source.trim().length > 0, "INVALID_SOURCE");
  requireCondition(source.length <= GUARDED_INTENT_LIMITS.sourceCodeUnits
    && Buffer.byteLength(source, "utf8") <= GUARDED_INTENT_LIMITS.sourceBytes, "SOURCE_LIMIT_EXCEEDED");
  requireCondition(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(source), "SOURCE_UNICODE_INVALID");
  const segments: Array<{ start: number; end: number; text: string; sourceFingerprint: string }> = [];
  const sourceFingerprint = fingerprint(source);
  for (let start = 0; start < source.length;) {
    let end = Math.min(start + GUARDED_INTENT_LIMITS.segmentCodeUnits, source.length);
    // Do not split a UTF-16 surrogate pair across segment boundaries.
    if (end < source.length && /[\uD800-\uDBFF]/u.test(source[end - 1]) && /[\uDC00-\uDFFF]/u.test(source[end])) end--;
    segments.push({ start, end, text: source.slice(start, end), sourceFingerprint });
    start = end;
  }
  return freeze({ sourceFingerprint, offsetUnit: "UTF16_CODE_UNITS" as const, segments, truncated: false as const });
}

/** Pure snapshot inspection, NOT authoritative admission. Baseline R36a remains
 * the only router. Hard floors are code-owned; snapshot policy can only tighten.
 * acceptedAt is merely bound to the supplied snapshot, never authenticated here.
 */
export function inspectGuardedIntentAdmission(rawMetadata: unknown, rawContext: unknown, source: string) {
  const metadata = metadataSchema.parse(rawMetadata);
  const context = contextSchema.parse(rawContext);
  requireCondition(metadata.workspaceId === context.workspaceId && metadata.actorId === context.actorId, "CONTEXT_IDENTITY_MISMATCH");
  const dataRank = ["public", "business_confidential", "personal_data", "restricted_sensitive"];
  const privacyRank = ["standard", "no_training", "zero_retention", "regional_zero_retention"];
  const riskRank = ["low", "medium", "high", "prohibited"];
  requireCondition(dataRank.indexOf(metadata.declaredDataClass) >= Math.max(1, dataRank.indexOf(context.policy.dataClassFloor))
    && privacyRank.indexOf(metadata.privacyRequirement) >= Math.max(1, privacyRank.indexOf(context.policy.privacyFloor))
    && riskRank.indexOf(metadata.riskClass) >= Math.max(1, riskRank.indexOf(context.policy.riskFloor))
    && metadata.maxTotalCostMicros <= context.policy.budgetCeilingMicros
    && metadata.maxTotalCostMicros <= 100_000 && metadata.acceptedAt === context.policy.acceptedAt, "POLICY_FLOOR_MISMATCH");
  requireCondition(unique(context.entities.map(entity => entity.id)) && unique(context.facts.map(fact => fact.id))
    && unique(context.evidence.map(item => item.id)) && unique(context.allowedOperations), "DUPLICATE_CONTEXT_IDENTIFIER");
  requireCondition(context.entities.every(entity => entity.workspaceId === context.workspaceId)
    && context.evidence.every(item => item.workspaceId === context.workspaceId), "CROSS_WORKSPACE_CONTEXT");
  requireCondition(context.facts.every(fact => context.evidence.some(item => item.id === fact.evidenceId)), "FACT_EVIDENCE_MISSING");
  const segmented = segmentGuardedIntentSource(source);
  // Whitespace-only segments carry no intent; retain them in the original source.
  const routing = segmented.segments.filter(segment => segment.text.trim()).map(segment => prepareAssistantRoutingDecision({ ...metadata, message: segment.text }));
  return freeze({
    schemaVersion: 1 as const, contextFingerprint: fingerprint(canonicalSnapshot(context)),
    requestFingerprint: fingerprint({ metadata, sourceFingerprint: segmented.sourceFingerprint }),
    ...segmented,
    aggregateReviewRequired: segmented.segments.length > 1,
    baselineDecisions: routing.map(decision => ({
      decisionFingerprint: decision.decisionFingerprint, disposition: decision.disposition,
      reasonCode: decision.reasonCode,
      intentClass: decision.intentClass, capabilityKey: decision.capabilityKey, riskClass: decision.riskClass,
    })),
    candidateAccess: "UNPROBED" as const, candidateModelKey: null,
    providerExecutionAuthorized: false as const, externalDispatchPerformed: false as const,
    executionAuthorized: false as const, approvalGranted: false as const,
    snapshotAuthority: "UNVERIFIED_CALLER_SNAPSHOT" as const, snapshotFreshness: "NOT_VERIFIED" as const,
  });
}

const fieldContracts: Record<(typeof operations)[number], readonly string[]> = {
  READ_CONTACT: [], READ_CALENDAR: ["date"], READ_TASK: [],
  DRAFT_MESSAGE: ["body"], PREPARE_EVENT: ["title", "start", "durationMinutes"],
  PREPARE_TASK: ["title"], PREPARE_NOTE: ["title", "body"],
};
const targetKinds: Record<(typeof operations)[number], string | null> = {
  READ_CONTACT: "CONTACT", READ_CALENDAR: null, READ_TASK: "TASK", DRAFT_MESSAGE: "CONTACT",
  PREPARE_EVENT: null, PREPARE_TASK: null, PREPARE_NOTE: null,
};

/** Inspect untrusted JSON only. Matching an allowed VALUE checks consistency with
 * the supplied snapshot, NOT semantic truth, authentication or freshness. A caller
 * can replay a cached snapshot: inspection cannot observe store revocations.
 * No preview is emitted. The inspection hash is NOT an approval/execution token.
 */
export function inspectGuardedIntentProposal(rawJson: string, rawMetadata: unknown, rawContext: unknown, source: string) {
  const safety = {
    candidateAccess: "UNPROBED" as const, candidateModelKey: null,
    executionAuthorized: false as const, approvalGranted: false as const,
    providerExecutionAuthorized: false as const, externalDispatchPerformed: false as const,
    semanticTruthVerified: false as const, canonicalAnswer: null,
    snapshotAuthority: "UNVERIFIED_CALLER_SNAPSHOT" as const, snapshotFreshness: "NOT_VERIFIED" as const,
  };
  try {
    requireCondition(typeof rawJson === "string" && Buffer.byteLength(rawJson, "utf8") <= GUARDED_INTENT_LIMITS.proposalBytes, "PROPOSAL_LIMIT_EXCEEDED");
    const proposal = proposalSchema.parse(JSON.parse(rawJson));
    const context = contextSchema.parse(rawContext);
    const admission = inspectGuardedIntentAdmission(rawMetadata, context, source);
    requireCondition(proposal.contextFingerprint === admission.contextFingerprint, "STALE_CONTEXT_OR_PERMISSION");
    requireCondition(proposal.requestFingerprint === admission.requestFingerprint, "REQUEST_FINGERPRINT_MISMATCH");
    requireCondition(!admission.baselineDecisions.some(decision => ["REFUSED", "HUMAN_HANDOFF"].includes(decision.disposition)), "BASELINE_NOT_ELIGIBLE");
    requireCondition(unique(proposal.actions.map(action => action.id)), "DUPLICATE_ACTION_ID");
    requireCondition(unique(proposal.factClaims.map(claim => claim.factId)), "DUPLICATE_FACT_CLAIM");
    const permittedEvidence = (evidenceId: string) => {
      const item = context.evidence.find(evidence => evidence.id === evidenceId);
      return Boolean(item && item.allowedRoles.includes(context.role)
        && !(context.role === "FIELD_WORKER" && (item.classification === "FINANCIAL"
          || context.facts.some(fact => fact.evidenceId === evidenceId && fact.classification === "FINANCIAL"))));
    };
    const checkedFactRefs = proposal.factClaims.map(claim => {
      const fact = context.facts.find(item => item.id === claim.factId);
      requireCondition(fact && fact.allowedRoles.includes(context.role)
        && !(context.role === "FIELD_WORKER" && fact.classification === "FINANCIAL"), "FACT_NOT_PERMITTED");
      requireCondition(fact.evidenceId === claim.evidenceId && fact.value === claim.value, "FACT_CLAIM_MISMATCH");
      requireCondition(permittedEvidence(fact.evidenceId), "EVIDENCE_NOT_PERMITTED");
      return { factId: fact.id, evidenceId: fact.evidenceId, consistency: "MATCHES_SUPPLIED_SNAPSHOT" as const };
    }).sort((left,right) => left.factId < right.factId ? -1 : left.factId > right.factId ? 1 : 0);
    const clarification: string[] = [];
    const recipients = new Set<string>();
    const operationTargets = new Set<string>();
    let totalWorkUnits = 0;
    const normalized = proposal.actions.map((action, index) => {
      requireCondition(context.allowedOperations.includes(action.operation), "OPERATION_NOT_PERMITTED");
      requireCondition(context.role !== "VIEWER" || action.operation.startsWith("READ_"), "ROLE_NOT_PERMITTED");
      if (!admission.baselineDecisions.some(decision => decision.disposition === "INTERNAL_TOOL"
        && (capabilityOperations[decision.capabilityKey ?? ""] ?? []).includes(action.operation))) clarification.push("CAPABILITY_OPERATION_MISMATCH");
      requireCondition(unique(action.dependsOn) && action.dependsOn.every(dependency => proposal.actions.slice(0, index).some(prior => prior.id === dependency)), "DEPENDENCY_NOT_PRIOR_ACTION");
      requireCondition(unique(action.evidenceIds) && action.evidenceIds.every(evidenceId => permittedEvidence(evidenceId)
        && checkedFactRefs.some(fact => fact.evidenceId === evidenceId)), "EVIDENCE_NOT_PERMITTED");
      const expectedFields = fieldContracts[action.operation];
      requireCondition(unique(action.fields.map(field => field.name))
        && action.fields.every(field => expectedFields.includes(field.name))
        && expectedFields.every(name => action.fields.some(field => field.name === name)), "OPERATION_FIELDS_INVALID");
      const fields = action.fields.map(field => {
        if (field.name === "start") requireCondition(z.string().datetime({ offset: true }).safeParse(field.proposedValue).success, "EVENT_TIME_INVALID");
        if (field.name === "date") requireCondition(z.string().date().safeParse(field.proposedValue).success, "CALENDAR_DATE_INVALID");
        if (field.name === "durationMinutes") requireCondition(/^[1-9][0-9]{0,3}$/u.test(field.proposedValue) && Number(field.proposedValue) <= 1440, "EVENT_DURATION_INVALID");
        requireCondition(field.provenance === "USER_QUOTED" ? field.sourceSpans.length > 0 : field.sourceSpans.length === 0, "SOURCE_PROVENANCE_INVALID");
        requireCondition(field.sourceSpans.every(span => span.start < span.end && span.end <= source.length && source.slice(span.start, span.end) === span.quote), "SOURCE_SPAN_MISMATCH");
        requireCondition(field.provenance !== "USER_QUOTED" || field.sourceSpans.some(span => span.quote === field.proposedValue), "QUOTED_VALUE_MISMATCH");
        return { ...field, sourceSpans: [...new Map(field.sourceSpans.map(span=>[JSON.stringify([span.start,span.end,span.quote]),span])).values()].sort((a,b)=>a.start-b.start || a.end-b.end), verification: "UNVERIFIED_PROPOSAL" as const };
      }).sort((left, right) => left.name.localeCompare(right.name));
      const requiredKind = targetKinds[action.operation];
      requireCondition(requiredKind ? action.targets.length > 0 : action.targets.length === 0, "TARGET_COUNT_INVALID");
      const targetIds = action.targets.map(target => {
        requireCondition(target.kind === requiredKind, "TARGET_KIND_INVALID");
        const visible = context.entities.filter(entity => entity.kind === target.kind && entity.allowedRoles.includes(context.role));
        const exact = visible.filter(entity => entity.id === target.reference);
        const matches = exact.length ? exact : visible.filter(entity => entity.aliases.some(alias => normalizedAlias(alias) === normalizedAlias(target.reference)));
        if (matches.length !== 1) { clarification.push(matches.length ? "AMBIGUOUS_ENTITY" : "UNKNOWN_OR_INACCESSIBLE_ENTITY"); return null; }
        if (target.kind === "CONTACT") recipients.add(matches[0].id);
        return matches[0].id;
      });
      requireCondition(unique(targetIds.filter((value): value is string => value !== null)), "DUPLICATE_TARGET");
      totalWorkUnits += Math.max(1, action.targets.length);
      requireCondition(totalWorkUnits <= GUARDED_INTENT_LIMITS.totalWorkUnits, "TOTAL_WORK_LIMIT_EXCEEDED");
      for (const target of targetIds.filter((value): value is string => value !== null)) {
        const pair = JSON.stringify([action.operation,target]);
        requireCondition(!operationTargets.has(pair), "REPEATED_OPERATION_TARGET"); operationTargets.add(pair);
      }
      return { id: action.id, operation: action.operation, targetIds: [...targetIds].sort(), fields,
        evidenceRefs: [...action.evidenceIds].sort().map(evidenceId=>({evidenceId,verification:"SUPPLIED_SNAPSHOT_REFERENCE_ONLY" as const})), dependsOn: [...action.dependsOn].sort() };
    });
    requireCondition(recipients.size <= GUARDED_INTENT_LIMITS.recipients, "RECIPIENT_LIMIT_EXCEEDED");
    if (admission.baselineDecisions.some(decision => decision.disposition === "CLARIFICATION_REQUIRED")) clarification.push("BASELINE_CLARIFICATION_REQUIRED");
    // A per-segment classifier cannot establish cross-segment correction order.
    // Never treat slicing as semantic understanding or combine its action proposals.
    if (admission.aggregateReviewRequired) clarification.push("LONG_INPUT_REQUIRES_AGGREGATE_REVIEW");
    if (clarification.length) return freeze({ status: "CLARIFICATION_REQUIRED" as const, reasons: [...new Set(clarification)].sort(), preview: null, ...safety });
    const inspection = { schemaVersion: 1 as const, requestFingerprint: admission.requestFingerprint,
      contextFingerprint: admission.contextFingerprint, sourceFingerprint: admission.sourceFingerprint,
      baselineDecisionFingerprints: admission.baselineDecisions.map(decision => decision.decisionFingerprint),
      actions: normalized, checkedFactRefs, requiresHumanReview: true as const, ...safety };
    return freeze({ status: "PROPOSAL_INSPECTED_NOT_AUTHORIZED" as const, preview: null, inspection, inspectionFingerprint: fingerprint(inspection), ...safety });
  } catch (error) {
    // No input, model text, Zod issue values or raw server context in diagnostics.
    const reason = error instanceof Error && /^[A-Z][A-Z_]+$/u.test(error.message) ? error.message : "INVALID_PROPOSAL_OR_CONTEXT";
    return freeze({ status: "REJECTED" as const, reason, preview: null, ...safety });
  }
}
