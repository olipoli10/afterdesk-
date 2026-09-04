import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const contract = readFileSync(join(root, "src/lib/construction-operating-assistant-r36w/project-brain-fact-candidates.ts"), "utf8");
const service = readFileSync(join(root, "src/server/construction-operating-assistant-r36w/project-brain-fact-candidates.ts"), "utf8");
const migration = readFileSync(join(root, "prisma/migrations/20260903220000_construction_assistant_r36w_project_brain_fact_candidates/migration.sql"), "utf8");

describe("R36W mutation guards", () => {
  it("pins the closed deterministic adapter boundary", () => {
    expect(contract).toContain('export const FACT_CANDIDATE_ADAPTERS = [\n  "OWNER_BRIEF_FIELDS_V1",\n  "ADMITTED_SOURCE_METADATA_V1",\n] as const;');
    expect(contract).toContain("const value = input.ownerBrief[ownerBriefField];");
    expect(contract).toContain("rangeEnd: value.length,");
    expect(contract).not.toContain("requestMetadata");
    expect(contract).toContain("displayName: source.displayName,");
    expect(contract).toContain('adapter: "ADMITTED_SOURCE_METADATA_V1",\n        kind: "SOURCE_METADATA",');
    expect(contract).toContain('status: "CANDIDATE_UNCONFIRMED" as const,');
    expect(contract).not.toMatch(/confidence\s*:\s*0\./u);
  });

  it("pins replay, body binding, tenant scoping and atomic receipt creation", () => {
    expect(service).toContain("if (priorDecision.commandHash !== commandHash)");
    expect(service).toContain("if (equivalent) {");
    expect(service).not.toContain("if (false && equivalent)");
    expect(service).toContain("where: { workspaceId: input.workspaceId, projectId: input.projectId, intakeId: input.intakeId },");
    expect(service).not.toContain("if (false) await tx.constructionProjectBrainFactCandidateDecision.create");
    const candidateWrite = service.lastIndexOf("await tx.constructionProjectBrainFactCandidate.createMany");
    const receiptWrite = service.lastIndexOf("await tx.constructionProjectBrainFactCandidateDecision.create");
    expect(candidateWrite).toBeGreaterThan(-1);
    expect(receiptWrite).toBeGreaterThan(candidateWrite);
  });

  it("pins append-only update, delete and truncate guards", () => {
    for (const table of [
      "ConstructionProjectBrainFactCandidateBatch",
      "ConstructionProjectBrainFactCandidate",
      "ConstructionProjectBrainFactCandidateDecision",
    ]) {
      expect(migration).toContain(`CREATE TRIGGER "${table}_immutable" BEFORE UPDATE OR DELETE ON "${table}"`);
      expect(migration).toContain(`CREATE TRIGGER "${table}_no_truncate" BEFORE TRUNCATE ON "${table}"`);
    }
  });
});
