import { z } from "zod";

export const HUMAN_ESCALATION_SCHEMA_VERSION = 1 as const;

const identifier = z.string().min(1).max(160);
const instant = z.string().datetime();
const commandBase = {
  schemaVersion: z.literal(HUMAN_ESCALATION_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  requestId: identifier,
  idempotencyKey: identifier,
  workspaceId: identifier,
};

const prepareHumanEscalationCommandSchema = z
  .object({
    ...commandBase,
    action: z.literal("PREPARE"),
    projectId: identifier,
    openLoopId: identifier,
    expectedStateVersion: z.number().int().positive(),
    purpose: z.literal("OBTAIN_MISSING_EVIDENCE"),
    evidenceKind: z.enum(["WRITTEN_APPROVAL", "PHOTO", "DOCUMENT"]),
    acceptedClientPriceCents: z.number().int().positive().max(2_000_000),
    acceptedWorkerPayoutCents: z.number().int().positive().max(1_000_000),
    acceptedEstimatedMinutes: z.number().int().positive().max(480),
    acceptedCurrency: z.literal("CAD"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.acceptedWorkerPayoutCents > value.acceptedClientPriceCents) {
      context.addIssue({
        code: "custom",
        path: ["acceptedWorkerPayoutCents"],
        message: "Worker payout cannot exceed the accepted client price.",
      });
    }
  });

const withdrawHumanEscalationCommandSchema = z
  .object({
    ...commandBase,
    action: z.literal("WITHDRAW"),
    escalationId: identifier,
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const humanEscalationCommandSchema = z.union([
  prepareHumanEscalationCommandSchema,
  withdrawHumanEscalationCommandSchema,
]);

export type HumanEscalationCommand = z.infer<
  typeof humanEscalationCommandSchema
>;

export const humanEscalationCockpitQuerySchema = z
  .object({ workspaceId: identifier })
  .strict();

export const humanEscalationStateSchema = z.enum([
  "PREPARED",
  "WAITING_FOR_WORKER",
  "WORK_IN_PROGRESS",
  "WAITING_FOR_REVIEW",
  "REVISION_REQUIRED",
  "ACCEPTED_PENDING_RESUME",
  "RESUMED_PENDING_APPLICATION",
  "APPLIED",
  "WITHDRAWN",
  "PAUSED",
  "EXHAUSTED",
  "OPERATOR_ATTENTION_REQUIRED",
]);

export type HumanEscalationState = z.infer<
  typeof humanEscalationStateSchema
>;

const nextResponsibleRoleSchema = z.enum([
  "OWNER",
  "OFFICE",
  "SYSTEM",
  "WORKER",
  "REVIEWER",
  "OPERATOR",
  "NONE",
]);

const eligibleLoopSchema = z
  .object({
    loopId: identifier,
    projectId: identifier,
    projectCode: z.string().min(1).max(80),
    projectName: z.string().min(1).max(240),
    stateVersion: z.number().int().positive(),
    missingEvidenceKinds: z
      .array(z.enum(["WRITTEN_APPROVAL", "SUPPORTING_EVIDENCE"]))
      .min(1),
    nextAction: z.string().min(1).max(1_000),
  })
  .strict();

const ownerEscalationSchema = z
  .object({
    escalationId: identifier,
    projectId: identifier,
    projectCode: z.string().min(1).max(80),
    projectName: z.string().min(1).max(240),
    openLoopId: identifier,
    purpose: z.literal("OBTAIN_MISSING_EVIDENCE"),
    evidenceKind: z.enum(["WRITTEN_APPROVAL", "PHOTO", "DOCUMENT"]),
    state: humanEscalationStateSchema,
    nextResponsibleRole: nextResponsibleRoleSchema,
    nextAction: z.string().min(1).max(1_000),
    deadlineAt: instant.nullable(),
    remainingRevisions: z.number().int().nonnegative(),
    sourceStateVersion: z.number().int().positive(),
    acceptedClientPriceCents: z.number().int().positive(),
    acceptedCurrency: z.literal("CAD"),
    acceptanceId: identifier.nullable(),
    acceptedResultHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    appliedAt: instant.nullable(),
    fundingRequired: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

const cockpitBase = {
  schemaVersion: z.literal(HUMAN_ESCALATION_SCHEMA_VERSION),
  generatedAt: instant,
  workspaceId: identifier,
  externalTransportPerformed: z.literal(false),
};

export const ownerHumanEscalationCockpitSchema = z
  .object({
    ...cockpitBase,
    role: z.enum(["OWNER", "OFFICE_MANAGER"]),
    eligibleLoops: z.array(eligibleLoopSchema),
    escalations: z.array(ownerEscalationSchema),
  })
  .strict();

export const fieldHumanEscalationCockpitSchema = z
  .object({
    ...cockpitBase,
    role: z.literal("FIELD_WORKER"),
    eligibleLoops: z.array(z.never()).max(0),
    escalations: z.array(z.never()).max(0),
    financialDataVisible: z.literal(false),
  })
  .strict();

export const humanEscalationCockpitSchema = z.discriminatedUnion("role", [
  ownerHumanEscalationCockpitSchema,
  fieldHumanEscalationCockpitSchema,
]);

export type HumanEscalationCockpit = z.infer<
  typeof humanEscalationCockpitSchema
>;

export const humanEscalationCommandResultSchema = z
  .object({
    schemaVersion: z.literal(HUMAN_ESCALATION_SCHEMA_VERSION),
    commandId: z.string().uuid(),
    workspaceId: identifier,
    action: z.enum(["PREPARE", "WITHDRAW"]),
    escalationId: identifier,
    state: humanEscalationStateSchema,
    replayed: z.boolean(),
    fundingRequired: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type HumanEscalationCommandResult = z.infer<
  typeof humanEscalationCommandResultSchema
>;

type CanonicalEscalationState =
  | "prepared"
  | "active"
  | "resumed"
  | "withdrawn"
  | "exhausted"
  | "paused";

type CanonicalHumanUnitState =
  | "admitted"
  | "published"
  | "claimed"
  | "submitted"
  | "in_review"
  | "revision_requested"
  | "accepted"
  | "resumed"
  | "exhausted"
  | "paused"
  | "withdrawn";

export function mapHumanEscalationOwnerState(input: {
  escalationState: CanonicalEscalationState;
  unitState: CanonicalHumanUnitState;
  acceptancePresent: boolean;
  applied: boolean;
}) {
  if (input.applied) {
    return {
      state: "APPLIED" as const,
      nextResponsibleRole: "NONE" as const,
      nextAction: "Le résultat vérifié a été appliqué au chantier.",
      fundingRequired: false,
    };
  }
  if (input.escalationState === "withdrawn" || input.unitState === "withdrawn") {
    return {
      state: "WITHDRAWN" as const,
      nextResponsibleRole: "OWNER" as const,
      nextAction: "Décider si une nouvelle intervention humaine est nécessaire.",
      fundingRequired: false,
    };
  }
  if (input.escalationState === "exhausted" || input.unitState === "exhausted") {
    return {
      state: "EXHAUSTED" as const,
      nextResponsibleRole: "OPERATOR" as const,
      nextAction: "Examiner l’échec et choisir une voie de résolution autorisée.",
      fundingRequired: false,
    };
  }
  if (input.escalationState === "paused" || input.unitState === "paused") {
    return {
      state: "PAUSED" as const,
      nextResponsibleRole: "OPERATOR" as const,
      nextAction: "Corriger le blocage avant de reprendre le travail humain.",
      fundingRequired: false,
    };
  }
  if (input.escalationState === "prepared") {
    return {
      state: "PREPARED" as const,
      nextResponsibleRole: "OWNER" as const,
      nextAction: "Autoriser le budget avant de publier le travail humain.",
      fundingRequired: true,
    };
  }
  if (input.unitState === "published") {
    return {
      state: "WAITING_FOR_WORKER" as const,
      nextResponsibleRole: "WORKER" as const,
      nextAction: "Attendre qu’un travailleur admissible réclame le mandat.",
      fundingRequired: false,
    };
  }
  if (input.unitState === "claimed") {
    return {
      state: "WORK_IN_PROGRESS" as const,
      nextResponsibleRole: "WORKER" as const,
      nextAction: "Le travailleur doit remettre le résultat et les preuves exigées.",
      fundingRequired: false,
    };
  }
  if (input.unitState === "submitted" || input.unitState === "in_review") {
    return {
      state: "WAITING_FOR_REVIEW" as const,
      nextResponsibleRole: "REVIEWER" as const,
      nextAction: "Un réviseur indépendant doit accepter ou demander une révision.",
      fundingRequired: false,
    };
  }
  if (input.unitState === "revision_requested") {
    return {
      state: "REVISION_REQUIRED" as const,
      nextResponsibleRole: "WORKER" as const,
      nextAction: "Le travailleur doit corriger le résultat dans la limite autorisée.",
      fundingRequired: false,
    };
  }
  if (input.unitState === "resumed" || input.escalationState === "resumed") {
    return {
      state: "RESUMED_PENDING_APPLICATION" as const,
      nextResponsibleRole: "SYSTEM" as const,
      nextAction: "Finaliser l’application vérifiée au chantier.",
      fundingRequired: false,
    };
  }
  if (input.unitState === "accepted" || input.acceptancePresent) {
    return {
      state: "ACCEPTED_PENDING_RESUME" as const,
      nextResponsibleRole: "SYSTEM" as const,
      nextAction: "Reprendre le workflow et appliquer le résultat accepté exactement une fois.",
      fundingRequired: false,
    };
  }
  return {
    state: "OPERATOR_ATTENTION_REQUIRED" as const,
    nextResponsibleRole: "OPERATOR" as const,
    nextAction: "Inspecter l’état humain incohérent avant toute suite.",
    fundingRequired: false,
  };
}
