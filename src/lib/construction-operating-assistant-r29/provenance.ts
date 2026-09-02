import { z } from "zod";

export const provenanceKindSchema = z.enum([
  "FACT",
  "INFERENCE",
  "DECISION",
  "ACTION",
  "HUMAN_RESULT",
  "VERIFIED_STATE",
]);

export const provenanceEntityTypeSchema = z.enum([
  "ConstructionOpenLoopFact",
  "ConstructionInterpretation",
  "ConstructionOpenLoopTransition",
  "ConstructionOpenLoopContradiction",
  "ConstructionAuthorityEvaluation",
  "ConstructionAuthorityDecision",
  "ConstructionAction",
  "ConstructionHumanEscalation",
  "ConstructionOpenLoopSnapshot",
]);

export const provenanceSourceKindSchema = z.enum([
  "MESSAGE",
  "EVIDENCE",
  "POLICY",
  "HUMAN_WORK",
  "CANONICAL_STATE",
  "NONE",
]);

const canonicalRefSchema = z.object({
  entityType: provenanceEntityTypeSchema,
  entityId: z.string().min(1).max(200),
}).strict();

const ownerSourceSchema = z.object({
  kind: provenanceSourceKindSchema,
  label: z.string().min(1).max(240),
  sourceEntityId: z.string().min(1).max(200).nullable(),
}).strict();

const causalParentSchema = z.object({
  entryId: z.string().min(1).max(280),
  relation: z.enum(["DERIVED_FROM", "DECIDED_FROM", "ACTED_FROM", "VERIFIED_FROM"]),
}).strict().nullable();

const entryBase = {
  id: z.string().min(1).max(280),
  kind: provenanceKindSchema,
  recordedAt: z.string().datetime(),
  statement: z.string().min(1).max(1_000),
  stateLabel: z.string().regex(/^[A-Z0-9_:-]{2,120}$/u),
  canonicalRef: canonicalRefSchema,
  source: ownerSourceSchema,
  causalParent: causalParentSchema,
};

const factEntrySchema = z.object({
  ...entryBase,
  kind: z.literal("FACT"),
  details: z.object({
    field: z.enum(["PROJECT_ASSOCIATION", "WORK_DESCRIPTION", "AMOUNT", "COMPLETION_ASSERTION", "APPROVAL_STATE"]),
    valueLabel: z.string().min(1).max(500),
    truthState: z.enum(["PROPOSED", "CONTRADICTED", "VERIFIED", "SUPERSEDED"]),
    sourceType: z.string().min(1).max(120),
    observedAt: z.string().datetime().nullable(),
  }).strict(),
}).strict();

const inferenceEntrySchema = z.object({
  ...entryBase,
  kind: z.literal("INFERENCE"),
  details: z.object({
    intent: z.string().min(1).max(120),
    confidenceBand: z.enum(["LOW", "MEDIUM", "HIGH"]),
    interpreterVersion: z.string().min(1).max(160),
  }).strict(),
}).strict();

const decisionEntrySchema = z.object({
  ...entryBase,
  kind: z.literal("DECISION"),
  details: z.object({
    decisionType: z.enum(["OPEN_LOOP_TRANSITION", "CONTRADICTION", "AUTHORITY_EVALUATION", "AUTHORITY_DECISION"]),
    priorState: z.string().min(1).max(120).nullable(),
    nextState: z.string().min(1).max(120),
    reasonCodes: z.array(z.string().min(1).max(160)).max(30),
    policyVersion: z.number().int().positive().nullable(),
  }).strict(),
}).strict();

const actionEntrySchema = z.object({
  ...entryBase,
  kind: z.literal("ACTION"),
  details: z.object({
    actionType: z.string().min(1).max(120),
    actionStatus: z.string().min(1).max(120),
    localSimulationCount: z.number().int().nonnegative(),
    externalEffectPerformed: z.literal(false),
  }).strict(),
}).strict();

const humanResultEntrySchema = z.object({
  ...entryBase,
  kind: z.literal("HUMAN_RESULT"),
  details: z.object({
    purpose: z.string().min(1).max(160),
    lifecycleState: z.string().min(1).max(120),
    acceptedResultFingerprint: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
    appliedAt: z.string().datetime().nullable(),
  }).strict(),
}).strict();

const verifiedStateEntrySchema = z.object({
  ...entryBase,
  kind: z.literal("VERIFIED_STATE"),
  details: z.object({
    stateVersion: z.number().int().positive(),
    snapshotFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    current: z.boolean(),
    nextResponsibleRole: z.string().min(1).max(120).nullable(),
    nextAction: z.string().min(1).max(200).nullable(),
  }).strict(),
}).strict();

