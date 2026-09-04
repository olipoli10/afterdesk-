import { describe, expect, it } from "vitest";
import {
  FACT_CANDIDATE_ADAPTERS,
  FACT_CANDIDATE_METADATA_FIELDS,
  FACT_CANDIDATE_OWNER_FIELDS,
  buildProjectBrainFactCandidates,
  factCandidateGenerationCommandSchema,
  projectBrainFactCandidateProjectionSchema,
} from "@/lib/construction-operating-assistant-r36w/project-brain-fact-candidates";

const hash = "a".repeat(64);

describe("R36W fact candidate contracts", () => {
  it("keeps the adapter and field registries closed", () => {
    expect(FACT_CANDIDATE_ADAPTERS).toEqual([
      "OWNER_BRIEF_FIELDS_V1",
      "ADMITTED_SOURCE_METADATA_V1",
    ]);
    expect(FACT_CANDIDATE_OWNER_FIELDS).toEqual([
      "summary", "scope", "importantPeople", "importantDates", "blockers", "nextDecision",
    ]);
    expect(FACT_CANDIDATE_METADATA_FIELDS).toEqual([
      "kind", "displayName", "mimeType", "sizeBytes", "durationMs", "ordinal", "contentHash",
    ]);
    const command = {
      schemaVersion: 1,
      action: "GENERATE_PROJECT_BRAIN_FACT_CANDIDATES",
      commandId: "cf8e02be-70d7-47e6-89ad-b8e78266db64",
      workspaceId: "workspace-a",
      projectId: "project-a",
      intakeId: "intake-a",
      confirmedSnapshotHash: hash,
      adapterSetVersion: "PROJECT_BRAIN_FACT_CANDIDATES_V1",
    };
    expect(factCandidateGenerationCommandSchema.parse(command)).toEqual(command);
    expect(() => factCandidateGenerationCommandSchema.parse({ ...command, adapter: "MODEL_V1" })).toThrow();
  });

  it("copies Unicode owner text with exact UTF-16 ranges and metadata as metadata", () => {
    const candidates = buildProjectBrainFactCandidates({
      workspaceId: "workspace-a",
      projectId: "project-a",
      intakeId: "intake-a",
      confirmedSnapshotId: "snapshot-a",
      confirmedSnapshotHash: hash,
      ownerBrief: {
        summary: "Dosseret 👷🏽‍♂️ terminé",
        scope: "",
        importantPeople: "Marc",
        importantDates: "mardi",
        blockers: "",
        nextDecision: "Facturer",
      },
      sources: [{
        id: "source-a",
        ordinal: 1,
        kind: "PHOTO",
        displayName: "preuve.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 123,
        durationMs: null,
        contentHash: hash,
      }],
    });
    const summary = candidates.find((candidate) => candidate.ownerBriefField === "summary")!;
    expect(summary.value).toBe("Dosseret 👷🏽‍♂️ terminé");
    expect(summary.rangeEnd).toBe(summary.value.length);
    expect(summary.value.slice(summary.rangeStart!, summary.rangeEnd!)).toBe(summary.value);
    expect(summary).toMatchObject({
      kind: "OWNER_TEXT",
      status: "CANDIDATE_UNCONFIRMED",
      confidenceClass: "EXACT_OWNER_TEXT",
      rangeUnit: "UTF16_CODE_UNIT",
    });
    const mime = candidates.find((candidate) => candidate.metadataField === "mimeType")!;
    expect(mime).toMatchObject({
      kind: "SOURCE_METADATA",
      confidenceClass: "EXACT_CANONICAL_METADATA",
      value: "image/jpeg",
      sourceId: "source-a",
    });
    expect(Object.fromEntries(
      candidates
        .filter((candidate) => candidate.kind === "SOURCE_METADATA")
        .map((candidate) => [candidate.metadataField, candidate.value]),
    )).toEqual({
      kind: "PHOTO",
      displayName: "preuve.jpg",
      mimeType: "image/jpeg",
      sizeBytes: "123",
      ordinal: "1",
      contentHash: hash,
    });
    expect(candidates.some((candidate) => candidate.metadataField === "durationMs")).toBe(false);
  });

  it("rejects probability, confirmation and unknown projection members", () => {
    const candidate = buildProjectBrainFactCandidates({
      workspaceId: "w", projectId: "p", intakeId: "i", confirmedSnapshotId: "s",
      confirmedSnapshotHash: hash,
      ownerBrief: { summary: "x", scope: "", importantPeople: "", importantDates: "", blockers: "", nextDecision: "" },
      sources: [],
    })[0];
    expect(projectBrainFactCandidateProjectionSchema.parse(candidate)).toEqual(candidate);
    expect(() => projectBrainFactCandidateProjectionSchema.parse({ ...candidate, confidence: 0.99 })).toThrow();
    expect(() => projectBrainFactCandidateProjectionSchema.parse({ ...candidate, status: "CONFIRMED" })).toThrow();
  });
});
