import { describe, expect, it } from "vitest";
import {
  freezeHumanUnitDefinition,
  type AcceptedPlanStepRow,
  type FrozenEligibility,
  type FrozenUnitSettings,
} from "@/lib/ai-work-engine/human-unit-definition";
import { compileFrozenOutputSchema } from "@/lib/ai-work-engine/human-unit-result-schema";

/**
 * THE FREEZE COPIES; IT NEVER AUTHORS.
 *
 * A human work unit is an obligation a person is held to on a mandate a client
 * has already paid for. Every word of it must trace to a column of the accepted
 * plan step or to a frozen setting — because the moment the freeze can
 * CONSTRUCT an obligation, "the unit adds nothing beyond that accepted step"
 * stops being a property of the code and becomes a promise about whoever wrote
 * the call site (FR-002, FR-035, readiness CHK020).
 *
 * The structural half of that guarantee is the input type: there is no
 * parameter through which an operator-authored instruction, input, output,
 * artifact or acceptance obligation can enter. The behavioural half is here.
 */

const outputSchema = {
  type: "object",
  properties: { summary: { type: "string" }, rowsChecked: { type: "number" } },
  required: ["summary", "rowsChecked"],
};

const cut = (over: Partial<AcceptedPlanStepRow> = {}): AcceptedPlanStepRow => ({
  id: "step_1",
  order: 2,
  title: "Confirm the decision-maker",
  description: "Check each row against a second independent source.",
  verificationMethod: "sample_check",
  acceptanceCriteria: ["Every row carries a named source."],
  humanOutputSchema: outputSchema,
  humanRequiredArtifactKinds: ["source_file"],
  fixedMinutes: 30,
  secondsPerUnit: null,
  estimatedMinutesOptimistic: 20,
  estimatedMinutesLikely: 30,
  estimatedMinutesConservative: 45,
  ...over,
});

const settings: FrozenUnitSettings = {
  revisionBound: 2,
  publicationDeadlineHours: 72,
  submissionDeadlineHours: 72,
  claimLeaseHours: 72,
};

const eligibility: FrozenEligibility = {
  categorySlug: "research",
  tier: "standard",
  requireCategoryCertification: false,
  highValueThreshold: 4,
  minRatedDeliveries: 3,
  maxActiveClaims: 3,
};

const freeze = (over: Partial<AcceptedPlanStepRow> = {}) =>
  freezeHumanUnitDefinition({
    planVersionId: "pv_1",
    cut: cut(over),
    acceptedTaskPayoutCents: 4_000,
    acceptedEstimatedMinutes: 60,
    dataClass: "business_confidential",
    declaredInputs: [
      { kind: "snapshot_file", ref: "file_1", label: "Source list", dataClass: "business_confidential" },
    ],
    settings,
    eligibility,
  });

describe("every field traces to an accepted column or a frozen setting", () => {
  it("copies the obligations verbatim off the accepted step", () => {
    const frozen = freeze();
    expect(frozen).not.toBeNull();
    expect(frozen!.outputSchema).toEqual(outputSchema);
    expect(frozen!.requiredArtifactKinds).toEqual(["source_file"]);
    expect(frozen!.acceptanceCriteria).toEqual(["Every row carries a named source."]);
    expect(frozen!.verificationMethod).toBe("sample_check");
  });

  it("builds the instructions from the step's own title and description", () => {
    const frozen = freeze();
    expect(frozen!.instructions).toContain("Confirm the decision-maker");
    expect(frozen!.instructions).toContain("second independent source");
  });

  it("carries the frozen settings through unchanged", () => {
    const frozen = freeze();
    expect(frozen!.revisionBound).toBe(2);
    expect(frozen!.publicationDeadlineHours).toBe(72);
    expect(frozen!.submissionDeadlineHours).toBe(72);
    expect(frozen!.claimLeaseHours).toBe(72);
  });

  it("records the economic provenance the admission test actually read", () => {
    const frozen = freeze();
    expect(frozen!.economicProvenance).toEqual({
      planStepId: "step_1",
      fixedMinutes: 30,
      secondsPerUnit: null,
      pertOptimistic: 20,
      pertLikely: 30,
      pertConservative: 45,
      acceptedTaskPayoutCents: 4_000,
      acceptedEstimatedMinutes: 60,
    });
  });

  it("freezes eligibility CRITERIA, which is not the same as a worker's facts", () => {
    // FR-009: the criteria are frozen at admission so a platform configuration
    // change affects only later units, while the worker's own status, score and
    // certificates are read live at every point of use.
    expect(freeze()!.eligibility).toEqual(eligibility);
  });

  it("keeps expectedMinutes descriptive and out of every duration", () => {
    const frozen = freeze({ estimatedMinutesLikely: 30 });
    expect(frozen!.expectedMinutes).toBe(30);
    // FR-058: no deadline may be a function of it.
    const longer = freeze({ estimatedMinutesLikely: 6_000 });
    expect(longer!.publicationDeadlineHours).toBe(frozen!.publicationDeadlineHours);
    expect(longer!.submissionDeadlineHours).toBe(frozen!.submissionDeadlineHours);
    expect(longer!.claimLeaseHours).toBe(frozen!.claimLeaseHours);
    expect(longer!.revisionBound).toBe(frozen!.revisionBound);
  });

  it("names admin as the reviewer authority — a column, not a new role", () => {
    expect(freeze()!.reviewerAuthority).toBe("admin");
  });

  it("carries the mandate data class", () => {
    expect(freeze()!.dataClass).toBe("business_confidential");
  });
});

