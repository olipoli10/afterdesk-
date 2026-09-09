import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
// These are source-substring guards, not byte-exact evidence hashes.
const service = readFileSync(join(root, "src/server/construction-operating-assistant-r36x/project-brain-understanding-review.ts"), "utf8").replaceAll("\r\n", "\n");
const contract = readFileSync(join(root, "src/lib/construction-operating-assistant-r36x/project-brain-understanding-review.ts"), "utf8").replaceAll("\r\n", "\n");
const migration = readFileSync(join(root, "prisma/migrations/20260904010000_construction_assistant_r36x_project_brain_understanding/migration.sql"), "utf8").replaceAll("\r\n", "\n");

describe("R36X mutation guards", () => {
  it("keeps authorization, binding, completeness, matrix and replay guards", () => {
    expect(service).toContain('new Set(["owner", "admin"])');
    expect(migration).toContain('candidate."batchId" = review."candidateBatchId"');
    expect(service).toContain('if (!current) throw new Error("PROJECT_BRAIN_UNDERSTANDING_INCOMPLETE")');
    expect(service).toContain('if (prior && prior !== outcome) throw new Error("CONFLICTING_RESOLUTIONS")');
    expect(service).toContain('if (expected && expected !== decision.disposition) throw new Error("CONFLICTING_RESOLUTIONS")');
    expect(service).toContain('if (dispositions.size !== exact.candidateBatch.candidates.length)');
    expect(service).toContain('review.reviewFingerprint !== command.reviewFingerprint');
    expect(service).toContain('if (prior) {\n      if (prior.commandHash !== commandHash)');
    expect(service).toContain('stateVersion: 1, status: "DRAFT", reviewFingerprint: null, canonicalEffectId: reviewId });\n      await tx.constructionProjectBrainUnderstandingDecision.create');
    expect(service).toContain('project:${command.workspaceId}:${command.projectId}:confirm');
  });

  it("keeps strict non-automatic canonical coverage", () => {
    expect(contract).not.toContain('z.literal("AUTOMATIC")');
    expect(contract).toContain('candidates: [...input.candidates].sort');
    expect(contract).toContain('selected.has(candidateId) ? "ACCEPT_AS_REVIEWED" : "REJECT_AS_UNSUPPORTED"');
  });

  it("keeps append-only, membership, sequence and false-effect database backstops", () => {
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "CPBUCM_candidate_guard"');
    expect(migration).toContain('CREATE TRIGGER "CPBUCM_immutable"');
    expect(migration).toContain('CREATE TRIGGER "CPBURes_immutable"');
    expect(migration).toContain('CREATE TRIGGER "CPBUSnap_immutable"');
    expect(migration).toContain('CREATE UNIQUE INDEX "CPBUR_confirmed_sequence_key"');
    expect(migration).toContain('"automaticResolutionPerformed":false');
  });
});
