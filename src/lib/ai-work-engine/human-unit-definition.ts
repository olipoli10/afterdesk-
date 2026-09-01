import { sanitizeClientText } from "@/lib/ai-work-engine/client-scope";
import { compileFrozenOutputSchema } from "@/lib/ai-work-engine/human-unit-result-schema";

/**
 * THE FROZEN DEFINITION OF A HUMAN WORK UNIT.
 *
 * Pure: no database, no clock. The definition belongs to an accepted plan
 * version and must read identically to every reader forever, which is why it
 * lives on its own row with an immutability trigger rather than as mutable
 * columns on the run state.
 *
 * The load-bearing property is structural, not reviewed (FR-002, FR-035,
 * readiness CHK020): there is NO parameter through which an operator-authored
 * instruction, input, output, artifact or acceptance obligation can enter. That
 * is what makes "the unit adds nothing beyond the accepted step" a fact about
 * the function's shape instead of a promise about someone's diligence. Every
 * field must therefore trace to an accepted-contract column or a frozen
 * setting — and if a field has no such source, it may not be invented here.
 */

/** What the worker may see. This array is the whole of it (FR-014). */
export type DeclaredInput = {
  kind: "payload_field" | "snapshot_file" | "artifact";
  ref: string;
  label: string;
  dataClass: string;
};

/** Frozen at admission; never raised for a live run (FR-022, FR-058). */
export type FrozenUnitSettings = {
  revisionBound: number;
  publicationDeadlineHours: number;
  submissionDeadlineHours: number;
  claimLeaseHours: number;
};

/**
 * The accepted human plan step, verbatim. These are the REAL columns of
 * `TaskExecutionPlanStep` (`prisma/schema.prisma`), not a wished-for shape:
 * the whole point of the freeze is that it cannot read a field the accepted
 * contract does not have.
 */
export type AcceptedPlanStepRow = {
  id: string;
  order: number;
  title: string;
  description: string;
  verificationMethod: string;
  acceptanceCriteria: string[];
  /** The frozen human output contract, written before acceptance (T011/B). */
  humanOutputSchema: unknown;
  humanRequiredArtifactKinds: string[];
  fixedMinutes: number | null;
  secondsPerUnit: number | null;
  estimatedMinutesOptimistic: number;
  estimatedMinutesLikely: number;
  estimatedMinutesConservative: number;
};

/** The exact frozen values the admission test read (FR-002, FR-035). */
export type EconomicProvenance = {
  planStepId: string;
  fixedMinutes: number | null;
  secondsPerUnit: number | null;
  pertOptimistic: number;
  pertLikely: number;
  pertConservative: number;
  acceptedTaskPayoutCents: number;
  acceptedEstimatedMinutes: number;
};

export type FrozenHumanUnitDefinition = {
  instructions: string;
  declaredInputs: DeclaredInput[];
  /** The frozen shape a candidate must satisfy, copied off the accepted step. */
  outputSchema: unknown;
  requiredArtifactKinds: string[];
  acceptanceCriteria: string[];
  verificationMethod: string;
  eligibility: FrozenEligibility;
  /** `"admin"` in V1. A column, not a new role. */
  reviewerAuthority: string;
  /**
   * Descriptive capacity context ONLY. Never an input to a lease, a price, a
   * payout or any economic computation (FR-058).
   */
  expectedMinutes: number;
  revisionBound: number;
  publicationDeadlineHours: number;
  submissionDeadlineHours: number;
  claimLeaseHours: number;
  economicProvenance: EconomicProvenance;
  dataClass: string;
};

/** Criteria are frozen; the worker's own facts are read live (FR-009). */
export type FrozenEligibility = {
  categorySlug: string | null;
  tier: string;
  requireCategoryCertification: boolean;
  highValueThreshold: number;
  minRatedDeliveries: number;
  maxActiveClaims: number;
};

/**
 * Freeze the accepted human step into the unit definition, or refuse.
 *
 * COPIES, NEVER AUTHORS. Every field below reads from `input.cut` (columns of
 * the accepted plan step), from `input.settings` / `input.eligibility` (frozen
 * platform settings), or from the accepted task economics. There is no
 * parameter carrying an instruction, an input, an output, an artifact or an
 * acceptance obligation that did not come from the signed contract — which is
 * what makes "the unit adds nothing beyond that accepted step" structural
 * rather than reviewed (FR-002, FR-035, readiness CHK020).
 *
 * RETURNS NULL — a refusal — when the accepted step carries no usable output
 * contract. A plan accepted before those columns existed has null in both, and
 * they are never backfilled: inventing a default would put an obligation on a
 * worker that no client accepted, and freezing an empty one would leave the
 * submission gate with nothing to check. Either way the unit is not admitted
 * and the mandate stays on the existing manual path.
 *
 * The refusal uses the SAME compiler the submission gate uses, so the freeze
 * can never admit a contract that would later prove uncompilable and strand a
 * worker who is unable to submit.
 */
export function freezeHumanUnitDefinition(input: {
  planVersionId: string;
  cut: AcceptedPlanStepRow;
  acceptedTaskPayoutCents: number;
  acceptedEstimatedMinutes: number;
  dataClass: string;
  declaredInputs: DeclaredInput[];
  settings: FrozenUnitSettings;
  eligibility: FrozenEligibility;
}): FrozenHumanUnitDefinition | null {
  const { cut } = input;

  if (compileFrozenOutputSchema(cut.humanOutputSchema) === null) return null;

  const artifactKinds = Array.isArray(cut.humanRequiredArtifactKinds)
    ? cut.humanRequiredArtifactKinds.filter((k): k is string => typeof k === "string")
    : [];

  return {
    // The worker's brief is the accepted step's own title and description, run
    // through the house copy sanitiser. Nothing else is added.
    instructions: sanitizeClientText(`${cut.title}. ${cut.description}`, 4_600),
    declaredInputs: input.declaredInputs.map((i) => ({ ...i })),
    // Structured-cloned, not aliased: a definition every party reads forever
    // must not share a reference with whoever built it.
    outputSchema: structuredClone(cut.humanOutputSchema),
    requiredArtifactKinds: [...artifactKinds],
    acceptanceCriteria: [...cut.acceptanceCriteria],
    verificationMethod: cut.verificationMethod,
    eligibility: { ...input.eligibility },
    reviewerAuthority: "admin",
    // Descriptive capacity context ONLY (FR-058). Note that no duration below
    // reads it.
    expectedMinutes: cut.estimatedMinutesLikely,
    revisionBound: input.settings.revisionBound,
    publicationDeadlineHours: input.settings.publicationDeadlineHours,
    submissionDeadlineHours: input.settings.submissionDeadlineHours,
    claimLeaseHours: input.settings.claimLeaseHours,
    economicProvenance: {
      planStepId: cut.id,
      fixedMinutes: cut.fixedMinutes,
      secondsPerUnit: cut.secondsPerUnit,
      pertOptimistic: cut.estimatedMinutesOptimistic,
      pertLikely: cut.estimatedMinutesLikely,
      pertConservative: cut.estimatedMinutesConservative,
      acceptedTaskPayoutCents: input.acceptedTaskPayoutCents,
      acceptedEstimatedMinutes: input.acceptedEstimatedMinutes,
    },
    dataClass: input.dataClass,
  };
}
