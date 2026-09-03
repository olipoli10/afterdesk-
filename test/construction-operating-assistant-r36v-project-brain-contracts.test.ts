import { describe, expect, it } from "vitest";
import {
  PROJECT_BRAIN_MAX_SOURCE_BYTES,
  buildCanonicalProjectBrainSnapshot,
  hashProjectBrainCommand,
  normalizeProjectBrainOwnerBrief,
  projectBrainCommandSchema,
  projectBrainIntakeProjectionSchema,
  projectBrainSourceCommandSchema,
} from "@/lib/construction-operating-assistant-r36v/project-brain-intake";

const commandId = "36360000-0000-4000-8000-000000000001";

const createCommand = {
  schemaVersion: 1,
  action: "CREATE_PROJECT_BRAIN_INTAKE",
  commandId,
  workspaceId: "workspace-1",
  projectId: "project-1",
} as const;

const ownerBrief = {
  summary: "  Rénovation complète de la cuisine.  ",
  scope: " Armoires, dosseret et peinture. ",
  importantPeople: " Marc — fournisseur. ",
  importantDates: " Livraison mardi. ",
  blockers: " Couleur finale à confirmer. ",
  nextDecision: " Choisir la couleur du coulis. ",
};

describe("R36V Project Brain intake contracts", () => {
  it("accepts only a strict versioned command and refuses provider control fields", () => {
    expect(projectBrainCommandSchema.parse(createCommand)).toEqual(createCommand);
    expect(() => projectBrainCommandSchema.parse({
      ...createCommand,
      provider: "openrouter",
    })).toThrow();
    expect(() => projectBrainCommandSchema.parse({
      ...createCommand,
      workspaceId: "",
    })).toThrow();
    expect(() => projectBrainCommandSchema.parse({
      ...createCommand,
      schemaVersion: 2,
    })).toThrow();
  });

  it("normalizes bounded owner text without treating it as model output", () => {
    expect(normalizeProjectBrainOwnerBrief(ownerBrief)).toEqual({
      summary: "Rénovation complète de la cuisine.",
      scope: "Armoires, dosseret et peinture.",
      importantPeople: "Marc — fournisseur.",
      importantDates: "Livraison mardi.",
      blockers: "Couleur finale à confirmer.",
      nextDecision: "Choisir la couleur du coulis.",
    });

    expect(() => normalizeProjectBrainOwnerBrief({
      ...ownerBrief,
      summary: " ",
    })).toThrow();
  });

  it("admits only the bounded declared local source vocabulary", () => {
    const document = {
      schemaVersion: 1,
      action: "ADMIT_PROJECT_BRAIN_SOURCE",
      commandId: "36360000-0000-4000-8000-000000000002",
      workspaceId: "workspace-1",
      projectId: "project-1",
      intakeId: "intake-1",
      expectedStateVersion: 2,
      kind: "DOCUMENT",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4_096,
      durationMs: null,
    } as const;

    expect(projectBrainSourceCommandSchema.parse(document)).toEqual(document);
    expect(() => projectBrainSourceCommandSchema.parse({
      ...document,
      sizeBytes: PROJECT_BRAIN_MAX_SOURCE_BYTES + 1,
    })).toThrow();
    expect(() => projectBrainSourceCommandSchema.parse({
      ...document,
      mimeType: "text/plain",
    })).toThrow();
    expect(() => projectBrainSourceCommandSchema.parse({
      ...document,
      durationMs: 60_000,
    })).toThrow();
    expect(() => projectBrainSourceCommandSchema.parse({
      ...document,
      transcript: "invented",
    })).toThrow();
  });

  it("builds the same review fingerprint regardless of source query order", () => {
    const input = {
      project: { id: "project-1", code: "LAVAL-001", name: "Rénovation Laval" },
      ownerBrief: normalizeProjectBrainOwnerBrief(ownerBrief),
      sources: [
        {
          sourceId: "source-2",
          ordinal: 2,
          kind: "VOICE_NOTE" as const,
          displayName: "explication.m4a",
          contentHash: "b".repeat(64),
        },
        {
          sourceId: "source-1",
          ordinal: 1,
          kind: "DOCUMENT" as const,
          displayName: "plan.pdf",
          contentHash: "a".repeat(64),
        },
      ],
    };

    const first = buildCanonicalProjectBrainSnapshot(input);
    const second = buildCanonicalProjectBrainSnapshot({
      ...input,
      sources: [...input.sources].reverse(),
    });

    expect(first).toEqual(second);
    expect(first.canonicalHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.snapshot.ownerBrief.provenance).toBe("OWNER_CONFIRMED");
    expect(first.snapshot.sources.map((source) => source.sourceId)).toEqual([
      "source-1",
      "source-2",
    ]);
    expect(first.snapshot.limitations).toEqual([
      "VOICE_NOT_TRANSCRIBED",
      "DOCUMENT_CONTENT_NOT_INTERPRETED",
    ]);
    expect(JSON.stringify(first.snapshot)).not.toMatch(/transcript|ocr|extractedText/iu);
  });

  it("hashes command bodies deterministically and binds every changed field", () => {
    const first = hashProjectBrainCommand(createCommand);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(hashProjectBrainCommand({ ...createCommand })).toBe(first);
    expect(hashProjectBrainCommand({ ...createCommand, projectId: "project-2" })).not.toBe(first);
  });

  it("accepts only a provider-free, transport-free projection", () => {
    const projection = {
      schemaVersion: 1,
      intake: null,
      limitations: [
        "VOICE_NOT_TRANSCRIBED",
        "DOCUMENT_CONTENT_NOT_INTERPRETED",
      ],
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    } as const;

    expect(projectBrainIntakeProjectionSchema.parse(projection)).toEqual(projection);
    expect(() => projectBrainIntakeProjectionSchema.parse({
      ...projection,
      providerExecutionPerformed: true,
    })).toThrow();
    expect(() => projectBrainIntakeProjectionSchema.parse({
      ...projection,
      providerModel: "hidden",
    })).toThrow();
  });
});
