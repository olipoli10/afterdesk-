import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const FLAG = "humanWorkUnitResumeEnabled";

function source(path: string): string {
  const absolute = join(ROOT, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("HumanWorkUnit rollout surface", () => {
  it("reads the rollout flag exactly once and only inside compileWorkflowForTask", () => {
    const workflowRuns = source("src/server/workflow-runs.ts");
    const compileStart = workflowRuns.indexOf("export async function compileWorkflowForTask");
    const flagRead = workflowRuns.indexOf(`settings.${FLAG}`);

    expect(compileStart, "compileWorkflowForTask must remain the admission boundary").toBeGreaterThan(-1);
    expect(occurrences(workflowRuns, `settings.${FLAG}`)).toBe(1);
    expect(flagRead).toBeGreaterThan(compileStart);
  });

  for (const path of [
    "src/server/human-unit.ts",
    "src/server/human-unit-resume.ts",
    "src/server/human-unit-deadlines.ts",
    "src/server/actions/human-unit-worker.ts",
    "src/server/actions/human-unit-admin.ts",
    "src/server/actions/va-tasks.ts",
  ]) {
    it(`${path} carries admitted work without a rollout gate`, () => {
      expect(occurrences(source(path), FLAG), `${FLAG} must not appear in ${path}`).toBe(0);
    });
  }
});
