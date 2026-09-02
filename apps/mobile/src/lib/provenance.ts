import { z } from "zod";

const kindSchema = z.enum(["FACT", "INFERENCE", "DECISION", "ACTION", "HUMAN_RESULT", "VERIFIED_STATE"]);
const entitySchema = z.enum([
  "ConstructionOpenLoopFact", "ConstructionInterpretation", "ConstructionOpenLoopTransition",
  "ConstructionOpenLoopContradiction", "ConstructionAuthorityEvaluation", "ConstructionAuthorityDecision",
  "ConstructionAction", "ConstructionHumanEscalation", "ConstructionOpenLoopSnapshot",
]);
const sourceKindSchema = z.enum(["MESSAGE", "EVIDENCE", "POLICY", "HUMAN_WORK", "CANONICAL_STATE", "NONE"]);
const refSchema = z.object({ entityType: entitySchema, entityId: z.string().min(1) }).strict();
const parentSchema = z.object({
  entryId: z.string().min(1),
  relation: z.enum(["DERIVED_FROM", "DECIDED_FROM", "ACTED_FROM", "VERIFIED_FROM"]),
}).strict().nullable();
const commonEntry = {
  id: z.string().min(1), kind: kindSchema, recordedAt: z.string().datetime(),
  statement: z.string().min(1), stateLabel: z.string().min(1), canonicalRef: refSchema,
  causalParent: parentSchema,
};
const ownerSource = z.object({ kind: sourceKindSchema, label: z.string().min(1), sourceEntityId: z.string().min(1).nullable() }).strict();
const fieldSource = z.object({ kind: sourceKindSchema, label: z.string().min(1) }).strict();

const fact = z.object({ ...commonEntry, kind: z.literal("FACT"), source: ownerSource, details: z.object({
  field: z.enum(["PROJECT_ASSOCIATION", "WORK_DESCRIPTION", "AMOUNT", "COMPLETION_ASSERTION", "APPROVAL_STATE"]),
  valueLabel: z.string().min(1), truthState: z.enum(["PROPOSED", "CONTRADICTED", "VERIFIED", "SUPERSEDED"]),
  sourceType: z.string().min(1), observedAt: z.string().datetime().nullable(),
}).strict() }).strict();
const inference = z.object({ ...commonEntry, kind: z.literal("INFERENCE"), source: ownerSource, details: z.object({
  intent: z.string().min(1), confidenceBand: z.enum(["LOW", "MEDIUM", "HIGH"]), interpreterVersion: z.string().min(1),
}).strict() }).strict();
const decision = z.object({ ...commonEntry, kind: z.literal("DECISION"), source: ownerSource, details: z.object({
  decisionType: z.enum(["OPEN_LOOP_TRANSITION", "CONTRADICTION", "AUTHORITY_EVALUATION", "AUTHORITY_DECISION"]),
  priorState: z.string().min(1).nullable(), nextState: z.string().min(1), reasonCodes: z.array(z.string().min(1)), policyVersion: z.number().int().positive().nullable(),
}).strict() }).strict();
const action = z.object({ ...commonEntry, kind: z.literal("ACTION"), source: ownerSource, details: z.object({
  actionType: z.string().min(1), actionStatus: z.string().min(1), localSimulationCount: z.number().int().nonnegative(), externalEffectPerformed: z.literal(false),
}).strict() }).strict();
const human = z.object({ ...commonEntry, kind: z.literal("HUMAN_RESULT"), source: ownerSource, details: z.object({
  purpose: z.string().min(1), lifecycleState: z.string().min(1), acceptedResultFingerprint: z.string().regex(/^[a-f0-9]{64}$/u).nullable(), appliedAt: z.string().datetime().nullable(),
}).strict() }).strict();
const verified = z.object({ ...commonEntry, kind: z.literal("VERIFIED_STATE"), source: ownerSource, details: z.object({
  stateVersion: z.number().int().positive(), snapshotFingerprint: z.string().regex(/^[a-f0-9]{64}$/u), current: z.boolean(), nextResponsibleRole: z.string().min(1).nullable(), nextAction: z.string().min(1).nullable(),
}).strict() }).strict();
const ownerEntry = z.discriminatedUnion("kind", [fact, inference, decision, action, human, verified]);
const fieldEntry = z.object({ ...commonEntry, source: fieldSource, details: z.object({
  workLabel: z.string().min(1), responsibleRole: z.string().min(1).nullable(),
}).strict() }).strict();
const summary = z.object({ total: z.number().int().nonnegative(), verified: z.number().int().nonnegative(), proposed: z.number().int().nonnegative(), contradicted: z.number().int().nonnegative(), humanAssisted: z.number().int().nonnegative() }).strict();
const root = { schemaVersion: z.literal(1), generatedAt: z.string().datetime(), workspaceId: z.string().min(1), project: z.object({ id: z.string().min(1), code: z.string().min(1), name: z.string().min(1) }).strict(), summary, externalEffectCount: z.literal(0) };
const ownerSchema = z.object({ ...root, role: z.enum(["OWNER", "OFFICE_MANAGER"]), entries: z.array(ownerEntry) }).strict();
const fieldSchema = z.object({ ...root, role: z.literal("FIELD_WORKER"), entries: z.array(fieldEntry) }).strict();

const FIELD_FORBIDDEN = new Set(["amountMinor", "currency", "valueLabel", "sourceEntityId", "sourceId", "sourceRef", "payload", "payloadHash", "snapshotFingerprint", "acceptedResultFingerprint", "policyVersion", "reasonCodes", "interpreterVersion", "confidenceBand", "localSimulationCount", "invoiceReference"]);
function rejectFieldLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FIELD_FORBIDDEN.has(key)) throw new Error("MOBILE_PROVENANCE_FIELD_LEAK_REFUSED");
    rejectFieldLeaks(child);
  }
}

export function parseMobileProjectProvenance(value: unknown) {
  const role = z.object({ role: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]) }).passthrough().parse(value).role;
  if (role === "FIELD_WORKER") {
    rejectFieldLeaks(value);
    return fieldSchema.parse(value);
  }
  return ownerSchema.parse(value);
}

export type MobileProjectProvenance = ReturnType<typeof parseMobileProjectProvenance>;
