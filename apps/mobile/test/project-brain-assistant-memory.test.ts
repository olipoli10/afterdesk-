import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProjectBrainRecallCommand, projectBrainAssistantMemoryRoute } from "../src/lib/project-brain-assistant-memory";

describe("mobile Project Brain assistant memory", () => {
  it("builds a strict current-memory command from project navigation", () => {
    const command = createProjectBrainRecallCommand({ workspaceId: "workspace-a", projectId: "project-a", confirmedUnderstandingSequence: 7, memoryCanonicalHash: "a".repeat(64), questionKind: "NEXT_DECISION", idFactory: () => "127600fe-d3a1-4a29-928e-4810d8635e72" });
    expect(command.projectId).toBe("project-a");
    expect(projectBrainAssistantMemoryRoute("project-a")).toBe("/(app)/assistant?projectId=project-a");
  });

  it("shows frozen prepared payload and never asks for technical IDs", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(app)/assistant.tsx"), "utf8");
    expect(source).toContain("projectBrainAssistantMemory");
    expect(source).toContain("preparedAction");
    expect(source).not.toMatch(/>\s*(?:copy|paste)[^<]*(?:snapshot|candidate|memory)[^<]*id\s*</i);
  });
});
