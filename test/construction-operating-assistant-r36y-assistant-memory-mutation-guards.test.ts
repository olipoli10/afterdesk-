import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const contract = readFileSync(join(root, "src/lib/construction-operating-assistant-r36y/project-brain-assistant-memory.ts"), "utf8");
const service = readFileSync(join(root, "src/server/construction-operating-assistant-r36y/project-brain-assistant-memory.ts"), "utf8");
const migration = readFileSync(join(root, "prisma/migrations/20260904040000_construction_assistant_r36y_project_brain_assistant_memory/migration.sql"), "utf8");
const mobile = readFileSync(join(root, "apps/mobile/src/app/(app)/assistant.tsx"), "utf8");

describe("R36Y assistant-memory mutation guards", () => {
  it("reads only the latest exact confirmed memory and never upgrades unsupported material", () => {
    expect(service).toContain('where: { workspaceId: input.workspaceId, projectId: input.projectId, status: "CONFIRMED" }');
    expect(service).toContain('orderBy: [{ confirmedUnderstandingSequence: "desc" }, { id: "desc" }]');
    expect(service).toContain('if (!resolution) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE")');
    expect(contract).toContain('candidate.disposition !== "ACCEPT_AS_REVIEWED"');
    expect(contract).toContain('input.questionKind === "REVIEWED_SOURCE_INVENTORY"');
    expect(contract).toContain('if (values.length !== citations.length) throw new Error("PROJECT_BRAIN_MEMORY_CITATION_INCOMPLETE")');
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "CPBMC_provenance_guard"');
  });

  it("keeps the question and prepared-action surface closed and visibly reviewable", () => {
    expect(contract).toContain('"NEXT_DECISION",');
    expect(contract).toContain('"EMAIL",');
    expect(contract).not.toContain('"ASK_ANYTHING",');
    expect(contract).not.toContain('"SEARCH",');
    expect(service).toContain('status: "PREPARED_UNSENT", approvalRequired: true, citations');
    expect(mobile).toContain('{copy.assistantMemory.exactMessage}: {preparedAction.body}');
  });

  it("keeps stale-state, replay, command binding, tenant and immutable-history guards", () => {
    expect(service).toContain('command.expectedConfirmedUnderstandingSequence !== memory.confirmedUnderstandingSequence');
    expect(service).toContain('command.expectedMemoryCanonicalHash !== memory.memoryCanonicalHash');
    expect(service).toContain('if (replay) return replay;');
    expect(service).toContain('decision.commandHash !== commandHash');
    expect(service).toContain('id: command.recipientContactRef, workspaceId: command.workspaceId, projectId: command.projectId');
    expect(migration).toContain('CREATE TRIGGER "CPBRR_immutable"');
    expect(migration).toContain('CREATE TRIGGER "CPBRR_no_truncate"');
  });
});
