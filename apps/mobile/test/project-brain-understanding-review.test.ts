import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mobileProjectBrainUnderstandingCommandSchema,
  projectBrainUnderstandingRoute,
  selectedContradictionCandidates,
} from "../src/lib/project-brain-understanding-review";

describe("mobile Project Brain understanding review", () => {
  it("opens from project navigation without upstream technical identifiers", () => {
    expect(projectBrainUnderstandingRoute("project-a")).toBe("/(app)/project-brain-understanding-review?projectId=project-a");
    const source = readFileSync(join(process.cwd(), "src/app/(app)/project-brain-understanding-review.tsx"), "utf8");
    const literals = source.match(/["'`][^"'`]*["'`]/g) ?? [];
    expect(literals.join("\n")).not.toMatch(/(?:paste|copy).*(?:batch|candidate|snapshot|intake).*id/i);
  });

  it("requires explicit contradiction selection and strict commands", () => {
    expect(selectedContradictionCandidates(["a"], "b")).toEqual(["a", "b"]);
    expect(selectedContradictionCandidates(["a", "b"], "a")).toEqual(["b"]);
    expect(() => mobileProjectBrainUnderstandingCommandSchema.parse({
      schemaVersion: 1,
      action: "RESOLVE_PROJECT_BRAIN_CONTRADICTION",
      commandId: "127600fe-d3a1-4a29-928e-4810d8635e72",
      workspaceId: "w", projectId: "p", reviewId: "r", expectedStateVersion: 1,
      contradictionId: "c", resolution: { mode: "AUTOMATIC" },
    })).toThrow();
  });
});
