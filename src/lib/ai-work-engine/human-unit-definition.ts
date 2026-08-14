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
  /** The frozen shape a candidate must satisfy. See the blocker note below. */
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
 * ────────────────────────────────────────────────────────────────────────────
 * T011 IS BLOCKED, AND DELIBERATELY NOT IMPLEMENTED BY GUESSWORK.
 *
 * `freezeHumanUnitDefinition` cannot be written as specified. Two fields of
 * `FrozenHumanUnitDefinition` have no accepted-contract column to derive from:
 *
 *   - `outputSchema`            — data-model.md §4 calls it "the frozen
 *                                 JSON-schema-shaped description the candidate
 *                                 must satisfy"
 *   - `requiredArtifactKinds`   — "declared artifacts the candidate must carry"
 *
 * Verified against the repository, not assumed: neither name, nor
 * `expectedOutputs`, appears anywhere in `prisma/schema.prisma` or `src/`.
 * `TaskExecutionPlanStep` carries `title`, `description`, `verificationMethod`,
 * `acceptanceCriteria`, `params`, the effort columns and the frozen economics —
 * and nothing that describes the SHAPE of a human deliverable.
 *
 * The three ways out are all design decisions, not coding details:
 *
 *   A. Derive both from the cut's existing `params` Json. Cheapest, but for a
 *      human step `primitiveId` is null and `params` is validated by the
 *      capability schemas, so in practice it is null — this would freeze an
 *      empty requirement on every real unit.
 *   B. Add the two columns to `TaskExecutionPlanStep` and have the planner
 *      populate them. They would be null on every already-accepted plan, so
 *      those plans fail closed to human — consistent with how the frozen
 *      economics columns already behave, and the most honest option.
 *   C. Make a frozen output contract a precondition of admission, so a cut
 *      without one is refused rather than admitted with no requirement. This
 *      adds a fourth refusal cause and changes the admission contract.
 *
 * Implementing any of these silently would put an obligation on a worker that
 * the client never accepted, or accept a candidate against no requirement at
 * all — both of which are the exact failure FR-002 and FR-035 exist to prevent.
 * So this stops here for a founder decision rather than resolving itself.
 *
 * Nothing downstream is blocked by the gap: `human-unit-result-schema.ts`
 * (T012) compiles and validates whatever shape is chosen, and is complete.
 * ────────────────────────────────────────────────────────────────────────────
 */