export const ownerProvenanceEntrySchema = z.discriminatedUnion("kind", [
  factEntrySchema,
  inferenceEntrySchema,
  decisionEntrySchema,
  actionEntrySchema,
  humanResultEntrySchema,
  verifiedStateEntrySchema,
]);

const fieldSourceSchema = z.object({
  kind: provenanceSourceKindSchema,
  label: z.string().min(1).max(240),
}).strict();

export const fieldProvenanceEntrySchema = z.object({
  id: z.string().min(1).max(280),
  kind: provenanceKindSchema,
  recordedAt: z.string().datetime(),
  statement: z.string().min(1).max(500),
  stateLabel: z.string().regex(/^[A-Z0-9_:-]{2,120}$/u),
  canonicalRef: canonicalRefSchema,
  source: fieldSourceSchema,
  causalParent: z.object({
    entryId: z.string().min(1).max(280),
    relation: z.enum(["DERIVED_FROM", "DECIDED_FROM", "ACTED_FROM", "VERIFIED_FROM"]),
  }).strict().nullable(),
  details: z.object({
    workLabel: z.string().min(1).max(240),
    responsibleRole: z.string().min(1).max(120).nullable(),
  }).strict(),
}).strict();

const projectSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
}).strict();

const summarySchema = z.object({
  total: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  proposed: z.number().int().nonnegative(),
  contradicted: z.number().int().nonnegative(),
  humanAssisted: z.number().int().nonnegative(),
}).strict();

const rootBase = {
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  workspaceId: z.string().min(1),
  project: projectSchema,
  summary: summarySchema,
  externalEffectCount: z.literal(0),
};

function requireCausalParents(
  value: { entries: Array<{ id: string; causalParent: { entryId: string } | null }> },
  context: z.RefinementCtx,
) {
  const ids = new Set(value.entries.map((entry) => entry.id));
  value.entries.forEach((entry, index) => {
    if (entry.causalParent && !ids.has(entry.causalParent.entryId)) {
      context.addIssue({
        code: "custom",
        message: "PROVENANCE_CAUSAL_PARENT_NOT_FOUND",
        path: ["entries", index, "causalParent", "entryId"],
      });
    }
  });
}

export const ownerProjectProvenanceSchema = z.object({
  ...rootBase,
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  entries: z.array(ownerProvenanceEntrySchema).max(1_000),
}).strict().superRefine(requireCausalParents);

export const fieldProjectProvenanceSchema = z.object({
  ...rootBase,
  role: z.literal("FIELD_WORKER"),
  entries: z.array(fieldProvenanceEntrySchema).max(1_000),
}).strict().superRefine(requireCausalParents);

export const projectProvenanceQuerySchema = z.object({
  workspaceId: z.string().min(1).max(160),
  projectId: z.string().min(1).max(160),
}).strict();

const FIELD_FORBIDDEN_KEYS = new Set([
  "amountMinor",
  "currency",
  "valueLabel",
  "sourceEntityId",
  "sourceId",
  "sourceRef",
  "payload",
  "payloadHash",
  "snapshotFingerprint",
  "acceptedResultFingerprint",
  "policyVersion",
  "reasonCodes",
  "interpreterVersion",
  "confidenceBand",
  "localSimulationCount",
  "userId",
  "actorUserId",
  "invoiceReference",
]);

export function rejectFieldProvenanceLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldProvenanceLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FIELD_FORBIDDEN_KEYS.has(key)) throw new Error("FIELD_PROVENANCE_LEAK_REFUSED");
    rejectFieldProvenanceLeaks(child);
  }
}

const KIND_PRIORITY: Record<z.infer<typeof provenanceKindSchema>, number> = {
  FACT: 0,
  INFERENCE: 1,
  DECISION: 2,
  ACTION: 3,
  HUMAN_RESULT: 4,
  VERIFIED_STATE: 5,
};

export function orderProvenanceEntries<
  T extends { recordedAt: string; kind: z.infer<typeof provenanceKindSchema>; id: string },
>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const byTime = a.recordedAt.localeCompare(b.recordedAt);
    if (byTime !== 0) return byTime;
    const byKind = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    return byKind !== 0 ? byKind : a.id.localeCompare(b.id);
  });
}

export type OwnerProvenanceEntry = z.infer<typeof ownerProvenanceEntrySchema>;
export type FieldProvenanceEntry = z.infer<typeof fieldProvenanceEntrySchema>;
export type ProjectProvenance =
  | z.infer<typeof ownerProjectProvenanceSchema>
  | z.infer<typeof fieldProjectProvenanceSchema>;
