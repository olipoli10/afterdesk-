import { z } from "zod";

export const CONSTRUCTION_HUMAN_ESCALATION_CONTRACT_VERSION =
  "construction-human-escalation-v1" as const;

export const constructionHumanEscalationPurposeSchema = z.literal(
  "OBTAIN_MISSING_EVIDENCE",
);

const requestConstructionHumanEscalationBaseSchema = z.object({
    schemaVersion: z.literal(1),
    requestId: z.string().min(1).max(160),
    idempotencyKey: z.string().min(1).max(160),
    actorId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    openLoopId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    purpose: constructionHumanEscalationPurposeSchema,
    evidenceKind: z.enum(["WRITTEN_APPROVAL", "PHOTO", "DOCUMENT"]),
    acceptedClientPriceCents: z.number().int().positive().max(2_000_000),
    acceptedWorkerPayoutCents: z.number().int().positive().max(1_000_000),
    acceptedEstimatedMinutes: z.number().int().positive().max(480),
    acceptedCurrency: z.literal("CAD"),
  }).strict();

function validateFrozenEconomics(
  value: { acceptedClientPriceCents: number; acceptedWorkerPayoutCents: number },
  context: z.RefinementCtx,
) {
    if (value.acceptedClientPriceCents < value.acceptedWorkerPayoutCents) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptedClientPriceCents"],
        message: "The accepted client price cannot be lower than the frozen worker payout.",
      });
    }
}

export const requestConstructionHumanEscalationSchema =
  requestConstructionHumanEscalationBaseSchema.superRefine(
    validateFrozenEconomics,
  );

export const prepareConstructionHumanEscalationSchema =
  requestConstructionHumanEscalationBaseSchema
    .omit({ actorId: true })
    .superRefine(validateFrozenEconomics);

export const acceptedConstructionHumanEvidenceResultSchema = z
  .object({
    summary: z.string().trim().min(1).max(2_000),
  })
  .strict();

export type RequestConstructionHumanEscalation = z.infer<
  typeof requestConstructionHumanEscalationSchema
>;

export type ConstructionHumanEscalationPurpose = z.infer<
  typeof constructionHumanEscalationPurposeSchema
>;

export type FrozenConstructionHumanContract = {
  title: string;
  instructions: string;
  outputSchema: {
    type: "object";
    properties: { summary: { type: "string" } };
    required: ["summary"];
  };
  requiredArtifactKinds: string[];
  acceptanceCriteria: string[];
  verificationMethod: "independent_admin_review";
};

const ARTIFACT_KIND = {
  WRITTEN_APPROVAL: "written_approval",
  PHOTO: "photo",
  DOCUMENT: "document",
} as const;

const EVIDENCE_LABEL = {
  WRITTEN_APPROVAL: "written approval",
  PHOTO: "site photo",
  DOCUMENT: "supporting document",
} as const;

/**
 * Pure closed-world compiler. It never receives an amount, client identity,
 * phone number, credential or arbitrary prompt, so none can leak into the
 * worker contract by construction.
 */
export function compileConstructionHumanContract(input: {
  projectCode: string;
  evidenceKind: RequestConstructionHumanEscalation["evidenceKind"];
}): FrozenConstructionHumanContract {
  const projectCode = input.projectCode.trim().slice(0, 80);
  const label = EVIDENCE_LABEL[input.evidenceKind];
  return {
    title: `Obtain ${label} for ${projectCode}`,
    instructions:
      `Obtain the requested ${label} for project ${projectCode}. ` +
      "Submit only the evidence and a concise factual summary. Do not infer approval, completion or payment.",
    outputSchema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
    requiredArtifactKinds: [ARTIFACT_KIND[input.evidenceKind]],
    acceptanceCriteria: [
      `The ${label} is attached under the required artifact kind.`,
      "The summary states only what the evidence directly supports.",
      "The evidence belongs to the bound project and open loop.",
    ],
    verificationMethod: "independent_admin_review",
  };
}
