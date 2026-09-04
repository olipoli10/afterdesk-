import { describe, expect, it } from "vitest";
import {
  buildProjectBrainUnderstandingSnapshot,
  deriveContradictionOutcomes,
  projectBrainUnderstandingCommandSchema,
  projectBrainUnderstandingProjectionSchema,
} from "@/lib/construction-operating-assistant-r36x/project-brain-understanding-review";

const hash = "a".repeat(64);
const base = {
  schemaVersion: 1 as const,
  commandId: "127600fe-d3a1-4a29-928e-4810d8635e72",
  workspaceId: "workspace-a",
  projectId: "project-a",
};

describe("R36X understanding contracts", () => {
  it("keeps every command strict and confirmation fingerprint-bound", () => {
    const create = { ...base, action: "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW" as const };
    expect(projectBrainUnderstandingCommandSchema.parse(create)).toEqual(create);
    expect(() => projectBrainUnderstandingCommandSchema.parse({ ...create, candidateBatchId: "client-controlled" })).toThrow();
    const confirm = {
      ...base,
      action: "CONFIRM_PROJECT_BRAIN_UNDERSTANDING" as const,
      reviewId: "review-a",
      expectedStateVersion: 8,
      reviewFingerprint: hash,
    };
    expect(projectBrainUnderstandingCommandSchema.parse(confirm)).toEqual(confirm);
    expect(() => projectBrainUnderstandingCommandSchema.parse({ ...confirm, snapshot: {} })).toThrow();
  });

  it("derives each explicit contradiction mode without a default winner", () => {
    expect(deriveContradictionOutcomes({
      memberCandidateIds: ["a", "b"],
      resolution: { mode: "SELECT_SUPPORTED_CANDIDATES", selectedCandidateIds: ["b"] },
    })).toEqual({ a: "REJECT_AS_UNSUPPORTED", b: "ACCEPT_AS_REVIEWED" });
    expect(deriveContradictionOutcomes({
      memberCandidateIds: ["a", "b"],
      resolution: { mode: "REJECT_ALL_UNSUPPORTED" },
    })).toEqual({ a: "REJECT_AS_UNSUPPORTED", b: "REJECT_AS_UNSUPPORTED" });
    expect(deriveContradictionOutcomes({
      memberCandidateIds: ["a", "b"],
      resolution: { mode: "OWNER_RESOLUTION", ownerResolutionText: "Le propriétaire confirme mardi." },
    })).toEqual({ a: "REJECT_AS_UNSUPPORTED", b: "REJECT_AS_UNSUPPORTED" });
    expect(() => deriveContradictionOutcomes({
      memberCandidateIds: ["a", "b"],
      resolution: { mode: "SELECT_SUPPORTED_CANDIDATES", selectedCandidateIds: ["foreign"] },
    })).toThrow("PROJECT_BRAIN_CONTRADICTION_NON_MEMBER");
  });

  it("builds a deterministic complete snapshot and keeps candidates unconfirmed", () => {
    const snapshot = buildProjectBrainUnderstandingSnapshot({
      project: { id: "project-a", code: "LAVAL-001", name: "Rénovation Laval" },
      inputs: { intakeId: "intake-a", confirmedIntakeSnapshotHash: hash, candidateBatchId: "batch-a", candidateSetHash: hash },
      sources: [],
      candidates: [{
        candidateId: "candidate-a", value: "Marc", status: "CANDIDATE_UNCONFIRMED",
        provenance: { kind: "OWNER_TEXT", ownerBriefField: "importantPeople", rangeUnit: "UTF16_CODE_UNIT", rangeStart: 0, rangeEnd: 4 },
        disposition: "ACCEPT_AS_REVIEWED",
      }],
      contradictions: [],
      ownerResolutions: [],
      limitations: ["CANDIDATES_REQUIRE_EXPLICIT_REVIEW"],
    });
    expect(snapshot.snapshot.candidates[0].status).toBe("CANDIDATE_UNCONFIRMED");
    expect(snapshot.canonicalHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(projectBrainUnderstandingProjectionSchema.shape.falseEffects.parse({
      providerExecutionPerformed: false,
      binaryUnderstandingPerformed: false,
      externalTransportPerformed: false,
      externalWritePerformed: false,
      automaticResolutionPerformed: false,
      automaticConfirmationPerformed: false,
    })).toBeTruthy();
  });
});
