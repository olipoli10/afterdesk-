import { describe, expect, it } from "vitest";
import {
  assertEqualControlInputs,
  founderObservationSubmissionSchema,
} from "../specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/observation-contract";
import sequence from "../specs/078-construction-assistant-v1-r2-founder-observed-loop/fixtures/equal-input-sequence.json";

const validObservation = {
  schemaVersion: 1,
  observer: "Olivier",
  founderCompleted: true,
  sessionStartedAtUtc: "2026-08-31T13:00:00.000Z",
  sessionCompletedAtUtc: "2026-08-31T13:10:00.000Z",
  clarificationUnderstandabilityRating: 4,
  approvalComprehensionRating: 4,
  founderCorrectionCount: 0,
  founderActiveMinutes: 10,
  manualContextRestatementCount: 0,
  nextDecisionIdentified: true,
  actionabilityRating: 4,
  observableAdvantageRating: 1,
  observedManagedAdvantages: ["DUPLICATE_REPLAY_REFUSAL", "EXACT_APPROVAL"],
  founderNotes: "Observation locale.",
};

describe("founder observation contract RED", () => {
  it("founder-observation-is-replaced-by-fixture", () => {
    expect(() => founderObservationSubmissionSchema.parse({ ...validObservation, observer: "fixture" })).toThrow();
  });

  it("timer-starts-before-founder-action", () => {
    expect(() => founderObservationSubmissionSchema.parse({
      ...validObservation,
      sessionCompletedAtUtc: validObservation.sessionStartedAtUtc,
    })).toThrow("SESSION_TIMER_INVALID");
  });

  it("unknown-observation-field-is-accepted", () => {
    expect(() => founderObservationSubmissionSchema.parse({ ...validObservation, hiddenVerdict: "PASS" })).toThrow();
  });

  it("stateless-control-receives-fewer-facts", () => {
    const drift = structuredClone(sequence) as { orderedInputs: string[] };
    drift.orderedInputs = drift.orderedInputs.slice(1);
    expect(() => assertEqualControlInputs(sequence, drift)).toThrow();
  });

  it("observation-input-order-drifts", () => {
    const drift = structuredClone(sequence) as { orderedInputs: string[] };
    [drift.orderedInputs[0], drift.orderedInputs[1]] = [drift.orderedInputs[1], drift.orderedInputs[0]];
    expect(() => assertEqualControlInputs(sequence, drift)).toThrow();
  });
});
