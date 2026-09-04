import { describe, expect, it } from "vitest";
import {
  buildProjectBrainMemoryAnswer,
  projectBrainAssistantCommandSchema,
  projectBrainAssistantFalseEffectsSchema,
} from "@/lib/construction-operating-assistant-r36y/project-brain-assistant-memory";

const hash = "a".repeat(64);
const base = {
  schemaVersion: 1 as const,
  commandId: "127600fe-d3a1-4a29-928e-4810d8635e72",
  workspaceId: "workspace-a",
  projectId: "project-a",
  expectedConfirmedUnderstandingSequence: 7,
  expectedMemoryCanonicalHash: hash,
};

describe("R36Y assistant memory contracts", () => {
  it("accepts only the closed recall registry and strict versioned bodies", () => {
    const command = { ...base, action: "RECALL_CONFIRMED_PROJECT_MEMORY" as const, questionKind: "NEXT_DECISION" as const };
    expect(projectBrainAssistantCommandSchema.parse(command)).toEqual(command);
    expect(() => projectBrainAssistantCommandSchema.parse({ ...command, questionKind: "ASK_ANYTHING" })).toThrow();
    expect(() => projectBrainAssistantCommandSchema.parse({ ...command, rawSnapshot: {} })).toThrow();
  });

  it("builds deterministic answers from reviewed owner text with ordered citations", () => {
    const answer = buildProjectBrainMemoryAnswer({
      questionKind: "NEXT_DECISION",
      snapshot: {
        schemaVersion: 1,
        project: { id: "project-a", code: "LAVAL-001", name: "Rénovation Laval" },
        inputs: { intakeId: "intake-a", confirmedIntakeSnapshotHash: hash, candidateBatchId: "batch-a", candidateSetHash: hash },
        sources: [],
        candidates: [{ candidateId: "candidate-a", value: "Faire approuver le devis", status: "CANDIDATE_UNCONFIRMED", provenance: { kind: "OWNER_TEXT", ownerBriefField: "nextDecision", rangeUnit: "UTF16_CODE_UNIT", rangeStart: 0, rangeEnd: 24 }, disposition: "ACCEPT_AS_REVIEWED" }],
        contradictions: [], ownerResolutions: [], limitations: ["CANDIDATES_REQUIRE_EXPLICIT_REVIEW"],
      },
      confirmedSnapshotId: "snapshot-a", confirmationDecisionId: "decision-a",
      dispositionIdsByCandidateId: new Map([["candidate-a", "disposition-a"]]),
      resolutionIdsByContradictionId: new Map(),
    });
    expect(answer.answerKind).toBe("CONFIRMED_VALUES");
    expect(answer.values).toEqual(["Faire approuver le devis"]);
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0]).toMatchObject({ citationKind: "REVIEWED_CANDIDATE", candidateId: "candidate-a" });
  });

  it("keeps every consequential effect explicitly false", () => {
    expect(projectBrainAssistantFalseEffectsSchema.parse({
      providerExecutionPerformed: false, binaryUnderstandingPerformed: false,
      externalTransportPerformed: false, externalWritePerformed: false,
      approvalPerformed: false, automaticResolutionPerformed: false,
    })).toBeTruthy();
  });
});