describe("fail closed when the accepted step carries no output contract", () => {
  /**
   * THE LOAD-BEARING FREEZE TEST.
   *
   * A plan accepted before these columns existed has null in both. Inventing a
   * default here would put an obligation on a worker that no client ever
   * accepted, and accepting anything at all would mean the submission gate has
   * nothing to check. Both are refusals, so the unit is simply not admitted and
   * the mandate stays on the existing manual path — exactly how every plan
   * behaved before this feature.
   */
  it("refuses a legacy step with a null output schema", () => {
    expect(freeze({ humanOutputSchema: null })).toBeNull();
  });

  it("refuses an output schema that will not compile", () => {
    expect(freeze({ humanOutputSchema: { type: "unicorn" } })).toBeNull();
    expect(freeze({ humanOutputSchema: {} })).toBeNull();
    expect(freeze({ humanOutputSchema: { type: "object", properties: {} } })).toBeNull();
    expect(freeze({ humanOutputSchema: "a schema" as unknown as object })).toBeNull();
  });

  it("agrees exactly with the compiler about what is usable", () => {
    // The freeze must not admit a contract the submission gate would later
    // refuse to compile: that would strand a worker who can never submit.
    for (const candidate of [
      null,
      {},
      { type: "object" },
      { type: "object", properties: {} },
      { type: "unicorn" },
      outputSchema,
    ]) {
      const compiles = compileFrozenOutputSchema(candidate) !== null;
      const frozen = freeze({ humanOutputSchema: candidate as object | null });
      expect(frozen !== null, JSON.stringify(candidate)).toBe(compiles);
    }
  });

  it("admits a step that requires no artifacts, which is not the same as no contract", () => {
    const frozen = freeze({ humanRequiredArtifactKinds: [] });
    expect(frozen).not.toBeNull();
    expect(frozen!.requiredArtifactKinds).toEqual([]);
  });

  it("never throws on a hostile stored row", () => {
    for (const bad of [undefined, 42, [], () => {}]) {
      expect(() => freeze({ humanOutputSchema: bad as object })).not.toThrow();
      expect(freeze({ humanOutputSchema: bad as object })).toBeNull();
    }
  });
});

describe("the freeze is pure and cannot be talked into more", () => {
  it("is deterministic", () => {
    expect(freeze()).toEqual(freeze());
  });

  it("does not mutate the accepted row it was given", () => {
    const row = cut();
    const before = JSON.stringify(row);
    freezeHumanUnitDefinition({
      planVersionId: "pv_1",
      cut: row,
      acceptedTaskPayoutCents: 4_000,
      acceptedEstimatedMinutes: 60,
      dataClass: "business_confidential",
      declaredInputs: [],
      settings,
      eligibility,
    });
    expect(JSON.stringify(row)).toBe(before);
  });

  /**
   * A later mutation of the object the freeze returned, or of the row it read,
   * must not change what was frozen. The definition is written once and read by
   * every party forever; sharing a reference with the caller would make "frozen"
   * a matter of nobody happening to touch it.
   */
  it("does not alias the accepted row's arrays or objects", () => {
    const row = cut();
    const frozen = freeze()!;
    expect(frozen.acceptanceCriteria).not.toBe(row.acceptanceCriteria);
    expect(frozen.requiredArtifactKinds).not.toBe(row.humanRequiredArtifactKinds);
    frozen.acceptanceCriteria.push("smuggled obligation");
    expect(cut().acceptanceCriteria).toEqual(["Every row carries a named source."]);
  });

  it("carries the declared inputs it was given and nothing more", () => {
    const frozen = freeze()!;
    expect(frozen.declaredInputs).toHaveLength(1);
    expect(frozen.declaredInputs[0].ref).toBe("file_1");
  });
});
